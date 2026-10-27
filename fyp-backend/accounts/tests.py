from django.contrib.auth.models import User
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from .dev_auth import DEMO_EMAIL
from .models import UserProfile


class ProfileApiTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user('p@test.com', 'p@test.com')
        self.client = APIClient()
        self.client.force_authenticate(self.user)

    def test_update_profile_timezone_and_preferences(self):
        res = self.client.patch('/auth/profile/', {
            'full_name': '  Yousif ', 'selected_city': 'Lahore', 'timezone': 'Asia/Karachi',
            'preferences': {'temperature_unit': 'F', 'notify_prayer': False},
        }, format='json')
        self.assertEqual(res.status_code, 200, res.data)
        self.assertEqual(res.data['full_name'], 'Yousif')
        self.assertEqual(res.data['preferences']['temperature_unit'], 'F')
        self.assertTrue(res.data['preferences']['notify_tasks'])  # defaults kept

        # A second update merges instead of replacing.
        res = self.client.patch('/auth/profile/', {'preferences': {'notify_tasks': False}}, format='json')
        self.assertFalse(res.data['preferences']['notify_prayer'])
        self.assertFalse(res.data['preferences']['notify_tasks'])

    def test_rejects_bad_values(self):
        for body in (
            {'timezone': 'Mars/Olympus'},
            {'preferences': {'colour': 'red'}},
            {'preferences': {'temperature_unit': 'K'}},
            {'preferences': {'notify_tasks': 'yes'}},
        ):
            self.assertEqual(self.client.patch('/auth/profile/', body, format='json').status_code, 400, body)

    def test_remove_avatar(self):
        self.client.patch('/auth/profile/', {'avatar_url': 'https://example.com/a.png'}, format='json')
        res = self.client.patch('/auth/profile/', {'remove_avatar': True}, format='json')
        self.assertEqual(res.data['avatar_url'], '')

    def test_summary(self):
        res = self.client.get('/auth/profile/summary/')
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data['tasks']['open'], 0)
        self.assertIn('adherence_7d', res.data['medication'])


class DevBypassTests(TestCase):
    @override_settings(DEV_AUTH_BYPASS=True)
    def test_bypass_uses_demo_user(self):
        res = APIClient().get('/auth/me/')
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data['email'], DEMO_EMAIL)
        self.assertEqual(UserProfile.objects.get(user__username=DEMO_EMAIL).full_name, 'Demo User')

    @override_settings(DEV_AUTH_BYPASS=False)
    def test_no_bypass_requires_auth(self):
        self.assertIn(APIClient().get('/auth/me/').status_code, (401, 403))
