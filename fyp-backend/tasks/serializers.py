from django.utils import timezone
from rest_framework import serializers

from .models import Task, TaskAttachment


class TaskAttachmentSerializer(serializers.ModelSerializer):
	file_url = serializers.SerializerMethodField()
	name = serializers.SerializerMethodField()

	class Meta:
		model = TaskAttachment
		fields = ['id', 'attachment_type', 'file', 'file_url', 'url', 'name', 'created_at']
		read_only_fields = ['id', 'created_at', 'file_url', 'name']

	def get_file_url(self, obj):
		if not obj.file:
			return None
		request = self.context.get('request')
		return request.build_absolute_uri(obj.file.url) if request else obj.file.url

	def get_name(self, obj):
		if obj.file:
			return obj.file.name.rsplit('/', 1)[-1]
		return obj.url or ''

	def validate(self, attrs):
		kind = attrs.get('attachment_type', TaskAttachment.ATTACHMENT_TYPE_FILE)
		if kind == TaskAttachment.ATTACHMENT_TYPE_URL and not attrs.get('url'):
			raise serializers.ValidationError({'url': 'A link is required.'})
		if kind == TaskAttachment.ATTACHMENT_TYPE_FILE and not attrs.get('file'):
			raise serializers.ValidationError({'file': 'A file is required.'})
		return attrs


class TaskSerializer(serializers.ModelSerializer):
	attachments = TaskAttachmentSerializer(many=True, read_only=True)
	attachment = serializers.FileField(required=False, allow_null=True)
	time_spent_seconds = serializers.IntegerField(source='time_spent', read_only=True)
	deadline = serializers.DateField(required=False, allow_null=True)
	description = serializers.CharField(required=False, allow_blank=True, allow_null=True)
	email_reminder_enabled = serializers.BooleanField(required=False)
	links = serializers.ListField(child=serializers.URLField(), required=False)

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
			'time_spent_seconds',
			'progress_percentage',
			'email_reminder_enabled',
			'attachment',
			'attachments',
			'completed_at',
			'created_at',
			'updated_at',
		]
		read_only_fields = ['id', 'completed_at', 'created_at', 'updated_at', 'attachments']

	def validate_title(self, value):
		value = value.strip()
		if not value:
			raise serializers.ValidationError('Title is required.')
		return value

	def validate_progress_percentage(self, value):
		if not 0 <= value <= 100:
			raise serializers.ValidationError('Progress must be between 0 and 100.')
		return value

	def validate(self, attrs):
		start = attrs.get('time_slot_start', getattr(self.instance, 'time_slot_start', None))
		end = attrs.get('time_slot_end', getattr(self.instance, 'time_slot_end', None))
		if start and end and end <= start:
			raise serializers.ValidationError({'time_slot_end': 'End time must be after start time.'})
		return attrs

	def _apply_status(self, instance, validated_data):
		status = validated_data.get('status')
		if status is None:
			return
		if status == Task.STATUS_DONE and instance.status != Task.STATUS_DONE:
			instance.completed_at = timezone.now()
			instance.progress_percentage = 100
		elif status != Task.STATUS_DONE:
			instance.completed_at = None

	def create(self, validated_data):
		task = Task(**validated_data)
		if task.status == Task.STATUS_DONE:
			task.completed_at = timezone.now()
			task.progress_percentage = 100
		task.save()
		return task

	def update(self, instance, validated_data):
		self._apply_status(instance, validated_data)
		return super().update(instance, validated_data)


class TaskTimeLogSerializer(serializers.Serializer):
	seconds = serializers.IntegerField(min_value=1, max_value=86400)
