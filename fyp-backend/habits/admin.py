from django.contrib import admin

from .models import Habit, HabitCompletion


admin.site.register(Habit)
admin.site.register(HabitCompletion)
