from django.db import models
from django.contrib.auth.models import User


class Medication(models.Model):
    FREQUENCY_CHOICES = [
        ('daily', 'Daily'),
        ('twice_daily', 'Twice Daily'),
        ('three_times_daily', 'Three Times Daily'),
        ('weekly', 'Weekly'),
        ('as_needed', 'As Needed'),
    ]
    
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='medications')
    name = models.CharField(max_length=200)
    dosage = models.CharField(max_length=100)
    frequency = models.CharField(max_length=50, choices=FREQUENCY_CHOICES, default='daily')
    schedule_times = models.JSONField(default=list)
    supply_count = models.IntegerField(default=0)
    refill_threshold = models.IntegerField(default=7)
    notes = models.TextField(blank=True, null=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.name} - {self.dosage}"


class MedicationLog(models.Model):
    STATUS_CHOICES = [
        ('taken', 'Taken'),
        ('skipped', 'Skipped'),
        ('deferred', 'Deferred'),
    ]
    
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='medication_logs')
    medication = models.ForeignKey(Medication, on_delete=models.CASCADE, related_name='logs')
    status = models.CharField(max_length=20, choices=STATUS_CHOICES)
    scheduled_time = models.DateTimeField()
    taken_at = models.DateTimeField(blank=True, null=True)
    notes = models.TextField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.medication.name} - {self.status} - {self.scheduled_time}"
