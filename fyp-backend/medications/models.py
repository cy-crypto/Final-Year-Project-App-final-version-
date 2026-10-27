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
    # Local "HH:MM" times, sorted. Empty for as-needed medicines.
    schedule_times = models.JSONField(default=list)
    # Weekly medicines only: weekdays to take it on, 0 = Monday ... 6 = Sunday.
    days_of_week = models.JSONField(default=list, blank=True)
    start_date = models.DateField(null=True, blank=True)
    end_date = models.DateField(null=True, blank=True)
    # Units (tablets, ml...) taken per dose; supply goes down by this much on each taken dose.
    dose_units = models.PositiveIntegerField(default=1)
    supply_count = models.IntegerField(default=0)
    refill_threshold = models.IntegerField(default=7)
    notes = models.TextField(blank=True, null=True)
    # FR-05.5: doctor's orders kept with the medicine.
    doctor_name = models.CharField(max_length=120, blank=True, default='')
    instructions = models.TextField(blank=True, default='')
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.name} - {self.dosage}"

    @property
    def needs_refill(self):
        return self.is_active and self.supply_count <= self.refill_threshold

    def doses_per_day(self):
        if self.frequency == 'as_needed':
            return 0
        if self.frequency == 'weekly':
            return len(self.schedule_times) * max(len(self.days_of_week), 1) / 7
        return len(self.schedule_times)

    def days_of_supply_left(self):
        per_day = self.doses_per_day() * self.dose_units
        if per_day <= 0:
            return None
        return int(max(self.supply_count, 0) // per_day)

    def is_scheduled_on(self, day):
        """Whether doses are due on `day` (a local date)."""
        if not self.is_active or self.frequency == 'as_needed' or not self.schedule_times:
            return False
        if self.start_date and day < self.start_date:
            return False
        if self.end_date and day > self.end_date:
            return False
        if self.frequency == 'weekly':
            return day.weekday() in (self.days_of_week or [])
        return True


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
    # The schedule slot this log answers ("08:00"), blank for as-needed doses.
    dose_time = models.CharField(max_length=5, blank=True, default='')
    taken_at = models.DateTimeField(blank=True, null=True)
    notes = models.TextField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-scheduled_time', '-created_at']

    def __str__(self):
        return f"{self.medication.name} - {self.status} - {self.scheduled_time}"
