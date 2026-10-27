import datetime
from decimal import Decimal
from unittest.mock import patch
from zoneinfo import ZoneInfo

from django.contrib.auth.models import User
from django.db import IntegrityError, transaction
from django.test import TestCase
from rest_framework.test import APIClient

from accounts.models import UserProfile
from .models import FitnessAchievement, FitnessGoal, FitnessRecord, SleepRecord
from .services import elapsed_minutes, goal_period, goal_progress, sleep_summary

UTC = datetime.timezone.utc
NOW = datetime.datetime(2026, 10, 27, 10, tzinfo=UTC)
BASE = '/api/fitness/'


class FitnessFeatureTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user('fitness@test.com')
        self.profile = UserProfile.objects.create(user=self.user, timezone='Asia/Karachi')
        self.other = User.objects.create_user('other@test.com')
        self.other_profile = UserProfile.objects.create(user=self.other, timezone='America/New_York')
        self.client = APIClient()
        self.client.force_authenticate(self.user)

    def goal(self, kind='steps', target=100, **kwargs):
        return FitnessGoal.objects.create(user_id=self.profile.external_user_id, goal_type=kind, target_value=target, **kwargs)

    def sleep(self, bed='2026-10-25T23:00:00+05:00', wake='2026-10-26T07:00:00+05:00'):
        with patch('fitness.serializers.timezone.now', return_value=NOW):
            return self.client.post(BASE + 'sleep/', {'bedtime': bed, 'wake_time': wake}, format='json')

    def test_goal_positive_and_integer_validation(self):
        for kind, target in [('steps', 0), ('calories', -1), ('steps', '1.5'), ('workout_frequency', '2.2'), ('steps', 'NaN'), ('calories', 'Infinity')]:
            response = self.client.post(BASE + 'goals/', {'goal_type': kind, 'target_value': target}, format='json')
            self.assertEqual(response.status_code, 400, response.data)
        response = self.client.post(BASE + 'goals/', {'goal_type': 'calories', 'target_value': '100.25'}, format='json')
        self.assertEqual(response.status_code, 201, response.data)

    def test_upsert_prevents_duplicate_active_goals_and_preserves_archives(self):
        payload = {'goal_type': 'steps', 'target_value': 100}
        first = self.client.post(BASE + 'goals/', payload, format='json')
        second = self.client.post(BASE + 'goals/', {**payload, 'target_value': 200}, format='json')
        self.assertEqual(first.data['id'], second.data['id'])
        self.assertEqual(FitnessGoal.objects.count(), 1)
        self.assertEqual(self.client.patch(BASE + f"goals/{first.data['id']}/", {'is_active': False}, format='json').status_code, 200)
        third = self.client.post(BASE + 'goals/', payload, format='json')
        self.assertNotEqual(first.data['id'], third.data['id'])
        self.assertEqual(FitnessGoal.objects.count(), 2)
        response = self.client.patch(BASE + f"goals/{first.data['id']}/", {'is_active': True}, format='json')
        self.assertEqual(response.status_code, 400)

    def test_database_rejects_duplicate_active_goal(self):
        self.goal()
        with self.assertRaises(IntegrityError), transaction.atomic():
            self.goal()

    def test_daily_boundary_uses_local_date(self):
        now = datetime.datetime(2026, 10, 26, 20, tzinfo=UTC)
        self.assertEqual(goal_period('steps', self.user, now), (datetime.date(2026, 10, 27), datetime.date(2026, 10, 28)))

    def test_monday_week_boundary_and_timezone(self):
        self.profile.timezone = 'America/New_York'; self.profile.save()
        # UTC Monday is still Sunday in New York.
        now = datetime.datetime(2026, 10, 26, 2, tzinfo=UTC)
        self.assertEqual(goal_period('workout_frequency', self.user, now), (datetime.date(2026, 10, 19), datetime.date(2026, 10, 26)))
        self.assertEqual(goal_period('workout_frequency', self.user, NOW)[0], datetime.date(2026, 10, 26))

    def test_actual_progress_and_no_cross_user_or_previous_day_counts(self):
        goal = self.goal()
        FitnessRecord.objects.create(user_id=goal.user_id, date='2026-10-27', steps=120, calories_burned=Decimal('55.25'))
        FitnessRecord.objects.create(user_id=goal.user_id, date='2026-10-26', steps=9999)
        FitnessRecord.objects.create(user_id=self.other_profile.external_user_id, date='2026-10-27', steps=9999)
        p = goal_progress(goal, self.user, NOW)
        self.assertEqual((p['current'], p['remaining'], p['percent'], p['complete']), (120, 0, 100, True))
        calories = self.goal('calories', 100)
        self.assertEqual(goal_progress(calories, self.user, NOW)['remaining'], 44.75)

    def test_missing_data_is_not_zero_and_exercises_are_not_sessions(self):
        self.assertFalse(goal_progress(self.goal(), self.user, NOW)['available'])
        FitnessRecord.objects.create(user_id=self.profile.external_user_id, date='2026-10-27', workout_log=[{'exercise': 'Squat'}, {'exercise': 'Run'}])
        # An exercise-only record's untouched default zero does not establish a step reading.
        self.assertIsNone(goal_progress(FitnessGoal.objects.get(goal_type='steps'), self.user, NOW)['current'])
        p = goal_progress(self.goal('workout_frequency', 3), self.user, NOW)
        self.assertFalse(p['available']); self.assertIsNone(p['current'])

    def test_editing_target_preserves_records(self):
        goal = self.goal()
        record = FitnessRecord.objects.create(user_id=goal.user_id, date='2026-10-27', steps=123)
        self.client.patch(BASE + f'goals/{goal.pk}/', {'target_value': 500}, format='json')
        record.refresh_from_db(); self.assertEqual(record.steps, 123)

    def test_achievement_once_per_goal_period_including_target_edits(self):
        goal = self.goal()
        FitnessRecord.objects.create(user_id=goal.user_id, date='2026-10-27', steps=150)
        with patch('fitness.services.timezone.now', return_value=NOW):
            self.assertEqual(len(self.client.post(BASE + 'goals/achievements/').data), 1)
            self.assertEqual(self.client.post(BASE + 'goals/achievements/').data, [])
            self.client.patch(BASE + f'goals/{goal.pk}/', {'target_value': 50}, format='json')
            self.assertEqual(self.client.post(BASE + 'goals/achievements/').data, [])
        self.assertEqual(FitnessAchievement.objects.count(), 1)
        FitnessRecord.objects.create(user_id=goal.user_id, date='2026-10-28', steps=150)
        with patch('fitness.services.timezone.now', return_value=NOW + datetime.timedelta(days=1)):
            self.assertEqual(len(self.client.post(BASE + 'goals/achievements/').data), 1)

    def test_unreached_goals_do_not_achieve(self):
        self.goal()
        with patch('fitness.services.timezone.now', return_value=NOW):
            self.assertEqual(self.client.post(BASE + 'goals/achievements/').data, [])
        self.assertEqual(FitnessAchievement.objects.count(), 0)

    def test_sleep_overnight_and_utc_persistence(self):
        r = self.sleep()
        self.assertEqual(r.status_code, 201, r.data)
        self.assertEqual(r.data['duration_minutes'], 480)
        self.assertEqual(r.data['wake_date'], '2026-10-26')
        record = SleepRecord.objects.get()
        self.assertEqual(record.wake_time.hour, 2)
        self.assertIsNotNone(record.wake_time.tzinfo)

    def test_invalid_sleep_and_future_dates(self):
        for bed, wake in [
            ('invalid', '2026-10-26T07:00:00Z'),
            ('2026-02-30T23:00:00Z', '2026-10-26T07:00:00Z'),
            ('2026-10-25T23:00:00', '2026-10-26T07:00:00Z'),
            ('2026-10-26T07:00:00Z', '2026-10-26T07:00:00Z'),
            ('2026-10-26T08:00:00Z', '2026-10-26T07:00:00Z'),
            ('2026-10-28T23:00:00Z', '2026-10-29T07:00:00Z'),
        ]:
            r = self.sleep(bed, wake); self.assertEqual(r.status_code, 400, (bed, r.data))

    def test_overlaps_containment_and_duplicates_rejected_adjacent_allowed(self):
        self.sleep()
        for bed, wake in [('2026-10-26T06:00:00+05:00', '2026-10-26T08:00:00+05:00'),
                          ('2026-10-25T22:00:00+05:00', '2026-10-26T08:00:00+05:00'),
                          ('2026-10-26T01:00:00+05:00', '2026-10-26T02:00:00+05:00')]:
            self.assertEqual(self.sleep(bed, wake).status_code, 400)
        self.assertEqual(self.sleep().status_code, 400)
        self.assertEqual(self.sleep('2026-10-26T07:00:00+05:00', '2026-10-26T08:00:00+05:00').status_code, 201)

    def test_sleep_edit_excludes_self_but_rejects_other_overlap(self):
        a = self.sleep()
        b = self.sleep('2026-10-26T12:00:00+05:00', '2026-10-26T13:00:00+05:00')
        url = BASE + f"sleep/{a.data['id']}/"
        self.assertEqual(self.client.patch(url, {'bedtime': a.data['bedtime']}, format='json').status_code, 200)
        self.assertEqual(self.client.patch(url, {'wake_time': b.data['wake_time']}, format='json').status_code, 400)
        self.assertEqual(self.client.delete(url).status_code, 204)
        self.assertEqual(SleepRecord.objects.count(), 1)

    def test_sleep_dst_spring_forward_and_fall_back(self):
        for bed, wake, minutes in [('2026-03-08T01:30:00-05:00', '2026-03-08T03:30:00-04:00', 60),
                                   ('2025-11-02T01:30:00-04:00', '2025-11-02T01:30:00-05:00', 60)]:
            r = self.sleep(bed, wake); self.assertEqual(r.status_code, 201, r.data)
            self.assertEqual(r.data['duration_minutes'], minutes)
        tz = ZoneInfo('America/New_York')
        self.assertEqual(elapsed_minutes(datetime.datetime(2026, 3, 8, 1, 30, tzinfo=tz), datetime.datetime(2026, 3, 8, 3, 30, tzinfo=tz)), 60)

    def test_summary_combines_sessions_counts_recorded_nights_not_missing_dates(self):
        self.sleep()
        self.sleep('2026-10-26T12:00:00+05:00', '2026-10-26T13:00:00+05:00')
        self.sleep('2026-10-26T23:00:00+05:00', '2026-10-27T06:00:00+05:00')
        self.sleep('2026-10-19T23:00:00+05:00', '2026-10-20T06:00:00+05:00')
        s = sleep_summary(self.user, self.profile.external_user_id, NOW)
        self.assertEqual(s['recorded_nights'], 2)
        self.assertEqual(s['average_minutes'], 480)
        self.assertEqual(s['days'][-2]['duration_minutes'], 540)
        self.assertIsNone(s['days'][0]['duration_minutes'])

    def test_empty_summary_and_local_wake_date_boundary(self):
        s = sleep_summary(self.user, self.profile.external_user_id, NOW)
        self.assertIsNone(s['average_minutes']); self.assertEqual(s['recorded_nights'], 0)
        r = self.sleep('2026-10-26T18:00:00Z', '2026-10-26T20:00:00Z')
        self.assertEqual(r.data['wake_date'], '2026-10-27')
        self.assertEqual(sleep_summary(self.user, self.profile.external_user_id, NOW)['days'][-1]['duration_minutes'], 120)

    def test_user_isolation_and_unauthorized_access(self):
        goal = self.goal(); sleep = self.sleep()
        self.client.force_authenticate(self.other)
        self.assertEqual(self.client.get(BASE + 'goals/').data, [])
        self.assertEqual(self.client.get(BASE + 'sleep/').data['results'], [])
        self.assertEqual(self.client.get(BASE + 'sleep/summary/').data['recorded_nights'], 0)
        for path in [f'goals/{goal.pk}/', f"sleep/{sleep.data['id']}/"]:
            for method in ['get', 'patch', 'delete']:
                self.assertEqual(getattr(self.client, method)(BASE + path, {}, format='json').status_code, 404)
        # Submitted ownership fields and query/header IDs cannot impersonate the owner.
        self.client.credentials(HTTP_X_USER_ID=str(self.profile.external_user_id))
        r = self.client.post(BASE + 'goals/', {'goal_type': 'calories', 'target_value': 10, 'user_id': str(self.profile.external_user_id)}, format='json')
        self.assertEqual(r.status_code, 201, r.data)
        self.assertEqual(str(FitnessGoal.objects.get(pk=r.data['id']).user_id), str(self.other_profile.external_user_id))
        self.assertEqual(self.sleep().status_code, 201)  # Other user's identical interval is allowed.
        self.client.force_authenticate(None); self.client.credentials()
        for path in ['goals/', 'sleep/', 'sleep/summary/', 'records/today/', 'profile/', 'water/today/', 'routines/']:
            self.assertIn(self.client.get(BASE + path).status_code, [401, 403])
        self.assertIn(self.client.post(BASE + 'goals/achievements/').status_code, [401, 403])

    def test_existing_fitness_flows_preserved(self):
        r = self.client.post(BASE + 'records/', {'steps': 300, 'calories_burned': 30, 'sleep_duration_minutes': 420}, format='json')
        self.assertEqual(r.status_code, 201, r.data)
        self.assertEqual(self.client.post(BASE + 'records/', {'date': r.data['date'], 'steps': 400}, format='json').data['sleep_duration_minutes'], 420)
        routine = self.client.post(BASE + 'routines/', {'name': 'Morning', 'exercises': [{'exercise': 'Walk', 'duration_min': 20}]}, format='json')
        self.assertEqual(routine.status_code, 201, routine.data)
        logged = self.client.post(BASE + f"routines/{routine.data['id']}/log/")
        self.assertEqual(logged.status_code, 200); self.assertEqual(logged.data['steps'], 400)
        self.assertEqual(self.client.post(BASE + 'water/', {'amount_ml': 250}, format='json').status_code, 201)
        self.assertEqual(self.client.get(BASE + 'water/today/').data['amount_ml'], 250)
        self.assertEqual(self.client.patch(BASE + 'profile/', {'height_cm': 170}, format='json').status_code, 200)

    def test_sleep_history_pagination_and_order(self):
        for i in range(31):
            wake = NOW - datetime.timedelta(days=i + 1)
            SleepRecord.objects.create(user_id=self.profile.external_user_id, bedtime=wake-datetime.timedelta(hours=7), wake_time=wake)
        r = self.client.get(BASE + 'sleep/')
        self.assertEqual(r.data['count'], 31); self.assertEqual(len(r.data['results']), 30)
        self.assertIsNotNone(r.data['next'])
        self.assertEqual(len(self.client.get(BASE + 'sleep/?page=2').data['results']), 1)
