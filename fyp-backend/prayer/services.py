"""Prayer times from the Aladhan API (https://aladhan.com/prayer-times-api), cached per place and day,
plus the Qibla bearing, which is computed locally."""
import datetime
import json
import math
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import urlopen
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from django.core.cache import cache

ALADHAN = 'https://api.aladhan.com/v1'
PRAYERS = ['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha']
EXTRA = ['Imsak', 'Sunrise']
CACHE_SECONDS = 12 * 3600
KAABA = (21.4225, 39.8262)
RAMADAN = 9


class PrayerError(Exception):
    def __init__(self, message, status_code=502):
        super().__init__(message)
        self.status_code = status_code


def qibla_bearing(lat, lon):
    """Initial great-circle bearing from (lat, lon) to the Kaaba, degrees clockwise from true north."""
    phi1, phi2 = math.radians(lat), math.radians(KAABA[0])
    delta = math.radians(KAABA[1] - lon)
    y = math.sin(delta) * math.cos(phi2)
    x = math.cos(phi1) * math.sin(phi2) - math.sin(phi1) * math.cos(phi2) * math.cos(delta)
    return round((math.degrees(math.atan2(y, x)) + 360) % 360, 1)


def _clean_time(value):
    return str(value).split(' ')[0][:5]  # "04:53 (PKT)" -> "04:53"


def _fetch(url):
    try:
        with urlopen(url, timeout=12) as resp:
            body = json.loads(resp.read().decode('utf-8'))
    except HTTPError as exc:
        raise PrayerError('Could not find prayer times for that place.' if exc.code == 400 else 'Prayer time service error.',
                          400 if exc.code == 400 else 502)
    except (URLError, TimeoutError, json.JSONDecodeError):
        raise PrayerError('Prayer time service is unreachable. Try again later.')
    if body.get('code') != 200 or not isinstance(body.get('data'), dict):
        raise PrayerError('Could not find prayer times for that place.', 400)
    return body['data']


def _normalize(data, day):
    timings = data['timings']
    hijri = data['date']['hijri']
    meta = data.get('meta', {})
    return {
        'date': day.isoformat(),
        'times': {name: _clean_time(timings[name]) for name in PRAYERS + EXTRA},
        'hijri': {
            'day': int(hijri['day']),
            'month': int(hijri['month']['number']),
            'month_name': hijri['month']['en'],
            'month_name_ar': hijri['month'].get('ar', ''),
            'year': int(hijri['year']),
            'holidays': hijri.get('holidays') or [],
        },
        'is_ramadan': int(hijri['month']['number']) == RAMADAN,
        'timezone': meta.get('timezone', ''),
        'method': (meta.get('method') or {}).get('name', ''),
    }


def get_day(day, *, lat=None, lon=None, address=None, method=1, school=1):
    if lat is None and not address:
        raise PrayerError('Send a location (lat and lon) or a city.', 400)
    place = f'{round(lat, 3)},{round(lon, 3)}' if lat is not None else address.strip().lower()
    key = f'prayer:{place}:{day.isoformat()}:{method}:{school}'
    cached = cache.get(key)
    if cached:
        return cached

    stamp = day.strftime('%d-%m-%Y')
    if lat is not None:
        query = urlencode({'latitude': lat, 'longitude': lon, 'method': method, 'school': school})
        data = _fetch(f'{ALADHAN}/timings/{stamp}?{query}')
    else:
        query = urlencode({'address': address, 'method': method, 'school': school})
        data = _fetch(f'{ALADHAN}/timingsByAddress/{stamp}?{query}')
    result = _normalize(data, day)
    cache.set(key, result, CACHE_SECONDS)
    return result


def next_prayer(days, now):
    """First prayer after `now` (aware datetime) across the returned days, in the place's time zone."""
    for entry in days:
        try:
            tz = ZoneInfo(entry['timezone']) if entry['timezone'] else now.tzinfo
        except ZoneInfoNotFoundError:
            tz = now.tzinfo
        local_now = now.astimezone(tz)
        day = datetime.date.fromisoformat(entry['date'])
        for name in PRAYERS:
            hour, minute = (int(x) for x in entry['times'][name].split(':'))
            at = datetime.datetime(day.year, day.month, day.day, hour, minute, tzinfo=tz)
            if at > local_now:
                return {'name': name, 'time': entry['times'][name], 'date': entry['date'],
                        'minutes_left': int((at - local_now).total_seconds() // 60)}
    return None
