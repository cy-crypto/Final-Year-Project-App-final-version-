from unittest import mock

from django.contrib.auth.models import User
from django.test import TestCase
from rest_framework.test import APIClient

from accounts.models import UserProfile

from . import services
from .services import WeatherAdapterError, severe_alerts


def payload(**current):
    base = {'temp': 25, 'wind_speed': 3, 'visibility': 10000, 'weather': [{'id': 800, 'main': 'Clear'}]}
    return {'city': 'Lahore', 'current': {**base, **current}, 'hourly': [], 'daily': []}


class SevereAlertTests(TestCase):
    def test_calm_weather_has_no_alerts(self):
        self.assertEqual(severe_alerts(payload()), [])

    def test_each_rule(self):
        cases = {
            'thunderstorm': payload(weather=[{'id': 211}]),
            'heavy_rain': payload(weather=[{'id': 502}]),
            'heat': payload(temp=44),
            'freezing': payload(temp=-2),
            'wind': payload(wind_speed=20),
            'dust': payload(weather=[{'id': 751}]),
            'visibility': payload(visibility=300),
        }
        for key, data in cases.items():
            self.assertEqual([a['id'] for a in severe_alerts(data)], [key], key)

    def test_forecast_hours_and_ordering(self):
        data = payload(wind_speed=16)
        data['hourly'] = [{'dt': 1, 'temp': 30, 'weather': [{'id': 202}]}]
        alerts = severe_alerts(data)
        self.assertEqual([a['id'] for a in alerts], ['thunderstorm', 'wind'])  # high severity first
        self.assertEqual(alerts[0]['starts'], 1)


@mock.patch.dict('os.environ', {'OPENWEATHER_API_KEY': 'test'})
class WeatherViewTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user('w@test.com', 'w@test.com')
        UserProfile.objects.create(user=self.user, selected_city='Lahore')
        self.client = APIClient()
        self.client.force_authenticate(self.user)

    @mock.patch.object(services.WeatherAdapter, 'get_by_city', return_value=payload(temp=45))
    def test_profile_city_and_alerts(self, by_city):
        res = self.client.get('/weather/')
        self.assertEqual(res.status_code, 200)
        by_city.assert_called_with('Lahore')
        self.assertEqual(res.data['alerts'][0]['id'], 'heat')

    @mock.patch.object(services.WeatherAdapter, 'get_by_coords', return_value=payload())
    @mock.patch.object(services.WeatherAdapter, 'get_by_city', side_effect=WeatherAdapterError('City not found.', 404))
    def test_gps_fallback_when_city_unknown(self, by_city, by_coords):
        res = self.client.get('/weather/?city=Nowhere&lat=31.5&lon=74.3')
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data['source'], 'gps')
        by_coords.assert_called_with(31.5, 74.3)

    @mock.patch.object(services.WeatherAdapter, 'get_by_city', side_effect=WeatherAdapterError('City not found.', 404))
    def test_unknown_city_without_gps(self, by_city):
        self.assertEqual(self.client.get('/weather/?city=Nowhere').status_code, 404)

    @mock.patch.dict('os.environ', {'OPENWEATHER_API_KEY': ''})
    def test_missing_key(self):
        self.assertEqual(self.client.get('/weather/?city=Lahore').status_code, 503)
