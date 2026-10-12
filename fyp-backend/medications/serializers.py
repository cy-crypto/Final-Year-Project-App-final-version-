from rest_framework import serializers
from .models import Medication, MedicationLog


class MedicationSerializer(serializers.ModelSerializer):
    user = serializers.ReadOnlyField(source='user.username')

    class Meta:
        model = Medication
        fields = [
            'id', 'user', 'name', 'dosage', 'frequency', 'schedule_times',
            'supply_count', 'refill_threshold', 'notes', 'is_active',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'user', 'created_at', 'updated_at']


class MedicationLogSerializer(serializers.ModelSerializer):
    user = serializers.ReadOnlyField(source='user.username')
    medication_name = serializers.CharField(source='medication.name', read_only=True)

    class Meta:
        model = MedicationLog
        fields = [
            'id', 'user', 'medication', 'medication_name', 'status',
            'scheduled_time', 'taken_at', 'notes', 'created_at'
        ]
        read_only_fields = ['id', 'user', 'created_at']
