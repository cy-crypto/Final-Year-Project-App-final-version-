import datetime
from uuid import UUID

from django.db.models import Prefetch
from rest_framework import mixins, permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from accounts.models import UserProfile
from accounts.timezones import user_now

from .models import Habit, HabitCompletion
from .serializers import HabitSerializer
from .services import complete_habit, live_streak, recalculate, uncomplete_habit

BACKFILL_DAYS = 7


def _get_request_user_id(request):
	if getattr(request, 'user', None) and request.user.is_authenticated:
		profile, _ = UserProfile.objects.get_or_create(user=request.user)
		return profile.external_user_id

	raw = request.headers.get('X-User-Id') or request.query_params.get('user_id')
	if not raw:
		return None

	try:
		return UUID(str(raw))
	except (ValueError, TypeError):
		return None


class HabitViewSet(
	mixins.ListModelMixin,
	mixins.CreateModelMixin,
	mixins.RetrieveModelMixin,
	mixins.DestroyModelMixin,
	mixins.UpdateModelMixin,
	viewsets.GenericViewSet,
):
	"""The user's habits. List param: archived=1 for archived habits (default: active ones)."""

	queryset = Habit.objects.all()
	serializer_class = HabitSerializer
	permission_classes = [permissions.IsAuthenticated]

	def _today(self):
		return user_now(self.request.user).date()

	def get_queryset(self):
		request_user_id = _get_request_user_id(self.request)
		if not request_user_id:
			return Habit.objects.none()
		since = self._today() - datetime.timedelta(days=40)
		queryset = Habit.objects.filter(user_id=request_user_id).prefetch_related(
			Prefetch('habitcompletion_set', queryset=HabitCompletion.objects.filter(completed_date__gte=since))
		)
		if self.action == 'list':
			queryset = queryset.filter(is_archived=self.request.query_params.get('archived') == '1')
		return queryset

	def get_serializer_context(self):
		context = super().get_serializer_context()
		if self.request.user.is_authenticated:
			context['today'] = self._today()
		return context

	def perform_create(self, serializer):
		serializer.save(user_id=_get_request_user_id(self.request))

	def perform_update(self, serializer):
		habit = serializer.save()
		# A new frequency or weekly target changes how the streak is counted.
		if {'frequency', 'target_per_week'} & set(serializer.validated_data):
			recalculate(habit, self._today())

	def _day(self, request):
		"""The day to (un)check: today by default, or one of the last BACKFILL_DAYS days."""
		today = self._today()
		raw = request.data.get('date') if hasattr(request, 'data') else None
		if not raw:
			return today, None
		try:
			day = datetime.date.fromisoformat(str(raw))
		except ValueError:
			return today, 'date must be YYYY-MM-DD.'
		if day > today:
			return today, 'You cannot check in for a future day.'
		if (today - day).days >= BACKFILL_DAYS:
			return today, f'Only the last {BACKFILL_DAYS} days can be changed.'
		return day, None

	def _respond(self, pk):
		return Response(self.get_serializer(self.get_queryset().get(pk=pk)).data, status=status.HTTP_200_OK)

	@action(detail=True, methods=['patch', 'post'], url_path='complete')
	def complete(self, request, pk=None):
		habit = self.get_object()
		day, error = self._day(request)
		if error:
			return Response({'detail': error}, status=status.HTTP_400_BAD_REQUEST)
		complete_habit(habit, self._today(), day)
		return self._respond(habit.pk)

	@action(detail=True, methods=['post'], url_path='uncomplete')
	def uncomplete(self, request, pk=None):
		habit = self.get_object()
		day, error = self._day(request)
		if error:
			return Response({'detail': error}, status=status.HTTP_400_BAD_REQUEST)
		uncomplete_habit(habit, self._today(), day)
		return self._respond(habit.pk)

	@action(detail=True, methods=['get'], url_path='history')
	def history(self, request, pk=None):
		habit = self.get_object()
		completions = HabitCompletion.objects.filter(habit=habit).order_by('-completed_date')
		return Response([{'completed_date': c.completed_date} for c in completions], status=status.HTTP_200_OK)

	@action(detail=False, methods=['get'])
	def stats(self, request):
		"""Overview for the Insights tab: per-day check-ins for the last `days` days and totals."""
		try:
			days = min(max(int(request.query_params.get('days', 30)), 7), 90)
		except ValueError:
			days = 30
		today = self._today()
		user_id = _get_request_user_id(request)
		habits = list(Habit.objects.filter(user_id=user_id, is_archived=False))
		daily_ids = {h.id for h in habits if h.frequency == Habit.FREQUENCY_DAILY}
		start = today - datetime.timedelta(days=days - 1)
		rows = HabitCompletion.objects.filter(habit__in=habits, completed_date__gte=start).values_list('habit_id', 'completed_date')
		per_day = {}
		for habit_id, day in rows:
			entry = per_day.setdefault(day, {'done': 0, 'daily_done': 0})
			entry['done'] += 1
			entry['daily_done'] += habit_id in daily_ids
		series = []
		for i in range(days):
			day = start + datetime.timedelta(days=i)
			entry = per_day.get(day, {'done': 0, 'daily_done': 0})
			# Only daily habits that already existed that day are expected every day.
			expected = sum(1 for h in habits if h.id in daily_ids and h.created_at.date() <= day)
			series.append({'date': day.isoformat(), 'done': entry['done'], 'expected': expected,
						   'rate': round(min(entry['daily_done'], expected) * 100 / expected) if expected else None})
		week = series[-7:]
		week_expected = sum(d['expected'] for d in week)
		streaks = [live_streak(h, today) for h in habits]
		return Response({
			'days': series,
			'today': {'done': sum(1 for _, d in rows if d == today), 'total': len(habits)},
			'rate_7d': round(sum(min(d['done'], d['expected']) for d in week) * 100 / week_expected) if week_expected else None,
			'best_streak': max((h.best_streak for h in habits), default=0),
			'longest_running': max(streaks, default=0),
			'active_streaks': sum(1 for s in streaks if s > 0),
			'total_checkins': HabitCompletion.objects.filter(habit__in=habits).count(),
		})
