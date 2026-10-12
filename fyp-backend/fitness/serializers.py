# Serializers for the live Supabase-backed tables `fitness_records` and `fitness_goals`
# (see fitness/models.py) — schema-locked, not arbitrary Django fields.

from rest_framework import serializers

from .models import FitnessGoal, FitnessProfile, FitnessRecord, WaterIntake, WorkoutRoutine


class FitnessRecordSerializer(serializers.ModelSerializer):
    class Meta:
        model = FitnessRecord
        fields = [
            'id', 'user_id', 'date', 'steps', 'calories_burned',
            'sleep_duration_minutes', 'workout_log', 'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'user_id', 'created_at', 'updated_at']

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

    class Meta:
        model = FitnessGoal
        fields = ['id', 'user_id', 'goal_type', 'target_value', 'is_active', 'unit', 'created_at', 'updated_at']
        read_only_fields = ['id', 'user_id', 'created_at', 'updated_at']

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

    class Meta:
        model = FitnessProfile
        fields = [
            'id', 'user_id', 'gender', 'height_cm', 'water_goal_ml',
            'suggested_step_goal', 'estimated_stride_cm', 'created_at', 'updated_at',
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
        # Rough approximation using a commonly cited stride-length-to-height ratio
        # (~0.415) for walking — good enough for ballpark distance estimates, not a
        # precise measurement.
        if obj.height_cm is None:
            return None
        return round(float(obj.height_cm) * 0.415, 1)


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
