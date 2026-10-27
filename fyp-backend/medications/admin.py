from django.contrib import admin

from .models import Medication, MedicationLog


@admin.register(Medication)
class MedicationAdmin(admin.ModelAdmin):
    list_display = ('name', 'dosage', 'frequency', 'user', 'supply_count', 'refill_threshold', 'is_active')
    list_filter = ('frequency', 'is_active')
    search_fields = ('name', 'user__username')


@admin.register(MedicationLog)
class MedicationLogAdmin(admin.ModelAdmin):
    list_display = ('medication', 'status', 'scheduled_time', 'taken_at', 'user')
    list_filter = ('status',)
    search_fields = ('medication__name', 'user__username')
