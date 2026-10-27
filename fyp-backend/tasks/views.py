import datetime

from django.core.mail import send_mail
from django.db.models import Count, Q, Sum
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response

from .models import Task, TaskAttachment
from .serializers import TaskAttachmentSerializer, TaskSerializer, TaskTimeLogSerializer

PRIORITY_META = [
	(Task.PRIORITY_HIGH, 'High', '#F43F5E'),
	(Task.PRIORITY_MEDIUM, 'Medium', '#F59E0B'),
	(Task.PRIORITY_LOW, 'Low', '#10B981'),
]
CATEGORY_COLORS = ['#FF6B2C', '#6366F1', '#0EA5E9', '#10B981', '#F59E0B', '#F43F5E', '#8B5CF6', '#64748B']
REPORT_DAYS = {'daily': 1, 'weekly': 7, 'monthly': 30}


def _parse_date(value):
	try:
		return datetime.date.fromisoformat(value) if value else None
	except ValueError:
		return None


class TaskViewSet(viewsets.ModelViewSet):
	"""CRUD for the signed-in user's tasks plus completion, time tracking, attachments and reports.

	Query filters on the list: status, priority, category, search, deadline_from, deadline_to.
	"""

	serializer_class = TaskSerializer
	permission_classes = [permissions.IsAuthenticated]
	parser_classes = [JSONParser, MultiPartParser, FormParser]

	def get_queryset(self):
		qs = Task.objects.filter(user=self.request.user).prefetch_related('attachments')
		params = self.request.query_params
		if params.get('status'):
			qs = qs.filter(status=params['status'])
		if params.get('priority'):
			qs = qs.filter(priority=params['priority'])
		if params.get('category'):
			qs = qs.filter(category__iexact=params['category'])
		if params.get('search'):
			term = params['search'].strip()
			qs = qs.filter(Q(title__icontains=term) | Q(description__icontains=term) | Q(category__icontains=term))
		deadline_from = _parse_date(params.get('deadline_from'))
		deadline_to = _parse_date(params.get('deadline_to'))
		if deadline_from:
			qs = qs.filter(deadline__gte=deadline_from)
		if deadline_to:
			qs = qs.filter(deadline__lte=deadline_to)
		return qs

	def perform_create(self, serializer):
		serializer.save(user=self.request.user)

	@action(detail=True, methods=['post'])
	def toggle(self, request, pk=None):
		"""Flip a task between done and pending (used by the checkbox in task lists)."""
		task = self.get_object()
		new_status = Task.STATUS_PENDING if task.status == Task.STATUS_DONE else Task.STATUS_DONE
		serializer = self.get_serializer(task, data={'status': new_status}, partial=True)
		serializer.is_valid(raise_exception=True)
		serializer.save()
		return Response(serializer.data)

	@action(detail=True, methods=['post'], url_path='log-time')
	def log_time(self, request, pk=None):
		task = self.get_object()
		data = TaskTimeLogSerializer(data=request.data)
		data.is_valid(raise_exception=True)
		task.time_spent = (task.time_spent or 0) + data.validated_data['seconds']
		task.save(update_fields=['time_spent', 'updated_at'])
		return Response(self.get_serializer(task).data)

	@action(detail=True, methods=['post'], url_path='attachments')
	def add_attachment(self, request, pk=None):
		task = self.get_object()
		serializer = TaskAttachmentSerializer(data=request.data, context={'request': request})
		serializer.is_valid(raise_exception=True)
		serializer.save(task=task)
		return Response(serializer.data, status=status.HTTP_201_CREATED)

	@action(detail=True, methods=['delete'], url_path=r'attachments/(?P<attachment_id>\d+)')
	def remove_attachment(self, request, pk=None, attachment_id=None):
		task = self.get_object()
		attachment = get_object_or_404(TaskAttachment, pk=attachment_id, task=task)
		if attachment.file:
			attachment.file.delete(save=False)
		attachment.delete()
		return Response(status=status.HTTP_204_NO_CONTENT)

	@action(detail=True, methods=['post'], url_path='send-reminder')
	def send_reminder(self, request, pk=None):
		task = self.get_object()
		email = request.user.email
		if not email:
			return Response({'detail': 'Your account has no email address.'}, status=status.HTTP_400_BAD_REQUEST)
		due = task.deadline.strftime('%d %b %Y') if task.deadline else 'no deadline'
		send_mail(
			subject=f'Task reminder: {task.title}',
			message=f'Reminder for your task "{task.title}" (priority {task.priority}, due {due}).\n\n{task.description or ""}',
			from_email=None,
			recipient_list=[email],
			fail_silently=False,
		)
		return Response({'detail': f'Reminder sent to {email}.'})

	@action(detail=False, methods=['get'])
	def report(self, request):
		"""Task completion summary for a period (daily, weekly or monthly).

		Matches the shape used by the Reports screen: summary, by_priority, by_category, chart_data.
		"""
		period = request.query_params.get('period', 'weekly').lower()
		if period not in REPORT_DAYS:
			return Response({'detail': 'period must be daily, weekly or monthly.'}, status=status.HTTP_400_BAD_REQUEST)

		today = timezone.localdate()
		start = today - datetime.timedelta(days=REPORT_DAYS[period] - 1)
		all_tasks = Task.objects.filter(user=request.user)
		tasks = all_tasks.filter(created_at__date__gte=start)

		counts = tasks.aggregate(
			total=Count('id'),
			completed=Count('id', filter=Q(status=Task.STATUS_DONE)),
			pending=Count('id', filter=Q(status=Task.STATUS_PENDING)),
			in_progress=Count('id', filter=Q(status=Task.STATUS_IN_PROGRESS)),
		)
		summary = {
			**counts,
			'completed_in_period': all_tasks.filter(completed_at__date__gte=start).count(),
			'overdue': all_tasks.filter(deadline__lt=today).exclude(status=Task.STATUS_DONE).count(),
			'time_spent_seconds': tasks.aggregate(s=Sum('time_spent'))['s'] or 0,
		}

		by_priority = {}
		for key, label, color in PRIORITY_META:
			subset = tasks.filter(priority=key)
			by_priority[key] = {
				'label': label,
				'total': subset.count(),
				'completed': subset.filter(status=Task.STATUS_DONE).count(),
				'color': color,
			}

		by_category = {}
		rows = (
			tasks.values('category')
			.annotate(total=Count('id'), completed=Count('id', filter=Q(status=Task.STATUS_DONE)))
			.order_by('-total')
		)
		for index, row in enumerate(rows):
			name = row['category'] or 'Uncategorized'
			by_category[name] = {
				'label': name,
				'total': row['total'],
				'completed': row['completed'],
				'color': CATEGORY_COLORS[index % len(CATEGORY_COLORS)],
			}

		# Monthly view groups by week, the others show the last 7 days.
		if period == 'monthly':
			buckets = [(today - datetime.timedelta(days=7 * (3 - i) + 6), today - datetime.timedelta(days=7 * (3 - i)))
					   for i in range(4)]
			labels = [f'Wk {i + 1}' for i in range(4)]
		else:
			days = [today - datetime.timedelta(days=6 - i) for i in range(7)]
			buckets = [(d, d) for d in days]
			labels = [d.strftime('%a') for d in days]
		chart = {'labels': labels, 'completed': [], 'created': []}
		for first, last in buckets:
			chart['created'].append(all_tasks.filter(created_at__date__range=(first, last)).count())
			chart['completed'].append(all_tasks.filter(completed_at__date__range=(first, last)).count())

		return Response({
			'period': period,
			'summary': summary,
			'by_priority': by_priority,
			'by_category': by_category,
			'chart_data': chart,
		})
