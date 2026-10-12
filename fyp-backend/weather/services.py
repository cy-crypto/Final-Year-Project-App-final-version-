import json
from datetime import timedelta
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import urlopen

from django.utils import timezone

from .models import WeatherCache


class WeatherAdapterError(Exception):
    def __init__(self, message: str, status_code: int = 502):
        super().__init__(message)
        self.status_code = status_code


def _extract_upstream_message(exc: HTTPError) -> str:
    raw = exc.read().decode('utf-8') if exc.fp else '{}'
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        return 'Failed to fetch weather data.'

    message = data.get('message') if isinstance(data, dict) else None
    return message or 'Failed to fetch weather data.'


class WeatherAdapter:
    def __init__(self, api_key: str, cache_ttl: int = 1800):
        self.api_key = api_key
        self.cache_ttl = cache_ttl

    def get_by_city(self, city: str) -> dict:
        city_clean = city.strip()
        if not city_clean:
            raise WeatherAdapterError('City is required.', 400)

        city_key = city_clean.lower()
        cached = self._get_cached(city_key)
        if cached:
            return cached

        payload = self._fetch_one_call(city_clean)
        self._set_cached(city_key, city_clean, payload)
        return payload

    def geocode_city(self, city: str):
        try:
            return self._geocode_city(city)
        except HTTPError as exc:
            message = _extract_upstream_message(exc)
            raise WeatherAdapterError(message, exc.code)
        except (URLError, TimeoutError, json.JSONDecodeError):
            raise WeatherAdapterError('Failed to fetch weather data.', 502)

    def _get_cached(self, city_key: str):
        cutoff = timezone.now() - timedelta(seconds=self.cache_ttl)
        cached = WeatherCache.objects.filter(city_key=city_key, fetched_at__gte=cutoff).first()
        if not cached:
            return None
        return cached.payload

    def _set_cached(self, city_key: str, city_name: str, payload: dict):
        WeatherCache.objects.update_or_create(
            city_key=city_key,
            defaults={
                'city_name': city_name,
                'payload': payload,
                'fetched_at': timezone.now(),
            },
        )

    def _geocode_city(self, city: str):
        query = urlencode({'q': city, 'limit': 1, 'appid': self.api_key})
        url = f'https://api.openweathermap.org/geo/1.0/direct?{query}'
        with urlopen(url, timeout=10) as resp:
            data = json.loads(resp.read().decode('utf-8'))
            if not data:
                return None
            item = data[0]
            return {
                'name': item.get('name'),
                'lat': item.get('lat'),
                'lon': item.get('lon'),
                'country': item.get('country'),
            }

    def _fetch_one_call(self, city: str) -> dict:
        # Free plan: always use 2.5 weather + 3-hour forecast data.
        try:
            coords = self._geocode_city(city)
        except HTTPError as exc:
            message = _extract_upstream_message(exc)
            raise WeatherAdapterError(message, exc.code)
        except (URLError, TimeoutError, json.JSONDecodeError):
            raise WeatherAdapterError('Failed to fetch weather data.', 502)

        if not coords or coords.get('lat') is None or coords.get('lon') is None:
            raise WeatherAdapterError('City not found.', 404)

        return self._fetch_forecast_fallback(city, coords)

    def _fetch_forecast_fallback(self, city: str, coords: dict) -> dict:
        try:
            query = urlencode({'q': city, 'appid': self.api_key, 'units': 'metric'})
            url = f'https://api.openweathermap.org/data/2.5/weather?{query}'
            with urlopen(url, timeout=10) as response:
                payload = json.loads(response.read().decode('utf-8'))
        except HTTPError as exc:
            message = _extract_upstream_message(exc)
            status_code = exc.code if exc.code else 502
            raise WeatherAdapterError(message, status_code)
        except (URLError, TimeoutError, json.JSONDecodeError):
            raise WeatherAdapterError('Failed to fetch weather data.', 502)

        hourly_items = []
        daily_groups: dict = {}
        try:
            forecast_query = urlencode({'q': city, 'appid': self.api_key, 'units': 'metric'})
            forecast_url = f'https://api.openweathermap.org/data/2.5/forecast?{forecast_query}'
            with urlopen(forecast_url, timeout=10) as fresp:
                forecast_payload = json.loads(fresp.read().decode('utf-8'))
                for item in forecast_payload.get('list', []):
                    hourly_items.append({
                        'dt': item.get('dt'),
                        'temp': item.get('main', {}).get('temp'),
                        'pop': item.get('pop'),
                        'humidity': item.get('main', {}).get('humidity'),
                        'weather': item.get('weather'),
                    })
                    dt_value = int(item.get('dt', 0) or 0)
                    dt = timezone.datetime.utcfromtimestamp(dt_value)
                    key = dt.date().isoformat()
                    entry = daily_groups.setdefault(key, {'temps': [], 'dt': dt_value, 'pops': [], 'humidities': []})
                    entry['temps'].append(item.get('main', {}).get('temp'))
                    entry['pops'].append(item.get('pop'))
                    entry['humidities'].append(item.get('main', {}).get('humidity'))
        except Exception:
            hourly_items = []
            daily_groups = {}

        daily = []
        for date_key, data in list(daily_groups.items())[:7]:
            temps = data.get('temps', [])
            pops = [p for p in data.get('pops', []) if isinstance(p, (int, float))]
            humidities = [h for h in data.get('humidities', []) if isinstance(h, (int, float))]
            cleaned_min = min([t for t in temps if t is not None]) if any(t is not None for t in temps) else None
            cleaned_max = max([t for t in temps if t is not None]) if any(t is not None for t in temps) else None
            cleaned_pop = max(pops) if pops else None
            cleaned_humidity = round(sum(humidities) / len(humidities)) if humidities else None
            date_ts = int(data.get('dt') or 0)
            if not date_ts:
                try:
                    dt_obj = timezone.datetime.strptime(date_key, '%Y-%m-%d')
                    dt_midnight = timezone.make_aware(
                        timezone.datetime(dt_obj.year, dt_obj.month, dt_obj.day), timezone.utc
                    )
                    date_ts = int(dt_midnight.timestamp())
                except Exception:
                    date_ts = 0
            daily.append({
                'date': date_ts,
                'temp_min': cleaned_min,
                'temp_max': cleaned_max,
                'pop': cleaned_pop,
                'humidity': cleaned_humidity,
            })

        return {
            'city': payload.get('name') or city,
            'lat': payload.get('coord', {}).get('lat'),
            'lon': payload.get('coord', {}).get('lon'),
            'current': {
                'temp': payload.get('main', {}).get('temp'),
                'humidity': payload.get('main', {}).get('humidity'),
                'feels_like': payload.get('main', {}).get('feels_like'),
                'temp_min': payload.get('main', {}).get('temp_min'),
                'temp_max': payload.get('main', {}).get('temp_max'),
                'pressure': payload.get('main', {}).get('pressure'),
                'visibility': payload.get('visibility'),
                'clouds': payload.get('clouds', {}).get('all'),
                'wind_speed': payload.get('wind', {}).get('speed'),
                'wind_deg': payload.get('wind', {}).get('deg'),
                'sunrise': payload.get('sys', {}).get('sunrise'),
                'sunset': payload.get('sys', {}).get('sunset'),
                'weather': payload.get('weather'),
            },
            'hourly': hourly_items[:12],
            'daily': daily,
        }

    def get_uv_index(self, lat: float, lon: float) -> dict:
        """Fetch UV Index data from OpenWeatherMap"""
        try:
            query = urlencode({'lat': lat, 'lon': lon, 'appid': self.api_key})
            url = f'https://api.openweathermap.org/data/2.5/uvi?{query}'
            with urlopen(url, timeout=10) as response:
                payload = json.loads(response.read().decode('utf-8'))
                return {
                    'uv_index': payload.get('value'),
                    'uv_date': payload.get('date_iso'),
                }
        except HTTPError as exc:
            message = _extract_upstream_message(exc)
            raise WeatherAdapterError(message, exc.code)
        except (URLError, TimeoutError, json.JSONDecodeError):
            raise WeatherAdapterError('Failed to fetch UV index data.', 502)

    def get_air_pollution(self, lat: float, lon: float) -> dict:
        """Fetch Air Quality Index data from OpenWeatherMap"""
        try:
            query = urlencode({'lat': lat, 'lon': lon, 'appid': self.api_key})
            url = f'https://api.openweathermap.org/data/2.5/air_pollution?{query}'
            with urlopen(url, timeout=10) as response:
                payload = json.loads(response.read().decode('utf-8'))
                if 'list' in payload and len(payload['list']) > 0:
                    current = payload['list'][0]
                    aqi = current.get('main', {}).get('aqi')
                    components = current.get('components', {})
                    return {
                        'aqi': aqi,
                        'co': components.get('co'),
                        'no': components.get('no'),
                        'no2': components.get('no2'),
                        'o3': components.get('o3'),
                        'so2': components.get('so2'),
                        'pm2_5': components.get('pm2_5'),
                        'pm10': components.get('pm10'),
                        'nh3': components.get('nh3'),
                    }
                return {'aqi': None}
        except HTTPError as exc:
            message = _extract_upstream_message(exc)
            raise WeatherAdapterError(message, exc.code)
        except (URLError, TimeoutError, json.JSONDecodeError):
            raise WeatherAdapterError('Failed to fetch air pollution data.', 502)
