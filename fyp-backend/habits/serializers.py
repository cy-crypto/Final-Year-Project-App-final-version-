from rest_framework import serializers

from .models import Habit


class HabitSerializer(serializers.ModelSerializer):
    class Meta:
        model = Habit
        fields = [
            'id',
            'user_id',
            'name',
            'frequency',
            'category',
            'streak_count',
            'best_streak',
            'last_completed_date',
            'reminder_time',
        ]
        read_only_fields = ['id', 'user_id', 'streak_count', 'last_completed_date']
