"""Tools the chatbot can call. Every tool runs against the signed-in user's own data only:
the user comes from the verified auth token (ToolContext), never from model-supplied input."""
import datetime
from dataclasses import dataclass
from decimal import Decimal, InvalidOperation

from django.db import transaction
from django.db.models import F, Sum
from django.utils import timezone

from accounts.models import UserProfile
from accounts.serializers import merged_preferences
from accounts.timezones import user_now, user_tz
from budget.models import BudgetSettings, BudgetTransaction, CategoryBudget
from fitness.models import FitnessGoal, FitnessRecord, WaterIntake
from fitness.activity import save_activity
from fitness.calories import effective_calories, refresh_current_estimate, steps_available
from fitness.serializers import FitnessRecordSerializer
from habits.models import Habit
from habits.services import complete_habit as complete_habit_streak
from community import services as community_services
from community.models import Post
from medications import services as med_services
from medications.models import Medication, MedicationLog
from prayer import services as prayer_services
from tasks.models import Task
from weather import services as weather_services


@dataclass
class ToolContext:
    user: object

    @property
    def user_id(self):
        profile, _ = UserProfile.objects.get_or_create(user=self.user)
        return profile.external_user_id


class ToolError(Exception):
    """Raised with a message the model can read and recover from."""


def _date(value, field='date'):
    if not value:
        return None
    try:
        return datetime.date.fromisoformat(str(value))
    except ValueError:
        raise ToolError(f'{field} must be YYYY-MM-DD.')


def _amount(value):
    try:
        amount = Decimal(str(value))
    except InvalidOperation:
        raise ToolError('amount must be a number.')
    if amount <= 0:
        raise ToolError('amount must be greater than zero.')
    return amount


def _find(queryset, ref, name_field):
    """Resolve an item by numeric id or (partial) name; error if missing or ambiguous."""
    ref = str(ref).strip()
    if ref.isdigit():
        obj = queryset.filter(pk=int(ref)).first()
        if obj:
            return obj
    matches = list(queryset.filter(**{f'{name_field}__iexact': ref})[:2]) or list(
        queryset.filter(**{f'{name_field}__icontains': ref})[:3]
    )
    if not matches:
        raise ToolError(f'Nothing found matching "{ref}".')
    if len(matches) > 1:
        names = ', '.join(getattr(m, name_field) for m in matches)
        raise ToolError(f'"{ref}" is ambiguous (matches: {names}). Ask the user which one.')
    return matches[0]


def _task_dict(t):
    return {
        'id': t.id, 'title': t.title, 'description': t.description or '', 'category': t.category,
        'priority': t.priority, 'status': t.status,
        'deadline': t.deadline.isoformat() if t.deadline else None,
    }


# ---------------------------------------------------------------- tasks
def list_tasks(ctx, status=None):
    qs = Task.objects.filter(user=ctx.user)
    if status:
        qs = qs.filter(status=status)
    return {'tasks': [_task_dict(t) for t in qs[:50]]}


def create_task(ctx, title, description='', priority='medium', deadline=None, category=''):
    task = Task.objects.create(
        user=ctx.user, title=title.strip()[:255], description=description or '',
        priority=priority, deadline=_date(deadline, 'deadline'), category=category or '',
    )
    return {'created': _task_dict(task)}


def update_task(ctx, task, status=None, title=None, priority=None, deadline=None):
    t = _find(Task.objects.filter(user=ctx.user), task, 'title')
    if status:
        if status == Task.STATUS_DONE and t.status != Task.STATUS_DONE:
            t.progress_percentage = 100
            t.completed_at = timezone.now()
        elif status != Task.STATUS_DONE:
            t.completed_at = None
        t.status = status
    if title:
        t.title = title[:255]
    if priority:
        t.priority = priority
    if deadline:
        t.deadline = _date(deadline, 'deadline')
    t.save()
    return {'updated': _task_dict(t)}


def delete_task(ctx, task):
    t = _find(Task.objects.filter(user=ctx.user), task, 'title')
    data = _task_dict(t)
    t.delete()
    return {'deleted': data}


# ---------------------------------------------------------------- medications
def get_medications_today(ctx):
    """Active medications with their schedule, what has been logged today and the next dose."""
    now = user_now(ctx.user)
    today = now.date()
    slots = med_services.day_schedule(ctx.user, today, now)
    by_med = {}
    for slot in slots:
        if slot['log_id']:
            by_med.setdefault(slot['medication_id'], []).append(
                {'status': slot['status'], 'scheduled_time': slot['scheduled_at']})
    start = datetime.datetime(today.year, today.month, today.day, tzinfo=user_tz(ctx.user))
    for log in MedicationLog.objects.filter(user=ctx.user, dose_time='', scheduled_time__gte=start,
                                            scheduled_time__lt=start + datetime.timedelta(days=1)):
        by_med.setdefault(log.medication_id, []).append(
            {'status': log.status, 'scheduled_time': log.scheduled_time.isoformat(), 'as_needed': True})
    meds = Medication.objects.filter(user=ctx.user, is_active=True)
    return {
        'date': today.isoformat(),
        'medications': [
            {
                'id': m.id, 'name': m.name, 'dosage': m.dosage, 'frequency': m.frequency,
                'schedule_times': m.schedule_times, 'notes': m.notes or '', 'instructions': m.instructions,
                'supply_count': m.supply_count, 'refill_threshold': m.refill_threshold,
                'needs_refill': m.needs_refill, 'logged_today': by_med.get(m.id, []),
            }
            for m in meds
        ],
        'schedule_today': [{'name': s['name'], 'time': s['time'], 'status': s['status']} for s in slots],
        'next_dose': med_services.next_dose(ctx.user, now),
    }


def get_next_dose(ctx):
    dose = med_services.next_dose(ctx.user)
    if not dose:
        return {'next_dose': None, 'note': 'No scheduled doses in the coming week.'}
    return {'next_dose': {k: dose[k] for k in ('name', 'dosage', 'time', 'date', 'status', 'instructions')}}


def add_medication(ctx, name, dosage, schedule_times, frequency='daily', notes=''):
    med = Medication.objects.create(
        user=ctx.user, name=name[:200], dosage=dosage[:100], frequency=frequency,
        schedule_times=list(schedule_times), notes=notes or '',
    )
    return {'created': {'id': med.id, 'name': med.name, 'dosage': med.dosage,
                        'frequency': med.frequency, 'schedule_times': med.schedule_times}}


def log_medication(ctx, medication, status='taken', dose_time=None):
    """Log a dose. Without dose_time it answers the open scheduled dose closest to now, or an
    as-needed dose when nothing is scheduled today."""
    med = _find(Medication.objects.filter(user=ctx.user, is_active=True), medication, 'name')
    if dose_time is None:
        now = user_now(ctx.user)
        open_slots = [s for s in med_services.day_schedule(ctx.user, now.date(), now)
                      if s['medication_id'] == med.id and not s['log_id']]
        nearest = min(open_slots, key=lambda s: abs(datetime.datetime.fromisoformat(s['scheduled_at']) - now),
                      default=None)
        dose_time = nearest['time'] if nearest else ''
    try:
        log = med_services.log_dose(ctx.user, med, status=status, dose_time=dose_time)
    except med_services.DoseError as exc:
        raise ToolError(str(exc))
    med.refresh_from_db()
    return {'logged': {'medication': med.name, 'status': status, 'dose_time': log.dose_time or 'as needed',
                       'supply_left': med.supply_count, 'needs_refill': med.needs_refill}}


# ---------------------------------------------------------------- weather & prayer times
def _profile_city(ctx, city):
    city = (city or '').strip()
    if city:
        return city
    profile, _ = UserProfile.objects.get_or_create(user=ctx.user)
    if not profile.selected_city:
        raise ToolError('No city given and none saved in the profile. Ask the user which city.')
    return profile.selected_city


def _describe(entry):
    return ((entry.get('weather') or [{}])[0] or {}).get('description', '')


def get_weather(ctx, city=None):
    city = _profile_city(ctx, city)
    try:
        data = weather_services.lookup(city=city)
    except weather_services.WeatherAdapterError as exc:
        raise ToolError(str(exc))
    tz = user_tz(ctx.user)
    current = data.get('current') or {}
    return {
        'city': data.get('city') or city,
        'now': {'temp_c': current.get('temp'), 'feels_like_c': current.get('feels_like'),
                'humidity': current.get('humidity'), 'conditions': _describe(current),
                'wind_kmh': round((current.get('wind_speed') or 0) * 3.6)},
        'next_hours': [
            {'time': datetime.datetime.fromtimestamp(h['dt'], tz).strftime('%H:%M'), 'temp_c': h.get('temp'),
             'rain_chance': round((h.get('pop') or 0) * 100), 'conditions': _describe(h)}
            for h in (data.get('hourly') or [])[:4] if h.get('dt')
        ],
        'next_days': [
            {'date': datetime.datetime.fromtimestamp(d['date'], tz).date().isoformat(), 'min_c': d.get('temp_min'),
             'max_c': d.get('temp_max'), 'rain_chance': round((d.get('pop') or 0) * 100)}
            for d in (data.get('daily') or [])[:4] if d.get('date')
        ],
        'alerts': [{'title': a['title'], 'message': a['message']} for a in data.get('alerts', [])],
    }


def get_prayer_times(ctx, city=None, date=None):
    city = _profile_city(ctx, city)
    day = _date(date) or user_now(ctx.user).date()
    profile, _ = UserProfile.objects.get_or_create(user=ctx.user)
    prefs = merged_preferences(profile.preferences)
    try:
        entry = prayer_services.get_day(day, address=city, method=prefs['prayer_method'],
                                        school=prefs['prayer_school'])
    except prayer_services.PrayerError as exc:
        raise ToolError(str(exc))
    hijri = entry['hijri']
    return {
        'city': city, 'date': entry['date'], 'times': entry['times'],
        'hijri_date': f"{hijri['day']} {hijri['month_name']} {hijri['year']} AH",
        'is_ramadan': entry['is_ramadan'],
        'sehri_ends': entry['times']['Imsak'] if entry['is_ramadan'] else None,
        'iftar': entry['times']['Maghrib'] if entry['is_ramadan'] else None,
        'next_prayer': prayer_services.next_prayer([entry], timezone.now()),
    }


# ---------------------------------------------------------------- community
def share_streak(ctx, habit=None, message=''):
    today = user_now(ctx.user).date()
    if habit:
        h = _find(Habit.objects.filter(user_id=ctx.user_id), habit, 'name')
        streak = community_services.live_streak(h, today)
    else:
        streak, h = community_services.best_live_habit(ctx.user)
    if not h or streak <= 0:
        raise ToolError('There is no running habit streak to share. A habit must be done today or yesterday.')
    post = Post.objects.create(
        author=ctx.user, kind=Post.KIND_HABIT_STREAK,
        meta={'habit': h.name, 'streak': streak, 'best_streak': h.best_streak, 'category': h.category},
        content=(message or '').strip()[:1000] or f'{streak}-day streak on "{h.name}"!',
    )
    return {'shared': {'habit': h.name, 'streak': streak, 'post_id': post.id}}


# ---------------------------------------------------------------- habits
def list_habits(ctx):
    today = user_now(ctx.user).date()
    return {'habits': [
        {'id': h.id, 'name': h.name, 'frequency': h.frequency, 'category': h.category,
         'streak': h.streak_count, 'best_streak': h.best_streak,
         'done_today': h.last_completed_date == today}
        for h in Habit.objects.filter(user_id=ctx.user_id)
    ]}


def create_habit(ctx, name, frequency='Daily', category='Other'):
    habit = Habit.objects.create(user_id=ctx.user_id, name=name[:255], frequency=frequency, category=category)
    return {'created': {'id': habit.id, 'name': habit.name, 'frequency': habit.frequency}}


def complete_habit(ctx, habit):
    h = _find(Habit.objects.filter(user_id=ctx.user_id), habit, 'name')
    complete_habit_streak(h, user_now(ctx.user).date())
    return {'completed': {'name': h.name, 'streak': h.streak_count, 'best_streak': h.best_streak}}


# ---------------------------------------------------------------- budget
def add_transaction(ctx, type, amount, category='', description='', date=None):
    tx = BudgetTransaction.objects.create(
        user_id=ctx.user_id, type=type, amount=_amount(amount), category=category or None,
        description=description or None, date=_date(date) or timezone.localdate(),
    )
    return {'created': {'id': str(tx.id), 'type': tx.type, 'amount': str(tx.amount),
                        'category': tx.category, 'date': tx.date.isoformat()}}


def get_budget_summary(ctx, month=None):
    """Income, spending and per-category budgets for a month (YYYY-MM, default current)."""
    today = timezone.localdate()
    if month:
        try:
            year, mon = (int(x) for x in month.split('-'))
            start = datetime.date(year, mon, 1)
        except ValueError:
            raise ToolError('month must be YYYY-MM.')
    else:
        start = today.replace(day=1)
    end = (start.replace(day=28) + datetime.timedelta(days=4)).replace(day=1)
    txs = BudgetTransaction.objects.filter(user_id=ctx.user_id, date__gte=start, date__lt=end)

    def total(kind):
        return txs.filter(type=kind).aggregate(s=Sum('amount'))['s'] or Decimal('0')

    spent_by_cat = {
        (r['category'] or 'Uncategorized'): str(r['s'])
        for r in txs.filter(type='expense').values('category').annotate(s=Sum('amount'))
    }
    settings_obj = BudgetSettings.objects.filter(user_id=ctx.user_id).first()
    return {
        'month': start.strftime('%Y-%m'),
        'currency': settings_obj.currency if settings_obj else 'PKR',
        'monthly_limit': str(settings_obj.monthly_limit) if settings_obj and settings_obj.monthly_limit else None,
        'income': str(total('income')), 'expenses': str(total('expense')),
        'spent_by_category': spent_by_cat,
        'category_limits': {c.category: str(c.monthly_limit)
                            for c in CategoryBudget.objects.filter(user_id=ctx.user_id)},
        'recent': [
            {'type': t.type, 'amount': str(t.amount), 'category': t.category,
             'description': t.description, 'date': t.date.isoformat()}
            for t in txs.order_by('-date', '-created_at')[:10]
        ],
    }


# ---------------------------------------------------------------- fitness
def get_fitness_today(ctx):
    today = user_now(ctx.user).date()
    rec = FitnessRecord.objects.filter(user_id=ctx.user_id, date=today).first()
    if rec:
        refresh_current_estimate(rec, ctx.user)
    # Keep the water tool's existing date convention; only activity/calorie dates change.
    water = WaterIntake.objects.filter(user_id=ctx.user_id, date=timezone.localdate()).first()
    effective, source = effective_calories(rec) if rec else (None, 'unavailable')
    return {
        'date': today.isoformat(),
        'steps': rec.steps if rec else 0,
        'calories_burned': str(rec.calories_burned) if rec else '0',
        'estimated_active_calories': str(rec.estimated_active_calories) if rec and rec.estimated_active_calories is not None else None,
        'effective_calories_burned': str(effective) if effective is not None else None,
        'calorie_source': source,
        'steps_available': steps_available(rec) if rec else False,
        'sleep_minutes': rec.sleep_duration_minutes if rec else None,
        'water_ml': water.amount_ml if water else 0,
        'goals': {g.goal_type: str(g.target_value)
                  for g in FitnessGoal.objects.filter(user_id=ctx.user_id, is_active=True)},
    }


def log_water(ctx, amount_ml):
    if int(amount_ml) <= 0:
        raise ToolError('amount_ml must be positive.')
    water, _ = WaterIntake.objects.get_or_create(user_id=ctx.user_id, date=timezone.localdate())
    water.amount_ml += int(amount_ml)
    water.updated_at = timezone.now()
    water.save()
    return {'water_ml_today': water.amount_ml}


def log_fitness(ctx, steps=None, calories_burned=None, sleep_minutes=None):
    data = {key: value for key, value in [('steps', steps), ('calories_burned', calories_burned),
                                        ('sleep_duration_minutes', sleep_minutes)] if value is not None}
    serializer = FitnessRecordSerializer(data=data)
    if not serializer.is_valid():
        raise ToolError(str(serializer.errors))
    user_id = ctx.user_id
    activity_data = dict(serializer.validated_data)
    activity_data.pop('date', None)  # The tool has no date input; use the user's local day below.
    with transaction.atomic():
        UserProfile.objects.filter(user=ctx.user).update(timezone=F('timezone'))
        rec, _ = FitnessRecord.objects.get_or_create(user_id=user_id, date=user_now(ctx.user).date())
        save_activity(rec, activity_data, ctx.user)
    return {'today': {'steps': rec.steps, 'calories_burned': str(rec.calories_burned),
                      'sleep_minutes': rec.sleep_duration_minutes}}


def _tool(name, description, properties=None, required=None):
    return {
        'name': name, 'description': description,
        'input_schema': {'type': 'object', 'properties': properties or {},
                         'required': required or [], 'additionalProperties': False},
    }


_S = {'type': 'string'}
_ISO = {'type': 'string', 'description': 'Date as YYYY-MM-DD'}
_STATUS = {'type': 'string', 'enum': ['pending', 'in_progress', 'done']}
_PRIORITY = {'type': 'string', 'enum': ['low', 'medium', 'high']}

# name -> (definition, function, module touched). `module` lets the app refresh the right screen.
REGISTRY = {
    'list_tasks': (_tool('list_tasks', "List the user's tasks, optionally filtered by status.",
                         {'status': _STATUS}), list_tasks, 'tasks'),
    'create_task': (_tool('create_task', 'Add a new task for the user.', {
        'title': _S, 'description': _S, 'category': _S, 'priority': _PRIORITY, 'deadline': _ISO,
    }, ['title']), create_task, 'tasks'),
    'update_task': (_tool('update_task', 'Update a task (e.g. mark it done). `task` is its id or title.', {
        'task': _S, 'status': _STATUS, 'title': _S, 'priority': _PRIORITY, 'deadline': _ISO,
    }, ['task']), update_task, 'tasks'),
    'delete_task': (_tool('delete_task', 'Permanently delete a task. Only after the user confirmed.',
                          {'task': _S}, ['task']), delete_task, 'tasks'),
    'get_medications_today': (_tool(
        'get_medications_today',
        "The user's active medications with dosage, schedule times and what was already logged today."),
        get_medications_today, 'medications'),
    'add_medication': (_tool('add_medication', "Add a medication to the user's medication list.", {
        'name': _S, 'dosage': _S,
        'schedule_times': {'type': 'array', 'items': _S, 'description': '24h times, e.g. ["08:00","20:00"]'},
        'frequency': {'type': 'string',
                      'enum': ['daily', 'twice_daily', 'three_times_daily', 'weekly', 'as_needed']},
        'notes': _S,
    }, ['name', 'dosage', 'schedule_times']), add_medication, 'medications'),
    'log_medication': (_tool('log_medication', 'Record that a dose was taken or skipped. Without dose_time the '
                             'open scheduled dose closest to now is used.', {
        'medication': {'type': 'string', 'description': 'id or name'},
        'status': {'type': 'string', 'enum': ['taken', 'skipped']},
        'dose_time': {'type': 'string', 'description': 'Scheduled slot as HH:MM, e.g. "08:00"'},
    }, ['medication']), log_medication, 'medications'),
    'get_next_dose': (_tool('get_next_dose', "The user's next scheduled medication dose (name, dosage, time)."),
                      get_next_dose, 'medications'),
    'get_weather': (_tool('get_weather', 'Current weather, next hours, next days and severe weather alerts. '
                          'Without city the city from the user profile is used.', {'city': _S}),
                    get_weather, 'weather'),
    'get_prayer_times': (_tool('get_prayer_times', 'The five daily prayer times, Hijri date, Ramadan Sehri/Iftar '
                               'and the next prayer for a city (default: profile city).',
                               {'city': _S, 'date': _ISO}), get_prayer_times, 'prayer'),
    'share_streak': (_tool('share_streak', "Share one of the user's habit streaks as a post in the Community "
                           "feed. Only when the user asked to share. `habit` is its name; default is the "
                           "longest running streak.", {'habit': _S, 'message': _S}), share_streak, 'community'),
    'list_habits': (_tool('list_habits', "List the user's habits with streaks and whether done today."),
                    list_habits, 'habits'),
    'create_habit': (_tool('create_habit', 'Create a new habit.', {
        'name': _S, 'frequency': {'type': 'string', 'enum': ['Daily', 'Weekly']},
        'category': {'type': 'string',
                     'enum': ['Health', 'Fitness', 'Study', 'Mindfulness', 'Finance', 'Other']},
    }, ['name']), create_habit, 'habits'),
    'complete_habit': (_tool('complete_habit', 'Mark a habit as done today. `habit` is its id or name.',
                             {'habit': _S}, ['habit']), complete_habit, 'habits'),
    'add_transaction': (_tool('add_transaction', 'Record an expense or income in the budget.', {
        'type': {'type': 'string', 'enum': ['expense', 'income']},
        'amount': {'type': 'number'}, 'category': _S, 'description': _S, 'date': _ISO,
    }, ['type', 'amount']), add_transaction, 'budget'),
    'get_budget_summary': (_tool(
        'get_budget_summary',
        'Income, expenses, per-category spending/limits and recent transactions for a month.',
        {'month': {'type': 'string', 'description': 'YYYY-MM, default current month'}}),
        get_budget_summary, 'budget'),
    'get_fitness_today': (_tool('get_fitness_today', "Today's steps, calories, sleep, water and fitness goals."),
                          get_fitness_today, 'fitness'),
    'log_water': (_tool('log_water', 'Add water intake (ml) to today.', {'amount_ml': {'type': 'integer'}},
                        ['amount_ml']), log_water, 'fitness'),
    'log_fitness': (_tool('log_fitness', "Set today's steps / calories burned / sleep minutes.", {
        'steps': {'type': 'integer'}, 'calories_burned': {'type': 'number'},
        'sleep_minutes': {'type': 'integer'},
    }), log_fitness, 'fitness'),
}

# Tools that only read; the app does not need to refresh after them.
READ_ONLY = {'list_tasks', 'get_medications_today', 'list_habits', 'get_budget_summary', 'get_fitness_today',
             'get_next_dose', 'get_weather', 'get_prayer_times'}

TOOL_DEFINITIONS = [entry[0] for entry in REGISTRY.values()]


def run_tool(ctx, name, args):
    """Execute a tool. Returns (result_dict, is_error)."""
    entry = REGISTRY.get(name)
    if not entry:
        return {'error': f'Unknown tool {name}.'}, True
    try:
        return entry[1](ctx, **(args or {})), False
    except ToolError as exc:
        return {'error': str(exc)}, True
    except (TypeError, ValueError) as exc:
        return {'error': f'Invalid arguments: {exc}'}, True
