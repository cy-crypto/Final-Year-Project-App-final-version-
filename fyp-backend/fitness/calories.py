"""Versioned, net walking-energy approximation, not measured expenditure or TDEE.

ACSM horizontal walking VO2 cost = 0.1 mL O2 / kg / m; remove its 3.5
mL/kg/min resting term. At 5 kcal/L O2 this is 0.0005 kcal / kg / m.
Source: https://pacompendium.com/unite-conversions/ (ACSM equation + oxygen conversion).
Distance = steps * height_cm * 0.414 / 100. The 0.414 sex-neutral midpoint of
the published 0.413/0.415 height heuristics is an explicit approximation, NOT an
inference of biological sex: https://pmc.ncbi.nlm.nih.gov/articles/PMC6068906/ eq.11.
This models level-ground adult walking, NOT known grade/speed. No speed or duration
is invented: speed*time cancels in the horizontal component. Not validated for
all-day mixed activity, running, stairs, unusual gait, load carrying or all adults.
Age is stored/checked for the supported adult range, not used in the energy equation.
"""
from decimal import Decimal, ROUND_HALF_UP

from django.utils import timezone
from django.db import transaction
from django.db.models import F
from accounts.models import UserProfile
from accounts.timezones import user_now, user_tz
from .models import FitnessProfile, FitnessRecord

VERSION = 'acsm-horizontal-height-0414-v1'
STEP_RATIO = Decimal('0.414')


def profile_ready(profile):
    return bool(profile and profile.weight_kg is not None and Decimal('25') <= profile.weight_kg <= Decimal('350')
                and profile.height_cm is not None and Decimal('100') <= profile.height_cm <= Decimal('250')
                and profile.age is not None and 18 <= profile.age <= 120)


def estimate_active_calories(steps, weight_kg, height_cm):
    """Pure Decimal calculation. None is unavailable; zero is an actual recorded zero."""
    if steps is None or weight_kg is None or height_cm is None:
        return None
    if isinstance(steps, bool) or not isinstance(steps, int) or steps < 0:
        raise ValueError('Steps must be a non-negative integer.')
    weight, height = Decimal(str(weight_kg)), Decimal(str(height_cm))
    if not weight.is_finite() or not height.is_finite() or not Decimal('25') <= weight <= Decimal('350') or not Decimal('100') <= height <= Decimal('250'):
        raise ValueError('Measurements are outside supported ranges.')
    return (Decimal(steps) * height * STEP_RATIO / 100 * weight * Decimal('0.0005')).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)


def steps_available(record):
    # Positive legacy totals are evidence of a log; untouched default zeros are not.
    return bool(record.steps_recorded_at or record.steps > 0)


def effective_calories(record):
    # Manual logged totals are overrides of the same activity, never additive. There
    # is no existing wearable/workout-calorie provider. Keep the legacy column intact.
    if record.manual_calories_recorded_at or record.calories_burned > 0:
        return record.calories_burned, 'manual'
    if record.estimated_active_calories is not None:
        return record.estimated_active_calories, 'walking_estimate'
    return None, 'unavailable'


def _refresh_estimate(record, user, profile=None):
    if record.date != user_now(user).date():
        return record  # Never backfill/recalculate closed days using new measurements.
    profile = profile if profile is not None else FitnessProfile.objects.filter(user_id=record.user_id).first()
    value, metadata = None, {}
    if steps_available(record) and profile_ready(profile):
        value = estimate_active_calories(record.steps, profile.weight_kg, profile.height_cm)
        metadata = {'version': VERSION, 'steps': record.steps, 'weight_kg': str(profile.weight_kg),
                    'height_cm': str(profile.height_cm), 'step_length_ratio': str(STEP_RATIO),
                    'distance_m': str(Decimal(record.steps) * profile.height_cm * STEP_RATIO / 100),
                    'activity_model': 'level_ground_walking', 'resting_energy_excluded': True,
                    'timezone': str(user_tz(user)), 'date': record.date.isoformat()}
    old = {k: v for k, v in record.calorie_estimate_metadata.items() if k != 'calculated_at'}
    if value != record.estimated_active_calories or metadata != old:
        if metadata:
            metadata['calculated_at'] = timezone.now().isoformat()
        record.estimated_active_calories = value
        record.calorie_estimate_metadata = metadata
        record.save(update_fields=['estimated_active_calories', 'calorie_estimate_metadata'])
    return record


def refresh_current_estimate(record, user, profile=None):
    if record.date != user_now(user).date():
        return record
    with transaction.atomic():
        # Same owner lock as activity/profile writes; refresh avoids a concurrent GET
        # persisting a snapshot calculated from an older cumulative step total.
        UserProfile.objects.filter(user=user).update(timezone=F('timezone'))
        record.refresh_from_db()
        return _refresh_estimate(record, user, profile)


def refresh_today(user, user_id, profile=None):
    record = FitnessRecord.objects.filter(user_id=user_id, date=user_now(user).date()).first()
    return refresh_current_estimate(record, user, profile) if record else None
