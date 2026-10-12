from django.db import models


class Habit(models.Model):
	FREQUENCY_DAILY = 'Daily'
	FREQUENCY_WEEKLY = 'Weekly'

	FREQUENCY_CHOICES = [
		(FREQUENCY_DAILY, 'Daily'),
		(FREQUENCY_WEEKLY, 'Weekly'),
	]

	CATEGORY_CHOICES = [
		('Health', 'Health'),
		('Fitness', 'Fitness'),
		('Study', 'Study'),
		('Mindfulness', 'Mindfulness'),
		('Finance', 'Finance'),
		('Other', 'Other'),
	]

	name = models.CharField(max_length=255)
	frequency = models.CharField(max_length=10, choices=FREQUENCY_CHOICES, default=FREQUENCY_DAILY)
	category = models.CharField(max_length=20, choices=CATEGORY_CHOICES, default='Other')
	user_id = models.UUIDField(null=True, blank=True, db_index=True)
	streak_count = models.PositiveIntegerField(default=0)
	best_streak = models.PositiveIntegerField(default=0)
	last_completed_date = models.DateField(null=True, blank=True)
	reminder_time = models.TimeField(null=True, blank=True)

	class Meta:
		ordering = ['-id']

	def __str__(self):
		return self.name


class HabitCompletion(models.Model):
	habit = models.ForeignKey(Habit, on_delete=models.CASCADE)
	completed_date = models.DateField()

	class Meta:
		unique_together = ['habit', 'completed_date']
		ordering = ['-completed_date']

	def __str__(self):
		return f"{self.habit.name} - {self.completed_date}"
