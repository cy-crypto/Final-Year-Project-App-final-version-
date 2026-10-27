"""Canonical cumulative activity updates shared by the Fitness API and assistant tool.

Call inside a transaction holding the owner's UserProfile lock. Values are validated
with FitnessRecordSerializer first. Repeated totals replace values; never add energy.
"""
import datetime
from django.utils import timezone
from rest_framework.exceptions import ValidationError
from accounts.timezones import user_now, user_tz
from .calories import refresh_current_estimate


def save_activity(record, data, user):
    data = dict(data)
    if data.pop('today_only', False) and record.date != user_now(user).date():
        raise ValidationError({'today_only': 'The local day has changed. Reload today’s record before saving.'})
    clear = data.pop('clear_manual_calories', False)
    observed = data.get('steps_observed_at')
    source = data.get('step_source', 'manual')
    if 'steps' in data:
        if source == 'sensor':
            if record.date != user_now(user).date() or observed.astimezone(user_tz(user)).date() != record.date:
                raise ValidationError('This step snapshot belongs to another local day. Read the sensor again.')
            if observed > timezone.now() + datetime.timedelta(seconds=30):
                raise ValidationError('The step snapshot is in the future.')
            if record.step_source == 'sensor' and record.steps_observed_at and observed < record.steps_observed_at:
                raise ValidationError('A newer step snapshot is already saved. Refresh before syncing.')
        record.steps_recorded_at = timezone.now()
        record.step_source = source
        record.steps_observed_at = observed if source == 'sensor' else None
    elif 'step_source' in data or 'steps_observed_at' in data:
        raise ValidationError('Step metadata requires a step total.')
    if 'calories_burned' in data:
        record.manual_calories_recorded_at = timezone.now()
    if clear:
        record.calories_burned = 0
        record.manual_calories_recorded_at = None
    for key, value in data.items():
        setattr(record, key, value)
    record.updated_at = timezone.now()
    record.save()
    refresh_current_estimate(record, user)
    return record
