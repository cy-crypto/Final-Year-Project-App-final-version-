import datetime

from rest_framework import serializers

from .models import Habit
from .services import live_streak, week_start

RATE_DAYS = 30


class HabitSerializer(serializers.ModelSerializer):
    """Habit plus progress worked out for the user's today (passed as context['today'])."""

    done_today = serializers.SerializerMethodField()
    current_streak = serializers.SerializerMethodField()
    week_count = serializers.SerializerMethodField()
    last_7_days = serializers.SerializerMethodField()
    rate_30d = serializers.SerializerMethodField()

    class Meta:
        model = Habit
        fields = [
            'id',
            'user_id',
            'name',
            'description',
            'frequency',
            'category',
            'target_per_week',
            'streak_count',
            'best_streak',
            'current_streak',
            'last_completed_date',
            'reminder_time',
            'is_archived',
            'done_today',
            'week_count',
            'last_7_days',
            'rate_30d',
            'created_at',
        ]
        read_only_fields = ['id', 'user_id', 'streak_count', 'best_streak', 'last_completed_date', 'created_at']

    def _today(self):
        return self.context.get('today') or datetime.date.today()

    def _dates(self, obj):
        cache = self.context.setdefault('_dates', {})
        if obj.pk not in cache:
            since = self._today() - datetime.timedelta(days=RATE_DAYS + 7)
            cache[obj.pk] = {
                c.completed_date for c in obj.habitcompletion_set.all() if c.completed_date >= since
            }
        return cache[obj.pk]

    def get_done_today(self, obj):
        return self._today() in self._dates(obj)

    def get_current_streak(self, obj):
        return live_streak(obj, self._today())

    def get_week_count(self, obj):
        start = week_start(self._today())
        return sum(1 for d in self._dates(obj) if d >= start)

    def get_last_7_days(self, obj):
        today, dates = self._today(), self._dates(obj)
        return [
            {'date': (today - datetime.timedelta(days=i)).isoformat(), 'done': (today - datetime.timedelta(days=i)) in dates}
            for i in range(6, -1, -1)
        ]

    def get_rate_30d(self, obj):
        """Share of the last 30 days (or weeks' targets) completed, counted from when the habit was created."""
        today, dates = self._today(), self._dates(obj)
        created = obj.created_at.date() if obj.created_at else today
        days = max(1, min(RATE_DAYS, (today - created).days + 1))
        recent = sum(1 for d in dates if (today - d).days < days)
        if obj.frequency == Habit.FREQUENCY_WEEKLY:
            expected = max(1, round(days / 7 * obj.target_per_week))
        else:
            expected = days
        return min(100, round(recent * 100 / expected))

    def validate_name(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError('Give the habit a name.')
        return value

    def validate_target_per_week(self, value):
        if not 1 <= value <= 7:
            raise serializers.ValidationError('Pick 1 to 7 times a week.')
        return value
