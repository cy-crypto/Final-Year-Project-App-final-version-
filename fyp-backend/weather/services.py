import json
import os
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

    def get_by_coords(self, lat: float, lon: float) -> dict:
        """GPS fallback: weather for a position when no city name is known or it cannot be found."""
        key = f'@{round(lat, 2)},{round(lon, 2)}'
        cached = self._get_cached(key)
        if cached:
            return cached
        payload = self._fetch_weather({'lat': lat, 'lon': lon}, f'{lat:.2f}, {lon:.2f}')
        self._set_cached(key, payload.get('city') or key, payload)
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

        return self._fetch_weather({'q': city}, city)

    def _fetch_weather(self, place: dict, city: str) -> dict:
        """Current weather + 3-hour forecast (free plan) for `place` ({'q': city} or {'lat','lon'})."""
        try:
            query = urlencode({**place, 'appid': self.api_key, 'units': 'metric'})
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
            forecast_query = urlencode({**place, 'appid': self.api_key, 'units': 'metric'})
            forecast_url = f'https://api.openweathermap.org/data/2.5/forecast?{forecast_query}'
            with urlopen(forecast_url, timeout=10) as fresp:
                forecast_payload = json.loads(fresp.read().decode('utf-8'))
                for item in forecast_payload.get('list', []):
                    hourly_items.append({
                        'dt': item.get('dt'),
                        'temp': item.get('main', {}).get('temp'),
                        'pop': item.get('pop'),
                        'humidity': item.get('main', {}).get('humidity'),
                        'wind_speed': item.get('wind', {}).get('speed'),
                        'rain_3h': (item.get('rain') or {}).get('3h'),
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


# ---------------------------------------------------------------- severe weather (FR-08.3)
# OpenWeather condition ids: https://openweathermap.org/weather-conditions
HEAT_C = 40
COLD_C = 0
WIND_MS = 15          # ~54 km/h, "strong wind"
HEAVY_RAIN_MM_3H = 15
VISIBILITY_M = 1000


def _ids(entry):
    return [w.get('id') for w in (entry.get('weather') or []) if isinstance(w, dict) and w.get('id')]


def severe_alerts(payload: dict) -> list:
    """Warnings for the current conditions and the next 12 hours of forecast."""
    alerts = {}
    current = payload.get('current') or {}
    entries = [('now', current)] + [(h.get('dt'), h) for h in (payload.get('hourly') or [])[:4]]

    def add(key, severity, title, message, when):
        if key not in alerts:
            alerts[key] = {'id': key, 'severity': severity, 'title': title, 'message': message,
                           'starts': None if when == 'now' else when}

    for when, entry in entries:
        soon = 'now' if when == 'now' else 'in the next hours'
        ids = _ids(entry)
        temp = entry.get('temp')
        wind = entry.get('wind_speed')
        if any(200 <= i < 300 for i in ids):
            add('thunderstorm', 'high', 'Thunderstorm warning', f'Thunderstorms expected {soon}. Stay indoors if you can.', when)
        if any(i in (502, 503, 504, 522, 531) for i in ids) or (entry.get('rain_3h') or 0) >= HEAVY_RAIN_MM_3H:
            add('heavy_rain', 'high', 'Heavy rain', f'Heavy rain {soon}. Watch out for flooding on roads.', when)
        if any(i in (602, 622) for i in ids):
            add('heavy_snow', 'high', 'Heavy snow', f'Heavy snow {soon}. Travel may be difficult.', when)
        if any(i in (751, 761, 731) for i in ids):
            add('dust', 'medium', 'Dust or sand storm', f'Dust in the air {soon}. Wear a mask outside.', when)
        if any(i in (771, 781) for i in ids):
            add('squall', 'high', 'Squalls or tornado', f'Dangerous winds {soon}. Take shelter.', when)
        if isinstance(temp, (int, float)) and temp >= HEAT_C:
            add('heat', 'high', 'Extreme heat', f'{round(temp)}°C {soon}. Drink water and avoid the midday sun.', when)
        if isinstance(temp, (int, float)) and temp <= COLD_C:
            add('freezing', 'medium', 'Freezing temperatures', f'{round(temp)}°C {soon}. Roads may be icy.', when)
        if isinstance(wind, (int, float)) and wind >= WIND_MS:
            add('wind', 'medium', 'Strong wind', f'Winds around {round(wind * 3.6)} km/h {soon}.', when)
    visibility = current.get('visibility')
    if isinstance(visibility, (int, float)) and visibility < VISIBILITY_M:
        add('visibility', 'medium', 'Low visibility', f'Visibility is only {visibility} m. Drive carefully.', 'now')
    order = {'high': 0, 'medium': 1}
    return sorted(alerts.values(), key=lambda a: order[a['severity']])


def lookup(city=None, lat=None, lon=None) -> dict:
    """Weather by city, falling back to GPS coordinates when the city is missing or not found.
    Adds the severe-weather alerts to the payload."""
    api_key = os.getenv('OPENWEATHER_API_KEY')
    if not api_key:
        raise WeatherAdapterError('Server weather API key is not configured.', 503)
    try:
        cache_ttl = int(os.getenv('OPENWEATHER_CACHE_TTL', '1800'))
    except ValueError:
        cache_ttl = 1800
    adapter = WeatherAdapter(api_key, cache_ttl=cache_ttl)

    payload = None
    if city:
        try:
            payload = adapter.get_by_city(city)
        except WeatherAdapterError as exc:
            if lat is None or exc.status_code not in (400, 404):
                raise
    if payload is None:
        if lat is None or lon is None:
            raise WeatherAdapterError('Send a city or your location.', 400)
        payload = adapter.get_by_coords(lat, lon)
        payload = {**payload, 'source': 'gps'}
    return {**payload, 'alerts': severe_alerts(payload)}
