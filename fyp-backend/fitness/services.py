"""Fitness period and duration calculations. Dates are in the user's timezone; elapsed time is UTC."""
import datetime
from decimal import Decimal

from django.utils import timezone

from accounts.timezones import user_tz
from .models import FitnessRecord, SleepRecord
from .calories import effective_calories, steps_available

UTC = datetime.timezone.utc


def goal_period(goal_type, user, now=None):
    today = (now or timezone.now()).astimezone(user_tz(user)).date()
    start = today - datetime.timedelta(days=today.weekday()) if goal_type == 'workout_frequency' else today
    return start, start + datetime.timedelta(days=7 if goal_type == 'workout_frequency' else 1)


def goal_progress(goal, user, now=None, records=None):
    start, end = goal_period(goal.goal_type, user, now)
    rows = records if records is not None else FitnessRecord.objects.filter(user_id=goal.user_id, date__gte=start, date__lt=end)
    rows = [r for r in rows if start <= r.date < end]
    reason = None
    current = None
    if goal.goal_type == 'workout_frequency':
        # Existing workout_log entries are exercises, not completed sessions. Never count
        # exercise rows (or workout days) as workout sessions.
        reason = 'Completed workout sessions are unavailable: existing logs contain exercises, not session records.'
    elif not rows:
        reason = 'No activity record for this period. Log or sync your activity to see progress.'
    elif goal.goal_type == 'steps':
        values = [r.steps for r in rows if steps_available(r)]
        current = sum(values) if values else None
        if current is None:
            reason = 'Steps have not been recorded for this period. Log or sync your steps.'
    elif goal.goal_type == 'calories':
        values = [v for r in rows for v, _ in [effective_calories(r)] if v is not None]
        current = sum(values, Decimal('0')) if values else None
        if current is None:
            reason = 'Calorie progress needs recorded steps and a complete fitness profile, or a manual calorie override.'
    elif goal.goal_type == 'sleep':  # Preserve existing duration-only sleep goals.
        values = [r.sleep_duration_minutes for r in rows if r.sleep_duration_minutes is not None]
        current = sum(values) if values else None
        if current is None:
            reason = 'No legacy sleep duration logged for this period.'
    available = current is not None
    target = goal.target_value
    return {
        'period': 'weekly' if goal.goal_type == 'workout_frequency' else 'daily',
        'period_start': start.isoformat(), 'period_end': end.isoformat(),
        'timezone': str(user_tz(user)), 'available': available, 'unavailable_reason': reason,
        'current': float(current) if available else None,
        'remaining': float(max(Decimal('0'), target - Decimal(str(current)))) if available else None,
        'percent': min(100, float(Decimal(str(current)) / target * 100)) if available else None,
        'complete': bool(available and current >= target),
        'achievement_notified': goal.achievements.filter(period_start=start).exists(),
    }


def elapsed_minutes(bedtime, wake_time):
    return (wake_time.astimezone(UTC) - bedtime.astimezone(UTC)).total_seconds() / 60


def sleep_summary(user, user_id, now=None):
    tz = user_tz(user)
    today = (now or timezone.now()).astimezone(tz).date()
    first = today - datetime.timedelta(days=6)
    start = datetime.datetime.combine(first, datetime.time.min, tzinfo=tz)
    end = datetime.datetime.combine(today + datetime.timedelta(days=1), datetime.time.min, tzinfo=tz)
    totals = {}
    for record in SleepRecord.objects.filter(user_id=user_id, wake_time__gte=start, wake_time__lt=end):
        day = record.wake_time.astimezone(tz).date()
        totals[day] = totals.get(day, 0) + elapsed_minutes(record.bedtime, record.wake_time)
    return {
        'timezone': str(tz), 'recorded_nights': len(totals),
        'average_minutes': round(sum(totals.values()) / len(totals), 2) if totals else None,
        'days': [{'date': (day := first + datetime.timedelta(days=i)).isoformat(),
                  'duration_minutes': round(totals[day], 2) if day in totals else None} for i in range(7)],
    }
