# Serializers for the live Supabase-backed tables `fitness_records` and `fitness_goals`
# (see fitness/models.py) — schema-locked, not arbitrary Django fields.

from rest_framework import serializers
from django.utils import timezone
from django.utils.dateparse import parse_datetime
from accounts.timezones import user_tz

from .models import FitnessGoal, FitnessProfile, FitnessRecord, WaterIntake, WorkoutRoutine, SleepRecord
from .services import goal_progress, elapsed_minutes
from .calories import effective_calories, profile_ready, steps_available, STEP_RATIO
from decimal import Decimal


class FitnessRecordSerializer(serializers.ModelSerializer):
    steps = serializers.IntegerField(min_value=0, max_value=2147483647, required=False)
    steps_available = serializers.SerializerMethodField()
    effective_calories_burned = serializers.SerializerMethodField()
    calorie_source = serializers.SerializerMethodField()
    clear_manual_calories = serializers.BooleanField(write_only=True, required=False, default=False)
    today_only = serializers.BooleanField(write_only=True, required=False, default=False)
    class Meta:
        model = FitnessRecord
        fields = [
            'id', 'user_id', 'date', 'steps', 'calories_burned',
            'sleep_duration_minutes', 'workout_log', 'created_at', 'updated_at',
            'steps_available', 'steps_recorded_at', 'steps_observed_at', 'step_source',
            'estimated_active_calories', 'calorie_estimate_metadata', 'manual_calories_recorded_at',
            'effective_calories_burned', 'calorie_source', 'clear_manual_calories',
            'today_only',
        ]
        read_only_fields = ['id', 'user_id', 'created_at', 'updated_at', 'steps_recorded_at',
                            'estimated_active_calories', 'calorie_estimate_metadata', 'manual_calories_recorded_at']

    def get_steps_available(self, obj):
        return steps_available(obj)

    def get_effective_calories_burned(self, obj):
        value, _ = effective_calories(obj)
        return str(value) if value is not None else None

    def get_calorie_source(self, obj):
        return effective_calories(obj)[1]

    def validate_steps_observed_at(self, value):
        raw = self.initial_data.get('steps_observed_at')
        try:
            parsed = parse_datetime(raw) if isinstance(raw, str) else None
        except (ValueError, TypeError):
            parsed = None
        if parsed is None or timezone.is_naive(parsed):
            raise serializers.ValidationError('A step snapshot needs an ISO timestamp with a timezone offset.')
        return value

    def validate(self, attrs):
        if attrs.get('clear_manual_calories') and 'calories_burned' in attrs:
            raise serializers.ValidationError('Choose either a manual calorie value or clear the override.')
        if 'steps_observed_at' in attrs and attrs['steps_observed_at'] is None:
            raise serializers.ValidationError({'steps_observed_at': 'A sensor reading needs its observation time.'})
        if attrs.get('step_source') == 'sensor' and ('steps' not in attrs or not attrs.get('steps_observed_at')):
            raise serializers.ValidationError('Sensor totals require steps and an observation timestamp.')
        return attrs

    def validate_workout_log(self, value):
        if value is None:
            return value
        if not isinstance(value, list):
            raise serializers.ValidationError("workout_log must be a list of workout entries.")
        if not all(isinstance(entry, dict) for entry in value):
            raise serializers.ValidationError("Each workout_log entry must be an object.")
        return value

    # (user_id, date) uniqueness means POST should behave like an upsert (one record per
    # user per day) from the client's perspective — that get-or-update-on-conflict logic
    # belongs in the view layer (Step 4), not here; this serializer only validates/
    # serializes whatever record it's given.


class FitnessGoalSerializer(serializers.ModelSerializer):
    goal_type = serializers.ChoiceField(choices=FitnessGoal.GOAL_TYPE_CHOICES)
    unit = serializers.SerializerMethodField()
    progress = serializers.SerializerMethodField()

    class Meta:
        model = FitnessGoal
        fields = ['id', 'user_id', 'goal_type', 'target_value', 'is_active', 'unit', 'progress', 'created_at', 'updated_at']
        read_only_fields = ['id', 'user_id', 'created_at', 'updated_at']
        validators = []  # Ownership and active-only uniqueness are enforced in the view/database.

    def get_progress(self, obj):
        return goal_progress(obj, self.context['request'].user, records=self.context.get('period_records'))

    def validate(self, attrs):
        kind = attrs.get('goal_type', getattr(self.instance, 'goal_type', None))
        target = attrs.get('target_value', getattr(self.instance, 'target_value', None))
        if target is not None and kind in ('steps', 'workout_frequency') and target != target.to_integral_value():
            raise serializers.ValidationError({'target_value': 'Steps and workout sessions must be whole numbers.'})
        return attrs

    def get_unit(self, obj):
        units = {
            FitnessGoal.GOAL_STEPS: 'steps',
            FitnessGoal.GOAL_CALORIES: 'kcal',
            FitnessGoal.GOAL_SLEEP: 'minutes',
            FitnessGoal.GOAL_WORKOUT_FREQUENCY: 'sessions/week',
        }
        return units.get(obj.goal_type, '')

    # (user_id, goal_type) uniqueness means creating a goal of a type the user already has
    # should also behave like an upsert — deferred to the view layer (Step 4), not here.


class FitnessProfileSerializer(serializers.ModelSerializer):
    gender = serializers.ChoiceField(choices=FitnessProfile.GENDER_CHOICES, required=False, allow_null=True)
    suggested_step_goal = serializers.SerializerMethodField()
    estimated_stride_cm = serializers.SerializerMethodField()
    weight_kg = serializers.DecimalField(max_digits=5, decimal_places=2, min_value=Decimal('25'), max_value=Decimal('350'), allow_null=True, required=False)
    age = serializers.IntegerField(min_value=18, max_value=120, allow_null=True, required=False)
    height_cm = serializers.DecimalField(max_digits=5, decimal_places=1, min_value=Decimal('100'), max_value=Decimal('250'), allow_null=True, required=False)
    calorie_profile_ready = serializers.SerializerMethodField()

    class Meta:
        model = FitnessProfile
        fields = [
            'id', 'user_id', 'gender', 'height_cm', 'water_goal_ml',
            'suggested_step_goal', 'estimated_stride_cm', 'created_at', 'updated_at',
            'weight_kg', 'age', 'display_units', 'calorie_profile_ready',
        ]
        read_only_fields = ['id', 'user_id', 'created_at', 'updated_at']

    def get_suggested_step_goal(self, obj):
        # Transparent heuristic starting point, not a clinically derived value — a base
        # of ~8000 steps/day (a commonly cited public-health baseline) with a small bump
        # for the male average being slightly higher. Present this to users as an
        # editable suggestion, never as a prescription. height_cm isn't actually used in
        # this calculation, but its presence is still required so the field stays
        # meaningful once a future version factors height in.
        if not obj.gender or obj.height_cm is None:
            return None
        suggestion = 8000
        if obj.gender == FitnessProfile.GENDER_MALE:
            suggestion += 500
        return suggestion

    def get_estimated_stride_cm(self, obj):
        # Legacy API field name retained. This is ONE step's length, not a two-step
        # stride; expose the same documented approximation as the calorie model.
        if obj.height_cm is None:
            return None
        return round(float(obj.height_cm * STEP_RATIO), 1)

    def get_calorie_profile_ready(self, obj):
        return profile_ready(obj)


class WaterIntakeSerializer(serializers.ModelSerializer):
    class Meta:
        model = WaterIntake
        fields = ['id', 'user_id', 'date', 'amount_ml', 'created_at', 'updated_at']
        read_only_fields = ['id', 'user_id', 'created_at', 'updated_at']


class WorkoutRoutineSerializer(serializers.ModelSerializer):
    class Meta:
        model = WorkoutRoutine
        fields = ['id', 'user_id', 'name', 'exercises', 'created_at', 'updated_at']
        read_only_fields = ['id', 'user_id', 'created_at', 'updated_at']

    def validate_exercises(self, value):
        if value is None:
            return value
        if not isinstance(value, list):
            raise serializers.ValidationError("exercises must be a list of exercise entries.")
        if not all(isinstance(entry, dict) for entry in value):
            raise serializers.ValidationError("Each exercise entry must be an object.")
        # Unlike FitnessRecordSerializer.validate_workout_log (a historical log, where
        # partial info is still worth keeping), a routine entry IS the instruction for what
        # to do — sets/reps/duration_min are legitimately optional (an exercise can be
        # rep-based or duration-based), but an entry with no exercise name isn't a partially
        # complete record, it's just broken data, so this is enforced rather than left loose.
        for entry in value:
            exercise_name = entry.get('exercise')
            if not isinstance(exercise_name, str) or not exercise_name.strip():
                raise serializers.ValidationError(
                    "Each exercise entry must include a non-empty 'exercise' name."
                )
        return value


class OffsetDateTimeField(serializers.DateTimeField):
    def to_internal_value(self, value):
        if not isinstance(value, str):
            raise serializers.ValidationError('Use an ISO date/time with a timezone offset.')
        try:
            parsed = parse_datetime(value)
        except (ValueError, TypeError):
            parsed = None
        if parsed is None or timezone.is_naive(parsed):
            raise serializers.ValidationError('Use a valid ISO date/time with a timezone offset.')
        return super().to_internal_value(value)


class SleepRecordSerializer(serializers.ModelSerializer):
    bedtime = OffsetDateTimeField()
    wake_time = OffsetDateTimeField()
    duration_minutes = serializers.SerializerMethodField()
    wake_date = serializers.SerializerMethodField()

    class Meta:
        model = SleepRecord
        fields = ['id', 'bedtime', 'wake_time', 'duration_minutes', 'wake_date', 'created_at', 'updated_at']
        read_only_fields = ['id', 'duration_minutes', 'wake_date', 'created_at', 'updated_at']

    def get_duration_minutes(self, obj):
        return round(elapsed_minutes(obj.bedtime, obj.wake_time), 2)

    def get_wake_date(self, obj):
        return obj.wake_time.astimezone(user_tz(self.context['request'].user)).date().isoformat()

    def validate(self, attrs):
        bed = attrs.get('bedtime', getattr(self.instance, 'bedtime', None))
        wake = attrs.get('wake_time', getattr(self.instance, 'wake_time', None))
        if bed and wake:
            if wake <= bed:
                raise serializers.ValidationError({'wake_time': 'Wake-up must be after bedtime.'})
            if wake > timezone.now():
                raise serializers.ValidationError({'wake_time': 'Completed sleep cannot be in the future.'})
        return attrs

    def validate_overlap(self, user_id):
        bed = self.validated_data.get('bedtime', getattr(self.instance, 'bedtime', None))
        wake = self.validated_data.get('wake_time', getattr(self.instance, 'wake_time', None))
        rows = SleepRecord.objects.filter(user_id=user_id, bedtime__lt=wake, wake_time__gt=bed)
        if self.instance:
            rows = rows.exclude(pk=self.instance.pk)
        if rows.exists():
            raise serializers.ValidationError('This interval overlaps an existing sleep record.')
