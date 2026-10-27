"""Achievements read from the other modules (habits, tasks, fitness) for sharing,
leaderboards and challenge progress. Nothing here writes to those modules."""
import datetime

from django.db.models import Sum

from accounts.models import UserProfile
from accounts.serializers import merged_preferences
from accounts.timezones import user_now
from fitness.models import FitnessRecord
from habits.models import Habit, HabitCompletion
from habits.services import live_streak as habit_live_streak
from tasks.models import Task


def profile_of(user):
    profile, _ = UserProfile.objects.get_or_create(user=user)
    return profile


def display_name(user, profile=None):
    profile = profile or profile_of(user)
    return profile.full_name or (user.email or user.username).split('@')[0]


def live_streak(habit, today):
    """A stored streak only counts while it is unbroken (see habits.services)."""
    return habit_live_streak(habit, today)


def best_live_habit(user):
    profile = profile_of(user)
    today = user_now(user).date()
    habits = [(live_streak(h, today), h) for h in Habit.objects.filter(user_id=profile.external_user_id)]
    habits = [pair for pair in habits if pair[0] > 0]
    return max(habits, key=lambda pair: pair[0], default=(0, None))


def tasks_done_since(user, start):
    return Task.objects.filter(user=user, status=Task.STATUS_DONE, completed_at__date__gte=start).count()


def metric_value(user, metric, start, end):
    profile = profile_of(user)
    if metric == 'habit_checkins':
        return HabitCompletion.objects.filter(
            habit__user_id=profile.external_user_id, completed_date__range=(start, end)
        ).count()
    if metric == 'tasks_completed':
        return Task.objects.filter(
            user=user, status=Task.STATUS_DONE, completed_at__date__range=(start, end)
        ).count()
    if metric == 'steps':
        return FitnessRecord.objects.filter(
            user_id=profile.external_user_id, date__range=(start, end)
        ).aggregate(s=Sum('steps'))['s'] or 0
    return 0


def is_visible(profile):
    return merged_preferences(profile.preferences).get('community_visible', True)


def leaderboard(users, metric, viewer, limit=20):
    """Rank users by current habit streak ('streak') or tasks done in the last 7 days ('tasks')."""
    rows = []
    for user in users:
        profile = profile_of(user)
        if user != viewer and not is_visible(profile):
            continue
        today = user_now(user).date()
        if metric == 'tasks':
            score, detail = tasks_done_since(user, today - datetime.timedelta(days=6)), 'tasks this week'
        else:
            score, habit = best_live_habit(user)
            detail = f'day streak · {habit.name}' if habit else 'day streak'
        if score <= 0 and user != viewer:
            continue
        rows.append({
            'user_id': str(profile.external_user_id),
            'name': display_name(user, profile),
            'avatar_url': profile.avatar_image.url if profile.avatar_image else profile.avatar_url,
            'score': score,
            'detail': detail,
            'is_me': user == viewer,
        })
    rows.sort(key=lambda r: (-r['score'], r['name'].lower()))
    for index, row in enumerate(rows, start=1):
        row['rank'] = index
    mine = next((r for r in rows if r['is_me']), None)
    return {'metric': metric, 'rows': rows[:limit], 'me': mine}
