from django.db import models


class SavedLocation(models.Model):
	user_id = models.UUIDField(db_index=True)
	city = models.CharField(max_length=120)
	label = models.CharField(max_length=120, blank=True)
	created_at = models.DateTimeField(auto_now_add=True)

	class Meta:
		ordering = ['-created_at']
		constraints = [
			models.UniqueConstraint(fields=['user_id', 'city'], name='unique_city_per_user')
		]

	def __str__(self):
		return f'{self.user_id} - {self.city}'


class WeatherCache(models.Model):
	city_key = models.CharField(max_length=120, unique=True, db_index=True)
	city_name = models.CharField(max_length=120)
	payload = models.JSONField()
	fetched_at = models.DateTimeField(db_index=True)

	class Meta:
		ordering = ['-fetched_at']

	def __str__(self):
		return f'{self.city_name} @ {self.fetched_at.isoformat()}'
