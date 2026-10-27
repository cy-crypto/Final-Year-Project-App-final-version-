"""Dose scheduling. Every "slot" is one scheduled dose: a medicine at a local time on a local day.

Edge cases handled here (so the app, the API and the chatbot agree):
  * start/end dates, weekly medicines on chosen weekdays only, as-needed medicines have no slots;
  * a slot without a log is "upcoming", "due" (from its time) or "missed" (MISSED_AFTER later);
  * logging the same slot twice updates the existing log instead of adding a duplicate;
  * supply goes down by dose_units for a taken dose, comes back if that log is changed, never below 0;
  * doses cannot be logged for future days.
"""
import datetime

from django.utils import timezone

from accounts.timezones import local_datetime, user_now, user_tz

from .models import Medication, MedicationLog

MISSED_AFTER = datetime.timedelta(minutes=60)
LOOKAHEAD_DAYS = 8


class DoseError(ValueError):
    pass


def _day_bounds(user, day):
    tz = user_tz(user)
    start = datetime.datetime(day.year, day.month, day.day, tzinfo=tz)
    return start, start + datetime.timedelta(days=1)


def _logs_by_slot(user, day, med_ids):
    start, end = _day_bounds(user, day)
    logs = MedicationLog.objects.filter(
        user=user, medication_id__in=med_ids, scheduled_time__gte=start, scheduled_time__lt=end
    ).exclude(dose_time='').order_by('created_at')
    return {(log.medication_id, log.dose_time): log for log in logs}  # latest wins


def slot_state(at, log, now):
    if log:
        return log.status
    if now >= at + MISSED_AFTER:
        return 'missed'
    if now >= at:
        return 'due'
    return 'upcoming'


def day_schedule(user, day=None, now=None):
    now = now or user_now(user)
    day = day or now.date()
    meds = [m for m in Medication.objects.filter(user=user, is_active=True) if m.is_scheduled_on(day)]
    logs = _logs_by_slot(user, day, [m.id for m in meds])
    slots = []
    for med in meds:
        for hhmm in med.schedule_times:
            at = local_datetime(user, day, hhmm)
            log = logs.get((med.id, hhmm))
            slots.append({
                'medication_id': med.id,
                'name': med.name,
                'dosage': med.dosage,
                'instructions': med.instructions,
                'time': hhmm,
                'scheduled_at': at.isoformat(),
                'status': slot_state(at, log, now),
                'log_id': log.id if log else None,
                'logged_at': (log.taken_at or log.created_at).isoformat() if log else None,
            })
    slots.sort(key=lambda s: (s['time'], s['name'].lower()))
    return slots


def next_dose(user, now=None):
    """The first dose that is still to be taken (due now or later), looking ahead a week."""
    now = now or user_now(user)
    for offset in range(LOOKAHEAD_DAYS):
        day = now.date() + datetime.timedelta(days=offset)
        for slot in day_schedule(user, day, now):
            if slot['status'] in ('due', 'upcoming'):
                return {**slot, 'date': day.isoformat()}
    return None


def log_dose(user, medication, status='taken', dose_time='', day=None, notes=''):
    if status not in dict(MedicationLog.STATUS_CHOICES):
        raise DoseError('status must be taken, skipped or deferred.')
    now = user_now(user)
    day = day or now.date()
    if day > now.date():
        raise DoseError('You cannot log a dose for a future day.')
    if dose_time and dose_time not in (medication.schedule_times or []):
        raise DoseError(f'{medication.name} is not scheduled at {dose_time}.')

    existing = None
    if dose_time:
        existing = _logs_by_slot(user, day, [medication.id]).get((medication.id, dose_time))
        scheduled = local_datetime(user, day, dose_time)
    else:
        scheduled = now

    was_taken = bool(existing and existing.status == 'taken')
    if status == 'taken' and not was_taken:
        medication.supply_count = max(medication.supply_count - medication.dose_units, 0)
    elif was_taken and status != 'taken':
        medication.supply_count += medication.dose_units
    medication.save(update_fields=['supply_count', 'updated_at'])

    taken_at = timezone.now() if status == 'taken' else None
    if existing:
        existing.status = status
        existing.taken_at = taken_at
        if notes:
            existing.notes = notes
        existing.save(update_fields=['status', 'taken_at', 'notes'])
        return existing
    return MedicationLog.objects.create(
        user=user, medication=medication, status=status, dose_time=dose_time,
        scheduled_time=scheduled, taken_at=taken_at, notes=notes or None,
    )


def adherence(user, days=7):
    """Per-day taken vs scheduled for the last `days` days. Today counts only slots already due."""
    now = user_now(user)
    rows = []
    total_scheduled = total_taken = 0
    for offset in range(days - 1, -1, -1):
        day = now.date() - datetime.timedelta(days=offset)
        slots = day_schedule(user, day, now)
        counted = [s for s in slots if s['status'] != 'upcoming']
        taken = sum(1 for s in counted if s['status'] == 'taken')
        rows.append({
            'date': day.isoformat(),
            'label': day.strftime('%a'),
            'scheduled': len(counted),
            'taken': taken,
            'skipped': sum(1 for s in counted if s['status'] == 'skipped'),
            'missed': sum(1 for s in counted if s['status'] == 'missed'),
        })
        total_scheduled += len(counted)
        total_taken += taken
    rate = round(total_taken * 100 / total_scheduled) if total_scheduled else None
    return {'days': rows, 'scheduled': total_scheduled, 'taken': total_taken, 'rate': rate}
