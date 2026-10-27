import datetime

from django.contrib.auth.models import User
from django.test import TestCase
from rest_framework.test import APIClient

from accounts.models import UserProfile
from accounts.timezones import user_now

from .models import Habit, HabitCompletion
from .services import complete_habit, streaks_from_dates, uncomplete_habit

D = datetime.date


class StreakTests(TestCase):
    def test_daily_streaks(self):
        habit = Habit(frequency='Daily')
        today = D(2026, 10, 27)
        dates = [D(2026, 10, 20), D(2026, 10, 21), D(2026, 10, 22), D(2026, 10, 25), D(2026, 10, 26)]
        self.assertEqual(streaks_from_dates(habit, dates, today), (2, 3))  # yesterday keeps it alive
        self.assertEqual(streaks_from_dates(habit, dates, D(2026, 10, 28)), (0, 3))  # a missed day breaks it

    def test_weekly_streak_uses_target(self):
        habit = Habit(frequency='Weekly', target_per_week=2)
        today = D(2026, 10, 28)  # Wednesday
        dates = [D(2026, 10, 13), D(2026, 10, 15),  # week of 12 Oct: 2 -> counts
                 D(2026, 10, 20), D(2026, 10, 22),  # week of 19 Oct: 2 -> counts
                 D(2026, 10, 27)]                   # this week: 1 so far, still in progress
        self.assertEqual(streaks_from_dates(habit, dates, today), (2, 2))

    def test_undo_and_backfill_recalculate(self):
        user_id = UserProfile.objects.create(user=User.objects.create_user('h@x.com')).external_user_id
        habit = Habit.objects.create(user_id=user_id, name='Read')
        today = D(2026, 10, 27)
        complete_habit(habit, today, D(2026, 10, 25))
        complete_habit(habit, today)
        self.assertEqual(habit.streak_count, 1)
        complete_habit(habit, today, D(2026, 10, 26))  # fill the gap
        self.assertEqual((habit.streak_count, habit.best_streak), (3, 3))
        uncomplete_habit(habit, today)
        self.assertEqual(habit.streak_count, 2)
        self.assertEqual(habit.last_completed_date, D(2026, 10, 26))


class HabitApiTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user('a@x.com')
        self.profile = UserProfile.objects.create(user=self.user, timezone='Asia/Karachi')
        self.client = APIClient()
        self.client.force_authenticate(self.user)
        self.today = user_now(self.user).date()

    def test_create_complete_undo(self):
        res = self.client.post('/habits/', {'name': ' Walk ', 'frequency': 'Weekly', 'target_per_week': 3,
                                            'category': 'Fitness', 'description': '20 minutes'}, format='json')
        self.assertEqual(res.status_code, 201, res.data)
        habit_id = res.data['id']
        self.assertEqual(res.data['name'], 'Walk')
        self.assertFalse(res.data['done_today'])

        res = self.client.post(f'/habits/{habit_id}/complete/')
        self.assertTrue(res.data['done_today'])
        self.assertEqual(res.data['week_count'], 1)
        self.assertTrue(res.data['last_7_days'][-1]['done'])

        res = self.client.post(f'/habits/{habit_id}/uncomplete/')
        self.assertFalse(res.data['done_today'])

    def test_backfill_limits(self):
        habit = Habit.objects.create(user_id=self.profile.external_user_id, name='Read')
        yesterday = (self.today - datetime.timedelta(days=1)).isoformat()
        self.assertEqual(self.client.post(f'/habits/{habit.id}/complete/', {'date': yesterday}, format='json').status_code, 200)
        future = (self.today + datetime.timedelta(days=1)).isoformat()
        old = (self.today - datetime.timedelta(days=10)).isoformat()
        self.assertEqual(self.client.post(f'/habits/{habit.id}/complete/', {'date': future}, format='json').status_code, 400)
        self.assertEqual(self.client.post(f'/habits/{habit.id}/complete/', {'date': old}, format='json').status_code, 400)

    def test_validation_archive_and_isolation(self):
        self.assertEqual(self.client.post('/habits/', {'name': '  '}, format='json').status_code, 400)
        self.assertEqual(self.client.post('/habits/', {'name': 'X', 'target_per_week': 9}, format='json').status_code, 400)
        habit = Habit.objects.create(user_id=self.profile.external_user_id, name='Old')
        self.client.patch(f'/habits/{habit.id}/', {'is_archived': True}, format='json')
        self.assertEqual(self.client.get('/habits/').data, [])
        self.assertEqual(len(self.client.get('/habits/?archived=1').data), 1)

        other = APIClient()
        other.force_authenticate(User.objects.create_user('b@x.com'))
        self.assertEqual(other.post(f'/habits/{habit.id}/complete/').status_code, 404)

    def test_stats(self):
        habit = Habit.objects.create(user_id=self.profile.external_user_id, name='Read',
                                     created_at=user_now(self.user) - datetime.timedelta(days=10))
        HabitCompletion.objects.create(habit=habit, completed_date=self.today)
        res = self.client.get('/habits/stats/?days=7')
        self.assertEqual(res.status_code, 200)
        self.assertEqual(len(res.data['days']), 7)
        self.assertEqual(res.data['today'], {'done': 1, 'total': 1})
        self.assertEqual(res.data['days'][-1]['rate'], 100)
