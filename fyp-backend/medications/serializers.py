import re

from rest_framework import serializers

from .models import Medication, MedicationLog

TIME_RE = re.compile(r'^([01]\d|2[0-3]):[0-5]\d$')
REQUIRED_TIMES = {'twice_daily': 2, 'three_times_daily': 3}


class MedicationSerializer(serializers.ModelSerializer):
    user = serializers.ReadOnlyField(source='user.username')
    needs_refill = serializers.BooleanField(read_only=True)
    days_of_supply_left = serializers.SerializerMethodField()

    class Meta:
        model = Medication
        fields = [
            'id', 'user', 'name', 'dosage', 'frequency', 'schedule_times', 'days_of_week',
            'start_date', 'end_date', 'dose_units', 'supply_count', 'refill_threshold',
            'notes', 'doctor_name', 'instructions', 'is_active', 'needs_refill',
            'days_of_supply_left', 'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'user', 'created_at', 'updated_at']

    def get_days_of_supply_left(self, obj):
        return obj.days_of_supply_left()

    def validate_name(self, value):
        if not value.strip():
            raise serializers.ValidationError('Name is required.')
        return value.strip()

    def validate_dosage(self, value):
        if not value.strip():
            raise serializers.ValidationError('Dosage is required.')
        return value.strip()

    def validate_schedule_times(self, value):
        if not isinstance(value, list):
            raise serializers.ValidationError('Send a list of times like ["08:00", "20:00"].')
        cleaned = []
        for item in value:
            text = str(item).strip()
            if len(text) == 4 and text[1] == ':':
                text = f'0{text}'
            if not TIME_RE.match(text):
                raise serializers.ValidationError(f'"{item}" is not a valid 24h time (HH:MM).')
            cleaned.append(text)
        if len(set(cleaned)) != len(cleaned):
            raise serializers.ValidationError('Each dose time can only be used once.')
        return sorted(cleaned)

    def validate_days_of_week(self, value):
        if not isinstance(value, list) or any(not isinstance(d, int) or not 0 <= d <= 6 for d in value):
            raise serializers.ValidationError('Days must be numbers 0 (Monday) to 6 (Sunday).')
        return sorted(set(value))

    def validate(self, attrs):
        get = lambda key, default=None: attrs.get(key, getattr(self.instance, key, default))
        frequency = get('frequency', 'daily')
        times = get('schedule_times', []) or []
        days = get('days_of_week', []) or []

        if frequency == 'as_needed':
            attrs['schedule_times'] = []
            attrs['days_of_week'] = []
        else:
            needed = REQUIRED_TIMES.get(frequency)
            if needed and len(times) != needed:
                raise serializers.ValidationError({'schedule_times': f'This frequency needs exactly {needed} dose times.'})
            if not times:
                raise serializers.ValidationError({'schedule_times': 'Add at least one dose time.'})
            if frequency == 'weekly':
                if not days:
                    raise serializers.ValidationError({'days_of_week': 'Pick the days to take it on.'})
            else:
                attrs['days_of_week'] = []

        start, end = get('start_date'), get('end_date')
        if start and end and end < start:
            raise serializers.ValidationError({'end_date': 'End date cannot be before the start date.'})
        for field in ('supply_count', 'refill_threshold'):
            if field in attrs and attrs[field] < 0:
                raise serializers.ValidationError({field: 'Cannot be negative.'})
        if 'dose_units' in attrs and attrs['dose_units'] < 1:
            raise serializers.ValidationError({'dose_units': 'At least 1 unit per dose.'})
        return attrs


class MedicationLogSerializer(serializers.ModelSerializer):
    user = serializers.ReadOnlyField(source='user.username')
    medication_name = serializers.CharField(source='medication.name', read_only=True)
    medication_dosage = serializers.CharField(source='medication.dosage', read_only=True)

    class Meta:
        model = MedicationLog
        fields = [
            'id', 'user', 'medication', 'medication_name', 'medication_dosage', 'status',
            'scheduled_time', 'dose_time', 'taken_at', 'notes', 'created_at',
        ]
        read_only_fields = ['id', 'user', 'created_at']

    def validate_medication(self, value):
        request = self.context.get('request')
        if request and value.user_id != request.user.id:
            raise serializers.ValidationError('Medication not found.')
        return value


class LogDoseSerializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=['taken', 'skipped', 'deferred'], default='taken')
    dose_time = serializers.CharField(required=False, allow_blank=True, default='')
    date = serializers.DateField(required=False)
    notes = serializers.CharField(required=False, allow_blank=True, default='')
