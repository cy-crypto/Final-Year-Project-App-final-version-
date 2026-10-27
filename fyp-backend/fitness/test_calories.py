import datetime
from decimal import Decimal
from unittest.mock import patch

from django.contrib.auth.models import User
from django.test import TestCase
from rest_framework.test import APIClient

from accounts.models import UserProfile
from .calories import VERSION, effective_calories, estimate_active_calories, refresh_today
from .models import FitnessGoal, FitnessProfile, FitnessRecord

UTC = datetime.timezone.utc
NOW = datetime.datetime(2026, 10, 27, 10, tzinfo=UTC)
BASE = '/api/fitness/'


class CalorieEstimationTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user('calorie@test.com')
        self.account = UserProfile.objects.create(user=self.user, timezone='Asia/Karachi')
        self.profile = FitnessProfile.objects.create(user_id=self.account.external_user_id, weight_kg=70, height_cm=170, age=25)
        self.client = APIClient(); self.client.force_authenticate(self.user)
        self.clock = patch('django.utils.timezone.now', return_value=NOW); self.clock.start(); self.addCleanup(self.clock.stop)

    def post_steps(self, steps, **extra):
        return self.client.post(BASE + 'records/', {'steps': steps, **extra}, format='json')

    def test_formula_against_independent_reference_examples(self):
        # 10,000 * (170 * .414 /100) = 7038 m; .1mL/kg/m *70kg *7038m /1000 *5 =246.33kcal.
        self.assertEqual(estimate_active_calories(10000, 70, 170), Decimal('246.33'))
        # 8,000 * .7452m = 5961.6m; 80kg *5.9616km *.5 =238.464 ->238.46.
        self.assertEqual(estimate_active_calories(8000, 80, 180), Decimal('238.46'))
        self.assertEqual(estimate_active_calories(1, '70.5', '175.5'), Decimal('0.03'))
        self.assertEqual(estimate_active_calories(0, 70, 170), 0)
        self.assertEqual(estimate_active_calories(10000, 140, 170), Decimal('492.66'))

    def test_pure_formula_missing_and_invalid_inputs(self):
        self.assertIsNone(estimate_active_calories(None, 70, 170))
        self.assertIsNone(estimate_active_calories(100, None, 170))
        self.assertIsNone(estimate_active_calories(100, 70, None))
        for args in [(-1, 70, 170), (1.5, 70, 170), (True, 70, 170), (100, 'NaN', 170), (100, 20, 170), (100, 70, 300)]:
            with self.assertRaises(ValueError): estimate_active_calories(*args)

    def test_profile_validation_ranges_and_decimals(self):
        for bad in [{'weight_kg': 24}, {'weight_kg': 351}, {'weight_kg': 'NaN'}, {'height_cm': 99}, {'height_cm': 251}, {'age': 17}, {'age': 121}, {'age': 25.5}, {'display_units': 'bad'}]:
            r = self.client.patch(BASE + 'profile/', bad, format='json'); self.assertEqual(r.status_code, 400, (bad, r.data))
        r = self.client.patch(BASE + 'profile/', {'weight_kg': '70.55', 'height_cm': '175.5', 'age': 26, 'display_units': 'imperial'}, format='json')
        self.assertEqual(r.status_code, 200, r.data)
        self.assertEqual((r.data['weight_kg'], r.data['height_cm'], r.data['age']), ('70.55', '175.5', 26))
        self.assertTrue(r.data['calorie_profile_ready'])

    def test_partial_incomplete_profile_does_not_block_existing_settings(self):
        r = self.client.patch(BASE + 'profile/', {'age': None, 'weight_kg': None, 'water_goal_ml': 2500}, format='json')
        self.assertEqual(r.status_code, 200); self.assertFalse(r.data['calorie_profile_ready'])
        self.assertEqual(r.data['water_goal_ml'], 2500)
        self.assertEqual(self.post_steps(10000).status_code, 201)
        self.assertIsNone(self.client.get(BASE + 'records/today/').data['estimated_active_calories'])

    def test_unknown_steps_are_not_recorded_zero(self):
        r = self.client.get(BASE + 'records/today/')
        self.assertFalse(r.data['steps_available']); self.assertIsNone(r.data['estimated_active_calories'])
        zero = self.post_steps(0)
        self.assertEqual(zero.status_code, 201, zero.data)
        self.assertTrue(zero.data['steps_available']); self.assertEqual(zero.data['estimated_active_calories'], '0.00')

    def test_steps_only_logged_not_added_and_metadata_persisted(self):
        first = self.post_steps(10000)
        self.assertEqual(first.status_code, 201, first.data)
        self.assertEqual(first.data['estimated_active_calories'], '246.33')
        metadata = first.data['calorie_estimate_metadata']
        self.assertEqual(metadata['version'], VERSION)
        self.assertEqual(metadata['steps'], 10000)
        self.assertEqual(metadata['weight_kg'], '70.00')
        self.assertEqual(metadata['height_cm'], '170.0')
        self.assertEqual(metadata['distance_m'], '7038.0000')
        self.assertTrue(metadata['resting_energy_excluded'])
        self.assertEqual(first.data['calories_burned'], '0.00')  # Original manual column is not overwritten.
        self.assertEqual(first.data['effective_calories_burned'], '246.33')

    def test_repeated_cumulative_sensor_readings_and_restarted_client(self):
        payload = {'step_source': 'sensor', 'steps_observed_at': NOW.isoformat()}
        a = self.post_steps(10000, **payload)
        b = self.post_steps(10000, **payload)
        self.assertEqual(a.data['id'], b.data['id'])
        self.assertEqual(a.data['calorie_estimate_metadata'], b.data['calorie_estimate_metadata'])
        self.assertEqual(FitnessRecord.objects.count(), 1)
        self.client = APIClient(); self.client.force_authenticate(self.user)
        for _ in range(3):
            r = self.client.get(BASE + 'records/today/'); self.assertEqual(r.data['estimated_active_calories'], '246.33')
        with patch('django.utils.timezone.now', return_value=NOW + datetime.timedelta(minutes=1)):
            r = self.post_steps(12000, step_source='sensor', steps_observed_at=(NOW + datetime.timedelta(minutes=1)).isoformat())
        self.assertEqual(r.data['estimated_active_calories'], '295.60')
        self.assertEqual(FitnessRecord.objects.count(), 1)

    def test_stale_future_naive_and_previous_day_sensor_snapshots_rejected(self):
        self.post_steps(10000, step_source='sensor', steps_observed_at=NOW.isoformat())
        for observed in [(NOW-datetime.timedelta(minutes=1)).isoformat(), (NOW+datetime.timedelta(minutes=5)).isoformat(), (NOW-datetime.timedelta(days=1)).isoformat(), '2026-10-27T10:00:00']:
            r = self.post_steps(5000, step_source='sensor', steps_observed_at=observed)
            self.assertEqual(r.status_code, 400, (observed, r.data))
        self.assertEqual(self.client.get(BASE + 'records/today/').data['steps'], 10000)

    def test_daily_timezone_boundary_and_no_cross_day_increment(self):
        prior = self.post_steps(10000)
        next_day = datetime.datetime(2026, 10, 27, 19, 1, tzinfo=UTC)  # Oct28 00:01 Karachi.
        with patch('django.utils.timezone.now', return_value=next_day):
            r = self.client.get(BASE + 'records/today/')
            self.assertEqual(r.data['date'], '2026-10-28'); self.assertFalse(r.data['steps_available'])
            r = self.post_steps(1000, step_source='sensor', steps_observed_at=next_day.isoformat())
            self.assertEqual(r.data['estimated_active_calories'], '24.63')
        historical = FitnessRecord.objects.get(pk=prior.data['id'])
        self.assertEqual(historical.estimated_active_calories, Decimal('246.33'))

    def test_repeated_dst_hour_uses_absolute_observation_order_and_same_local_day(self):
        self.account.timezone = 'America/New_York'; self.account.save()
        with patch('django.utils.timezone.now', return_value=datetime.datetime(2026, 11, 1, 7, tzinfo=UTC)):
            first = self.post_steps(1000, step_source='sensor', steps_observed_at='2026-11-01T01:30:00-04:00')
            second = self.post_steps(2000, step_source='sensor', steps_observed_at='2026-11-01T01:30:00-05:00')
        self.assertEqual(first.status_code, 201, first.data)
        self.assertEqual(second.status_code, 201, second.data)
        self.assertEqual(first.data['id'], second.data['id'])
        self.assertEqual(second.data['date'], '2026-11-01')
        self.assertEqual(second.data['estimated_active_calories'], '49.27')

    def test_today_form_cannot_overwrite_closed_day_after_midnight(self):
        old = self.post_steps(10000)
        with patch('django.utils.timezone.now', return_value=NOW + datetime.timedelta(days=1)):
            response = self.client.post(BASE + 'records/', {'date': old.data['date'], 'today_only': True, 'steps': 999}, format='json')
        self.assertEqual(response.status_code, 400, response.data)
        self.assertIn('today_only', response.data)
        record = FitnessRecord.objects.get(pk=old.data['id'])
        self.assertEqual(record.steps, 10000)
        self.assertEqual(record.estimated_active_calories, Decimal('246.33'))

    def test_profile_edit_refreshes_only_current_day_and_age_does_not_affect_formula(self):
        self.post_steps(10000)
        old_day = FitnessRecord.objects.create(user_id=self.account.external_user_id, date=NOW.date()-datetime.timedelta(days=1), steps=10000,
            estimated_active_calories='246.33', calorie_estimate_metadata={'version': VERSION, 'weight_kg': '70.00', 'height_cm': '170.0', 'steps': 10000})
        old_metadata = old_day.calorie_estimate_metadata.copy()
        self.assertEqual(self.client.patch(BASE + 'profile/', {'weight_kg': 80, 'height_cm': 180}, format='json').status_code, 200)
        r = self.client.get(BASE + 'records/today/')
        self.assertEqual(r.data['estimated_active_calories'], '298.08')
        old_day.refresh_from_db(); self.assertEqual(old_day.estimated_active_calories, Decimal('246.33')); self.assertEqual(old_day.calorie_estimate_metadata, old_metadata)
        self.client.patch(BASE + 'profile/', {'age': 70}, format='json')
        self.assertEqual(self.client.get(BASE + 'records/today/').data['estimated_active_calories'], '298.08')

    def test_legacy_history_is_not_backfilled_and_legacy_manual_value_preserved(self):
        past = FitnessRecord.objects.create(user_id=self.account.external_user_id, date=NOW.date()-datetime.timedelta(days=1), steps=10000, calories_burned=123)
        self.client.patch(BASE + 'profile/', {'weight_kg': 80}, format='json')
        trends = self.client.get(BASE + 'records/trends/').data
        self.assertEqual(trends[0]['estimated_active_calories'], None)
        self.assertEqual(trends[0]['effective_calories_burned'], '123.00')
        past.refresh_from_db(); self.assertEqual(past.calories_burned, Decimal('123'))

    def test_manual_source_precedence_and_clear_without_double_counting(self):
        r = self.post_steps(10000, calories_burned=400)
        self.assertEqual(r.data['estimated_active_calories'], '246.33')
        self.assertEqual((r.data['effective_calories_burned'], r.data['calorie_source']), ('400.00', 'manual'))
        r = self.client.post(BASE + 'records/', {'clear_manual_calories': True}, format='json')
        self.assertEqual((r.data['effective_calories_burned'], r.data['calorie_source']), ('246.33', 'walking_estimate'))
        r = self.client.post(BASE + 'records/', {'calories_burned': 0}, format='json')
        self.assertEqual((r.data['effective_calories_burned'], r.data['calorie_source']), ('0.00', 'manual'))

    def test_estimate_drives_existing_calorie_goal_and_durable_achievements(self):
        FitnessGoal.objects.create(user_id=self.account.external_user_id, goal_type='calories', target_value=200)
        self.post_steps(10000)
        goal = self.client.get(BASE + 'goals/').data[0]
        self.assertEqual(goal['progress']['current'], 246.33); self.assertTrue(goal['progress']['complete'])
        self.assertEqual(len(self.client.post(BASE + 'goals/achievements/').data), 1)
        self.assertEqual(self.client.post(BASE + 'goals/achievements/').data, [])
        self.client.post(BASE + 'records/', {'calories_burned': 100}, format='json')
        self.assertEqual(self.client.get(BASE + 'goals/').data[0]['progress']['current'], 100)

    def test_missing_measurements_do_not_fake_calorie_goal_progress(self):
        FitnessGoal.objects.create(user_id=self.account.external_user_id, goal_type='calories', target_value=200)
        self.client.patch(BASE + 'profile/', {'weight_kg': None}, format='json')
        self.post_steps(10000)
        progress = self.client.get(BASE + 'goals/').data[0]['progress']
        self.assertFalse(progress['available']); self.assertIsNone(progress['current'])

    def test_user_isolation_and_no_client_supplied_privileged_values(self):
        record = self.post_steps(10000)
        other = User.objects.create_user('calorie-other@test.com')
        other_account = UserProfile.objects.create(user=other, timezone='Asia/Karachi')
        self.client.force_authenticate(other)
        r = self.client.get(BASE + 'profile/'); self.assertIsNone(r.data['weight_kg'])
        r = self.client.patch(BASE + 'profile/', {'user_id': str(self.account.external_user_id), 'weight_kg': 90, 'height_cm': 190, 'age': 30}, format='json')
        self.assertEqual(r.status_code, 200)
        self.profile.refresh_from_db(); self.assertEqual(self.profile.weight_kg, Decimal('70'))
        self.assertEqual(FitnessProfile.objects.get(user_id=other_account.external_user_id).weight_kg, Decimal('90'))
        self.assertEqual(self.client.get(BASE + f"records/{record.data['id']}/").status_code, 404)
        self.assertEqual(self.client.patch(BASE + f"records/{record.data['id']}/", {'steps': 1}, format='json').status_code, 404)
        self.assertEqual(self.client.delete(BASE + f"records/{record.data['id']}/").status_code, 404)
        r = self.post_steps(1000, user_id=str(self.account.external_user_id), estimated_active_calories=9999, calorie_estimate_metadata={'version': 'fake'})
        self.assertNotEqual(r.data['calorie_estimate_metadata'].get('version'), 'fake')
        self.assertNotEqual(r.data['estimated_active_calories'], '9999')
        self.client.force_authenticate(None)
        for method, path, payload in [('get', 'profile/', {}), ('patch', 'profile/', {'weight_kg': 80}), ('post', 'records/', {'steps': 100})]:
            self.assertIn(getattr(self.client, method)(BASE + path, payload, format='json').status_code, [401, 403])

    def test_profile_edit_before_first_read_keeps_estimate_correct(self):
        record = FitnessRecord.objects.create(user_id=self.account.external_user_id, date=NOW.date(), steps=5000)
        self.client.patch(BASE + 'profile/', {'weight_kg': 80}, format='json')
        record.refresh_from_db(); self.assertEqual(record.estimated_active_calories, Decimal('140.76'))
        refresh_today(self.user, self.account.external_user_id)
        record.refresh_from_db(); self.assertEqual(effective_calories(record)[0], Decimal('140.76'))

    def test_partial_profile_save_does_not_restore_stale_measurements(self):
        self.post_steps(10000)
        stale = FitnessProfile.objects.get(pk=self.profile.pk)
        FitnessProfile.objects.filter(pk=self.profile.pk).update(weight_kg=80)
        with patch('fitness.views.FitnessProfileView._get_or_create', return_value=stale):
            r = self.client.patch(BASE + 'profile/', {'water_goal_ml': 3000}, format='json')
        self.assertEqual(r.status_code, 200, r.data)
        self.profile.refresh_from_db()
        self.assertEqual(self.profile.weight_kg, Decimal('80'))
        self.assertEqual(self.profile.water_goal_ml, 3000)
        self.assertEqual(self.client.get(BASE + 'records/today/').data['estimated_active_calories'], '281.52')

    def test_existing_assistant_writer_uses_canonical_day_and_known_zero(self):
        from assistant.tools import ToolContext, get_fitness_today, log_fitness
        ctx = ToolContext(self.user)
        midnight = datetime.datetime(2026, 10, 27, 19, 1, tzinfo=UTC)
        with patch('django.utils.timezone.now', return_value=midnight):
            log_fitness(ctx, steps=0)
            result = get_fitness_today(ctx)
            self.assertEqual(result['date'], '2026-10-28')
            self.assertTrue(result['steps_available'])
            self.assertEqual(result['estimated_active_calories'], '0.00')
            log_fitness(ctx, steps=10000)
            log_fitness(ctx, steps=10000)
            self.assertEqual(get_fitness_today(ctx)['estimated_active_calories'], '246.33')
            log_fitness(ctx, calories_burned=0)
            self.assertEqual(get_fitness_today(ctx)['calorie_source'], 'manual')
        self.assertEqual(FitnessRecord.objects.count(), 1)
