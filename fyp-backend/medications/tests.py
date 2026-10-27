import datetime
from unittest import mock

from django.contrib.auth.models import User
from django.test import TestCase
from rest_framework.test import APIClient

from accounts.models import UserProfile

from . import services
from .models import Medication, MedicationLog

KARACHI = datetime.timezone(datetime.timedelta(hours=5))


def at(day, hhmm):
    h, m = (int(x) for x in hhmm.split(':'))
    return datetime.datetime(day.year, day.month, day.day, h, m, tzinfo=KARACHI)


class MedicationScheduleTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user('m@test.com', 'm@test.com')
        UserProfile.objects.create(user=self.user, timezone='Asia/Karachi')
        self.client = APIClient()
        self.client.force_authenticate(self.user)
        self.day = datetime.date(2026, 10, 27)  # a Tuesday

    def med(self, **kw):
        defaults = dict(user=self.user, name='Panadol', dosage='500mg', frequency='twice_daily',
                        schedule_times=['08:00', '20:00'], supply_count=10, refill_threshold=3)
        defaults.update(kw)
        return Medication.objects.create(**defaults)

    def test_validation_edge_cases(self):
        bad = [
            {'frequency': 'twice_daily', 'schedule_times': ['08:00']},
            {'frequency': 'daily', 'schedule_times': ['25:00']},
            {'frequency': 'daily', 'schedule_times': ['08:00', '08:00']},
            {'frequency': 'weekly', 'schedule_times': ['08:00'], 'days_of_week': []},
            {'frequency': 'daily', 'schedule_times': ['08:00'], 'start_date': '2026-10-10', 'end_date': '2026-10-01'},
        ]
        for extra in bad:
            res = self.client.post('/medications/', {'name': 'X', 'dosage': '1', **extra}, format='json')
            self.assertEqual(res.status_code, 400, extra)

        res = self.client.post('/medications/', {'name': 'Y', 'dosage': '1', 'frequency': 'daily',
                                                 'schedule_times': ['20:00', '8:00']}, format='json')
        self.assertEqual(res.status_code, 201, res.data)
        self.assertEqual(res.data['schedule_times'], ['08:00', '20:00'])
        res = self.client.post('/medications/', {'name': 'Z', 'dosage': '1', 'frequency': 'as_needed',
                                                 'schedule_times': ['08:00']}, format='json')
        self.assertEqual(res.data['schedule_times'], [])

    def test_slot_states_and_next_dose(self):
        self.med()
        now = at(self.day, '09:30')  # 08:00 slot is 90 minutes old -> missed
        slots = services.day_schedule(self.user, self.day, now)
        self.assertEqual([s['status'] for s in slots], ['missed', 'upcoming'])
        self.assertEqual(services.next_dose(self.user, now)['time'], '20:00')

        self.assertEqual(services.day_schedule(self.user, self.day, at(self.day, '08:20'))[0]['status'], 'due')

    def test_weekly_and_date_range(self):
        self.med(frequency='weekly', schedule_times=['09:00'], days_of_week=[0])  # Mondays
        self.med(name='Course', frequency='daily', schedule_times=['10:00'],
                 start_date=self.day + datetime.timedelta(days=1))
        now = at(self.day, '07:00')
        self.assertEqual(services.day_schedule(self.user, self.day, now), [])
        monday = self.day - datetime.timedelta(days=1)
        self.assertEqual(len(services.day_schedule(self.user, monday, now)), 1)

    def test_log_updates_slot_and_supply(self):
        med = self.med(dose_units=2)
        with mock.patch.object(services, 'user_now', return_value=at(self.day, '08:05')):
            services.log_dose(self.user, med, 'taken', '08:00')
            services.log_dose(self.user, med, 'taken', '08:00')  # double tap: no double count
            med.refresh_from_db()
            self.assertEqual(med.supply_count, 8)
            self.assertEqual(MedicationLog.objects.count(), 1)

            services.log_dose(self.user, med, 'skipped', '08:00')  # changed mind: supply back
            med.refresh_from_db()
            self.assertEqual(med.supply_count, 10)

            with self.assertRaises(services.DoseError):
                services.log_dose(self.user, med, 'taken', '13:00')
            with self.assertRaises(services.DoseError):
                services.log_dose(self.user, med, 'taken', '08:00', day=self.day + datetime.timedelta(days=1))

    def test_supply_never_negative_and_refill_flag(self):
        med = self.med(supply_count=1, dose_units=2)
        with mock.patch.object(services, 'user_now', return_value=at(self.day, '08:05')):
            services.log_dose(self.user, med, 'taken', '08:00')
        med.refresh_from_db()
        self.assertEqual(med.supply_count, 0)
        self.assertTrue(med.needs_refill)

    def test_api_today_log_and_history(self):
        med = self.med()
        res = self.client.post(f'/medications/{med.id}/log/', {'status': 'taken', 'dose_time': '08:00'}, format='json')
        self.assertEqual(res.status_code, 201, res.data)
        self.assertEqual(res.data['medication']['supply_count'], 9)

        res = self.client.get('/medications/today/')
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data['total'], 2)
        self.assertEqual(res.data['taken'], 1)

        self.assertEqual(len(self.client.get(f'/medication-logs/?medication={med.id}').data), 1)
        self.assertEqual(len(self.client.get('/medication-logs/?status=skipped').data), 0)
        self.assertEqual(self.client.get('/medications/adherence/?days=7').status_code, 200)

    def test_other_users_medication_is_hidden(self):
        other = User.objects.create_user('o@test.com', 'o@test.com')
        med = self.med(user=other)
        self.assertEqual(self.client.post(f'/medications/{med.id}/log/', {}, format='json').status_code, 404)
        res = self.client.post('/medication-logs/', {'medication': med.id, 'status': 'taken',
                                                     'scheduled_time': '2026-10-27T08:00:00Z'}, format='json')
        self.assertEqual(res.status_code, 400)
