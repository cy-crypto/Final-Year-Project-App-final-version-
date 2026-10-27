"""The user's local clock. Schedules (medication doses, prayer times) are entered in local time on
the phone, while the server runs on UTC, so anything that asks "what is due today" goes through here."""
import datetime
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from django.utils import timezone

from .models import UserProfile

DEFAULT_TZ = 'Asia/Karachi'


def is_valid_timezone(name: str) -> bool:
    try:
        ZoneInfo(name)
        return True
    except (ZoneInfoNotFoundError, ValueError):
        return False


def user_tz(user) -> ZoneInfo:
    profile = UserProfile.objects.filter(user=user).only('timezone').first()
    name = (profile.timezone if profile else '') or DEFAULT_TZ
    try:
        return ZoneInfo(name)
    except (ZoneInfoNotFoundError, ValueError):
        return ZoneInfo(DEFAULT_TZ)


def user_now(user) -> datetime.datetime:
    return timezone.now().astimezone(user_tz(user))


def local_datetime(user, day: datetime.date, hhmm: str) -> datetime.datetime:
    hour, minute = (int(x) for x in hhmm.split(':'))
    return datetime.datetime(day.year, day.month, day.day, hour, minute, tzinfo=user_tz(user))
