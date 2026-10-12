import uuid
from decimal import Decimal

from django.core.validators import MinValueValidator
from django.db import models
from django.utils import timezone


class FitnessRecord(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user_id = models.UUIDField(db_index=True)
    date = models.DateField(default=timezone.now)
    steps = models.IntegerField(default=0, validators=[MinValueValidator(0)])
    calories_burned = models.DecimalField(
        max_digits=12, decimal_places=2, default=0, validators=[MinValueValidator(0)],
    )
    sleep_duration_minutes = models.IntegerField(null=True, blank=True, validators=[MinValueValidator(0)])
    workout_log = models.JSONField(null=True, blank=True)
    created_at = models.DateTimeField(default=timezone.now, editable=False)
    updated_at = models.DateTimeField(default=timezone.now, editable=False)

    class Meta:
        db_table = 'fitness_records'
        ordering = ['-date']
        constraints = [
            models.UniqueConstraint(fields=['user_id', 'date'], name='unique_fitness_record_per_user_per_day'),
        ]

    def __str__(self):
        return f"{self.user_id} - {self.date}"


class FitnessGoal(models.Model):
    GOAL_STEPS = 'steps'
    GOAL_CALORIES = 'calories'
    GOAL_SLEEP = 'sleep'
    GOAL_WORKOUT_FREQUENCY = 'workout_frequency'

    GOAL_TYPE_CHOICES = [
        (GOAL_STEPS, 'steps'),
        (GOAL_CALORIES, 'calories'),
        (GOAL_SLEEP, 'sleep'),
        (GOAL_WORKOUT_FREQUENCY, 'workout_frequency'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user_id = models.UUIDField(db_index=True)
    goal_type = models.CharField(max_length=20, choices=GOAL_TYPE_CHOICES)
    target_value = models.DecimalField(max_digits=12, decimal_places=2, validators=[MinValueValidator(0.01)])
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(default=timezone.now, editable=False)
    updated_at = models.DateTimeField(default=timezone.now, editable=False)

    class Meta:
        db_table = 'fitness_goals'
        constraints = [
            models.UniqueConstraint(fields=['user_id', 'goal_type'], name='unique_fitness_goal_per_user_per_type'),
        ]

    def __str__(self):
        return f"{self.user_id} - {self.goal_type}"


class FitnessProfile(models.Model):
    GENDER_MALE = 'male'
    GENDER_FEMALE = 'female'
    GENDER_OTHER = 'other'

    GENDER_CHOICES = [
        (GENDER_MALE, 'male'),
        (GENDER_FEMALE, 'female'),
        (GENDER_OTHER, 'other'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user_id = models.UUIDField(unique=True)
    gender = models.CharField(max_length=10, choices=GENDER_CHOICES, null=True, blank=True)
    height_cm = models.DecimalField(
        max_digits=5, decimal_places=1, null=True, blank=True, validators=[MinValueValidator(Decimal('0.1'))],
    )
    water_goal_ml = models.IntegerField(default=2000, validators=[MinValueValidator(1)])
    created_at = models.DateTimeField(default=timezone.now, editable=False)
    updated_at = models.DateTimeField(default=timezone.now, editable=False)

    class Meta:
        db_table = 'fitness_profile'

    def __str__(self):
        return f"{self.user_id}"


class WaterIntake(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user_id = models.UUIDField(db_index=True)
    date = models.DateField(default=timezone.now)
    amount_ml = models.IntegerField(default=0, validators=[MinValueValidator(0)])
    created_at = models.DateTimeField(default=timezone.now, editable=False)
    updated_at = models.DateTimeField(default=timezone.now, editable=False)

    class Meta:
        db_table = 'water_intake'
        ordering = ['-date']
        constraints = [
            models.UniqueConstraint(fields=['user_id', 'date'], name='unique_water_intake_per_user_per_day'),
        ]

    def __str__(self):
        return f"{self.user_id} - {self.date}"


class WorkoutRoutine(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user_id = models.UUIDField(db_index=True)
    name = models.CharField(max_length=100)
    exercises = models.JSONField(default=list)
    created_at = models.DateTimeField(default=timezone.now, editable=False)
    updated_at = models.DateTimeField(default=timezone.now, editable=False)

    class Meta:
        db_table = 'workout_routines'
        constraints = [
            models.UniqueConstraint(fields=['user_id', 'name'], name='unique_workout_routine_per_user_per_name'),
        ]

    def __str__(self):
        return f"{self.user_id} - {self.name}"
