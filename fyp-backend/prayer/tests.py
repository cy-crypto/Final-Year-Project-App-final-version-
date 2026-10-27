import datetime
from unittest import mock

from django.contrib.auth.models import User
from django.core.cache import cache
from django.test import TestCase
from rest_framework.test import APIClient

from accounts.models import UserProfile

from . import services

KARACHI = datetime.timezone(datetime.timedelta(hours=5))


def fake_aladhan(month=5):
    return {
        'timings': {'Fajr': '04:53 (PKT)', 'Sunrise': '06:14', 'Dhuhr': '11:46', 'Asr': '15:41',
                    'Maghrib': '17:18', 'Isha': '18:40', 'Imsak': '04:43'},
        'date': {'hijri': {'day': '16', 'month': {'number': month, 'en': 'Jumada al-ula', 'ar': ''}, 'year': '1448',
                           'holidays': []}},
        'meta': {'timezone': 'Asia/Karachi', 'method': {'name': 'Karachi'}},
    }


class PrayerTests(TestCase):
    def setUp(self):
        cache.clear()
        self.user = User.objects.create_user('p@test.com', 'p@test.com')
        UserProfile.objects.create(user=self.user, selected_city='Lahore', timezone='Asia/Karachi')
        self.client = APIClient()
        self.client.force_authenticate(self.user)

    def test_qibla_bearing(self):
        # Reference values from https://api.aladhan.com/v1/qibla/{lat}/{lon}.
        self.assertAlmostEqual(services.qibla_bearing(31.5204, 74.3587), 260.37, delta=0.1)
        self.assertAlmostEqual(services.qibla_bearing(51.5074, -0.1278), 118.99, delta=0.1)

    @mock.patch.object(services, '_fetch', return_value=fake_aladhan())
    def test_times_by_coordinates_are_cached(self, fetch):
        res = self.client.get('/api/prayer/times/?lat=31.52&lon=74.35&days=2')
        self.assertEqual(res.status_code, 200, res.data)
        self.assertEqual(len(res.data['days']), 2)
        self.assertEqual(res.data['days'][0]['times']['Fajr'], '04:53')
        self.assertFalse(res.data['days'][0]['is_ramadan'])
        self.assertIsNotNone(res.data['qibla'])
        self.assertIn('school=1', fetch.call_args.args[0])  # Hanafi default from preferences
        self.client.get('/api/prayer/times/?lat=31.52&lon=74.35&days=2')
        self.assertEqual(fetch.call_count, 2)  # second request served from cache

    @mock.patch.object(services, '_fetch', return_value=fake_aladhan(month=9))
    def test_profile_city_fallback_and_ramadan(self, fetch):
        res = self.client.get('/api/prayer/times/')
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data['location']['city'], 'Lahore')
        self.assertTrue(res.data['days'][0]['is_ramadan'])
        self.assertIn('timingsByAddress', fetch.call_args.args[0])

    def test_validation(self):
        UserProfile.objects.filter(user=self.user).update(selected_city='')
        self.assertEqual(self.client.get('/api/prayer/times/').status_code, 400)
        self.assertEqual(self.client.get('/api/prayer/times/?lat=200&lon=1').status_code, 400)

    def test_next_prayer(self):
        entry = services._normalize(fake_aladhan(), datetime.date(2026, 10, 27))
        now = datetime.datetime(2026, 10, 27, 12, 0, tzinfo=KARACHI)
        nxt = services.next_prayer([entry], now)
        self.assertEqual(nxt['name'], 'Asr')
        self.assertEqual(nxt['minutes_left'], 221)
        late = datetime.datetime(2026, 10, 27, 23, 0, tzinfo=KARACHI)
        self.assertIsNone(services.next_prayer([entry], late))
