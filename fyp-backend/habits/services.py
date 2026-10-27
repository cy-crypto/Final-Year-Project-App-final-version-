"""Streaks are worked out from the completion history, so undoing or back-filling a day keeps them right.

Daily habit: the streak is the run of consecutive days ending today or yesterday.
Weekly habit: a week (Monday-Sunday) counts once it has `target_per_week` check-ins; the streak is
the run of such weeks ending this week or last week (this week may still be in progress).
"""
import datetime
from collections import Counter

from .models import Habit, HabitCompletion


def week_start(day):
	return day - datetime.timedelta(days=day.weekday())


def _runs(items, step):
	"""Yield (run_length, last_item) for runs of consecutive items `step` apart (items sorted)."""
	run, prev = 0, None
	for item in items:
		run = run + 1 if prev is not None and item - prev == step else 1
		prev = item
		yield run, item


def streaks_from_dates(habit, dates, today):
	"""Return (current_streak, best_streak) for sorted completion dates."""
	if habit.frequency == Habit.FREQUENCY_WEEKLY:
		counts = Counter(week_start(d) for d in dates)
		weeks = sorted(w for w, c in counts.items() if c >= max(habit.target_per_week, 1))
		best = current = 0
		for run, last in _runs(weeks, datetime.timedelta(days=7)):
			best = max(best, run)
			current = run if last >= week_start(today) - datetime.timedelta(days=7) else 0
		return current, best

	best = current = 0
	for run, last in _runs(dates, datetime.timedelta(days=1)):
		best = max(best, run)
		current = run if (today - last).days <= 1 else 0
	return current, best


def recalculate(habit, today):
	dates = sorted(set(HabitCompletion.objects.filter(habit=habit).values_list('completed_date', flat=True)))
	current, best = streaks_from_dates(habit, dates, today)
	habit.streak_count = current
	habit.best_streak = max(best, current)
	habit.last_completed_date = dates[-1] if dates else None
	habit.save(update_fields=['streak_count', 'best_streak', 'last_completed_date'])
	return habit


def complete_habit(habit, today, day=None):
	"""Mark a habit done for `day` (default `today`), updating its streak. Returns the habit."""
	HabitCompletion.objects.get_or_create(habit=habit, completed_date=day or today)
	return recalculate(habit, today)


def uncomplete_habit(habit, today, day=None):
	HabitCompletion.objects.filter(habit=habit, completed_date=day or today).delete()
	return recalculate(habit, today)


def live_streak(habit, today):
	"""The stored streak, or 0 when it has lapsed since it was last recalculated."""
	last = habit.last_completed_date
	if not last:
		return 0
	if habit.frequency == Habit.FREQUENCY_WEEKLY:
		alive = week_start(last) >= week_start(today) - datetime.timedelta(days=7)
	else:
		alive = (today - last).days <= 1
	return habit.streak_count if alive else 0
