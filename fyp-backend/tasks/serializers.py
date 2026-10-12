from rest_framework import serializers
from django.utils import timezone

from .models import Task, TaskAttachment


class TaskAttachmentSerializer(serializers.ModelSerializer):
	class Meta:
		model = TaskAttachment
		fields = [
			'id',
			'attachment_type',
			'file',
			'url',
			'created_at',
		]
		read_only_fields = ['id', 'created_at']

	def get_file_url(self, obj):
		if obj.file:
			request = self.context.get('request')
			if request:
				return request.build_absolute_uri(obj.file.url)
			return obj.file.url
		return None


class TaskSerializer(serializers.ModelSerializer):
	attachments = TaskAttachmentSerializer(many=True, read_only=True)
	attachment = serializers.FileField(required=False, allow_null=True)
	time_spent_seconds = serializers.ReadOnlyField()
	progress_percentage = serializers.ReadOnlyField()
	deadline = serializers.DateField(required=False, allow_null=True)
	description = serializers.CharField(required=False, allow_blank=True)
	email_reminder_enabled = serializers.BooleanField(required=False)
	
	class Meta:
		model = Task
		fields = [
			'id',
			'title',
			'description',
			'category',
			'priority',
			'status',
			'deadline',
			'reminder_time',
			'time_slot_start',
			'time_slot_end',
			'links',
			'time_spent',
			'time_spent_seconds',
			'progress_percentage',
			'email_reminder_enabled',
			'attachment',
			'attachments',
			'created_at',
			'updated_at',
		]
		read_only_fields = ['id', 'time_spent', 'created_at', 'updated_at']

	def validate_deadline(self, value):
		# Allow any date - no validation needed
		return value

	def validate_time_slot_end(self, value):
		if value and self.initial_data.get('time_slot_start'):
			start = self.initial_data.get('time_slot_start')
			if isinstance(start, str):
				from datetime import datetime
				start = datetime.fromisoformat(start.replace('Z', '+00:00'))
			if value <= start:
				raise serializers.ValidationError("End time must be after start time.")
		return value


class TaskCreateSerializer(TaskSerializer):
	class Meta(TaskSerializer.Meta):
		fields = TaskSerializer.Meta.fields
		read_only_fields = ['id', 'time_spent', 'created_at', 'updated_at', 'attachments']


class TaskUpdateSerializer(TaskSerializer):
	class Meta(TaskSerializer.Meta):
		fields = TaskSerializer.Meta.fields
		read_only_fields = ['id', 'time_spent', 'created_at', 'updated_at', 'attachments']


class TaskTimeLogSerializer(serializers.Serializer):
	seconds = serializers.IntegerField(min_value=1)

	def validate_seconds(self, value):
		if value > 86400:  # Max 24 hours in seconds
			raise serializers.ValidationError("Cannot log more than 24 hours at once.")
		return value


class TaskReportSerializer(serializers.Serializer):
	period = serializers.ChoiceField(choices=['daily', 'weekly', 'monthly'])
	
	def validate_period(self, value):
		return value.lower()
