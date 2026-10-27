"""Chatbot tools for the Tasks, Medication, Weather, Prayer Times and Community modules."""
import datetime
from unittest import mock

from django.contrib.auth.models import User
from django.test import TestCase

from accounts.models import UserProfile
from accounts.timezones import user_now
from community.models import Post
from habits.models import Habit
from medications.models import Medication, MedicationLog
from tasks.models import Task

from .tools import READ_ONLY, REGISTRY, ToolContext, run_tool


class ModuleToolTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user('y@test.com', 'y@test.com')
        self.profile = UserProfile.objects.create(user=self.user, selected_city='Lahore', timezone='Asia/Karachi')
        self.ctx = ToolContext(self.user)

    def test_contract_tools_are_registered(self):
        for name in ('list_tasks', 'create_task', 'update_task', 'get_medications_today', 'get_next_dose',
                     'log_medication', 'get_weather', 'get_prayer_times', 'share_streak'):
            self.assertIn(name, REGISTRY)
        self.assertTrue({'get_next_dose', 'get_weather', 'get_prayer_times'} <= READ_ONLY)
        self.assertNotIn('share_streak', READ_ONLY)

    def test_completing_a_task_sets_completed_at(self):
        run_tool(self.ctx, 'create_task', {'title': 'Report'})
        run_tool(self.ctx, 'update_task', {'task': 'Report', 'status': 'done'})
        self.assertIsNotNone(Task.objects.get().completed_at)
        run_tool(self.ctx, 'update_task', {'task': 'Report', 'status': 'pending'})
        self.assertIsNone(Task.objects.get().completed_at)

    def test_next_dose_and_slot_logging(self):
        Medication.objects.create(user=self.user, name='Panadol', dosage='500mg', frequency='twice_daily',
                                  schedule_times=['00:00', '23:59'], supply_count=5)
        result, err = run_tool(self.ctx, 'get_next_dose', {})
        self.assertFalse(err)
        self.assertEqual(result['next_dose']['name'], 'Panadol')

        result, err = run_tool(self.ctx, 'log_medication', {'medication': 'panadol'})
        self.assertFalse(err, result)
        self.assertIn(result['logged']['dose_time'], ('00:00', '23:59'))
        self.assertEqual(result['logged']['supply_left'], 4)
        _, err = run_tool(self.ctx, 'log_medication', {'medication': 'panadol', 'dose_time': '12:00'})
        self.assertTrue(err)  # not a scheduled time
        self.assertEqual(MedicationLog.objects.count(), 1)

    def test_as_needed_dose(self):
        Medication.objects.create(user=self.user, name='Brufen', dosage='400mg', frequency='as_needed', supply_count=3)
        result, err = run_tool(self.ctx, 'log_medication', {'medication': 'Brufen'})
        self.assertFalse(err)
        self.assertEqual(result['logged']['dose_time'], 'as needed')
        today, _ = run_tool(self.ctx, 'get_medications_today', {})
        self.assertTrue(today['medications'][0]['logged_today'][0]['as_needed'])

    @mock.patch('weather.services.lookup')
    def test_weather_uses_profile_city(self, lookup):
        lookup.return_value = {'city': 'Lahore', 'current': {'temp': 31, 'weather': [{'description': 'haze'}]},
                               'hourly': [], 'daily': [], 'alerts': [{'title': 'Extreme heat', 'message': 'Hot'}]}
        result, err = run_tool(self.ctx, 'get_weather', {})
        self.assertFalse(err)
        lookup.assert_called_with(city='Lahore')
        self.assertEqual(result['now']['conditions'], 'haze')
        self.assertEqual(result['alerts'][0]['title'], 'Extreme heat')

    @mock.patch('prayer.services.get_day')
    def test_prayer_times(self, get_day):
        get_day.return_value = {
            'date': '2026-10-27', 'times': {'Fajr': '04:53', 'Dhuhr': '11:46', 'Asr': '15:41', 'Maghrib': '17:18',
                                            'Isha': '18:40', 'Imsak': '04:43', 'Sunrise': '06:14'},
            'hijri': {'day': 16, 'month_name': 'Jumada al-ula', 'year': 1448}, 'is_ramadan': False,
            'timezone': 'Asia/Karachi', 'method': 'Karachi',
        }
        result, err = run_tool(self.ctx, 'get_prayer_times', {'city': 'Karachi'})
        self.assertFalse(err)
        self.assertEqual(result['times']['Asr'], '15:41')
        self.assertEqual(get_day.call_args.kwargs['address'], 'Karachi')
        self.assertEqual(get_day.call_args.kwargs['school'], 1)

    def test_city_needed_when_profile_has_none(self):
        self.profile.selected_city = ''
        self.profile.save()
        self.assertTrue(run_tool(self.ctx, 'get_weather', {})[1])

    def test_share_streak(self):
        self.assertTrue(run_tool(self.ctx, 'share_streak', {})[1])  # nothing to share yet
        Habit.objects.create(user_id=self.profile.external_user_id, name='Walk', streak_count=4, best_streak=4,
                             last_completed_date=user_now(self.user).date() - datetime.timedelta(days=1))
        result, err = run_tool(self.ctx, 'share_streak', {'habit': 'walk'})
        self.assertFalse(err, result)
        self.assertEqual(result['shared']['streak'], 4)
        self.assertEqual(Post.objects.get().meta['habit'], 'Walk')
