from django.db import models
from django.contrib.auth.models import User


class Task(models.Model):
	PRIORITY_LOW = 'low'
	PRIORITY_MEDIUM = 'medium'
	PRIORITY_HIGH = 'high'

	PRIORITY_CHOICES = [
		(PRIORITY_LOW, 'Low'),
		(PRIORITY_MEDIUM, 'Medium'),
		(PRIORITY_HIGH, 'High'),
	]
	
	STATUS_PENDING = 'pending'
	STATUS_IN_PROGRESS = 'in_progress'
	STATUS_DONE = 'done'
	
	STATUS_CHOICES = [
		(STATUS_PENDING, 'Pending'),
		(STATUS_IN_PROGRESS, 'In Progress'),
		(STATUS_DONE, 'Done'),
	]

	title = models.CharField(max_length=255)
	description = models.TextField(blank=True, null=True)
	category = models.CharField(max_length=100, blank=True)
	priority = models.CharField(max_length=10, choices=PRIORITY_CHOICES, default=PRIORITY_MEDIUM)
	status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_PENDING)
	deadline = models.DateField(null=True, blank=True)
	reminder_time = models.DateTimeField(null=True, blank=True)
	time_slot_start = models.DateTimeField(null=True, blank=True)
	time_slot_end = models.DateTimeField(null=True, blank=True)
	links = models.JSONField(default=list, blank=True)
	time_spent = models.IntegerField(default=0, null=True, blank=True)
	progress_percentage = models.IntegerField(default=0)
	email_reminder_enabled = models.BooleanField(default=False)
	attachment = models.FileField(upload_to='task_attachments/', blank=True, null=True)
	user = models.ForeignKey(User, on_delete=models.CASCADE, db_index=True)
	created_at = models.DateTimeField(auto_now_add=True)
	updated_at = models.DateTimeField(auto_now=True)

	class Meta:
		ordering = ['-created_at']

	def __str__(self):
		return self.title


class TaskAttachment(models.Model):
	ATTACHMENT_TYPE_FILE = 'file'
	ATTACHMENT_TYPE_URL = 'url'
	
	ATTACHMENT_TYPE_CHOICES = [
		(ATTACHMENT_TYPE_FILE, 'File'),
		(ATTACHMENT_TYPE_URL, 'URL'),
	]
	
	task = models.ForeignKey(Task, on_delete=models.CASCADE, related_name='attachments')
	attachment_type = models.CharField(max_length=10, choices=ATTACHMENT_TYPE_CHOICES, default=ATTACHMENT_TYPE_FILE)
	file = models.FileField(upload_to='task_attachments/', null=True, blank=True)
	url = models.URLField(null=True, blank=True)
	created_at = models.DateTimeField(auto_now_add=True)
	
	class Meta:
		ordering = ['-created_at']
	
	def __str__(self):
		return f"{self.task.title} - {self.attachment_type}"
