import datetime
from uuid import UUID

from django.db import IntegrityError
from django.utils import timezone
from rest_framework import permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import UserProfile

from .models import FitnessGoal, FitnessProfile, FitnessRecord, WaterIntake, WorkoutRoutine
from .serializers import (
    FitnessGoalSerializer,
    FitnessProfileSerializer,
    FitnessRecordSerializer,
    WaterIntakeSerializer,
    WorkoutRoutineSerializer,
)


def _get_request_user_id(request):
    # Duplicated locally, same as budget/views.py relative to habits/views.py — mirrors the
    # project's real auth (Django TokenAuthentication + IsAuthenticated), not a shared import.
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


class FitnessRecordViewSet(viewsets.ModelViewSet):
    serializer_class = FitnessRecordSerializer
    permission_classes = [permissions.IsAuthenticated]
    queryset = FitnessRecord.objects.all()

    def get_queryset(self):
        user_id = _get_request_user_id(self.request)
        queryset = FitnessRecord.objects.filter(user_id=user_id) if user_id else FitnessRecord.objects.none()

        params = self.request.query_params
        date_from = params.get('date_from')
        if date_from:
            queryset = queryset.filter(date__gte=date_from)

        date_to = params.get('date_to')
        if date_to:
            queryset = queryset.filter(date__lte=date_to)

        return queryset

    def perform_create(self, serializer):
        # UNIQUE(user_id, date) means "create" semantically means "log today's (or this
        # date's) data", not "always insert a new row" — a naive .save() would raise
        # IntegrityError the second time a user logs anything for a date they already have
        # a record for. update_or_create makes POST idempotent per (user_id, date): a
        # second POST for the same date updates the existing row instead of erroring.
        user_id = _get_request_user_id(self.request)
        data = dict(serializer.validated_data)
        date = data.pop('date', None)
        # FitnessRecord.date is a DateField(default=timezone.now): when a POST omits `date`,
        # DRF fills validated_data['date'] from that model default *without* running it
        # through to_internal_value(), so it arrives here as a raw datetime, not a date —
        # truthy, so a bare `... or timezone.now().date()` fallback wouldn't catch it and
        # a datetime would leak into the row, breaking serialization on the way back out.
        # Normalize explicitly instead of assuming the default is already a date.
        if isinstance(date, datetime.datetime):
            date = date.date()
        date = date or timezone.now().date()
        record, _ = FitnessRecord.objects.update_or_create(
            user_id=user_id, date=date, defaults=data,
        )
        serializer.instance = record

    @action(detail=False, methods=['get'], url_path='today')
    def today(self, request):
        user_id = _get_request_user_id(request)
        record, _ = FitnessRecord.objects.get_or_create(
            user_id=user_id, date=timezone.now().date(),
            defaults={'steps': 0, 'calories_burned': 0},
        )
        serializer = self.get_serializer(record)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @action(detail=False, methods=['get'], url_path='trends')
    def trends(self, request):
        try:
            days = int(request.query_params.get('days', 7))
        except (TypeError, ValueError):
            days = 7
        days = max(days, 1)

        end_date = timezone.now().date()
        start_date = end_date - timezone.timedelta(days=days - 1)

        records = (
            self.get_queryset()
            .filter(date__gte=start_date, date__lte=end_date)
            .order_by('date')
            .values('date', 'steps', 'calories_burned', 'sleep_duration_minutes')
        )
        return Response(list(records), status=status.HTTP_200_OK)


class FitnessGoalViewSet(viewsets.ModelViewSet):
    serializer_class = FitnessGoalSerializer
    permission_classes = [permissions.IsAuthenticated]
    queryset = FitnessGoal.objects.all()

    def get_queryset(self):
        user_id = _get_request_user_id(self.request)
        queryset = FitnessGoal.objects.filter(user_id=user_id) if user_id else FitnessGoal.objects.none()

        is_active = self.request.query_params.get('is_active')
        if is_active is not None:
            queryset = queryset.filter(is_active=is_active.lower() in ('true', '1'))

        return queryset

    def perform_create(self, serializer):
        # Same reasoning as FitnessRecordViewSet.perform_create, keyed on
        # UNIQUE(user_id, goal_type) instead: setting a goal of a type the user already
        # has active updates that goal rather than raising IntegrityError on a duplicate.
        user_id = _get_request_user_id(self.request)
        data = dict(serializer.validated_data)
        goal_type = data.pop('goal_type', None)
        goal, _ = FitnessGoal.objects.update_or_create(
            user_id=user_id, goal_type=goal_type, defaults=data,
        )
        serializer.instance = goal


class FitnessProfileView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def _get_or_create(self, request):
        user_id = _get_request_user_id(request)
        profile, _ = FitnessProfile.objects.get_or_create(user_id=user_id)
        return profile

    def get(self, request):
        profile = self._get_or_create(request)
        serializer = FitnessProfileSerializer(profile)
        return Response(serializer.data, status=status.HTTP_200_OK)

    def patch(self, request):
        profile = self._get_or_create(request)
        serializer = FitnessProfileSerializer(profile, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data, status=status.HTTP_200_OK)

    def put(self, request):
        return self.patch(request)


class WaterIntakeViewSet(viewsets.ModelViewSet):
    serializer_class = WaterIntakeSerializer
    permission_classes = [permissions.IsAuthenticated]
    queryset = WaterIntake.objects.all()

    def get_queryset(self):
        user_id = _get_request_user_id(self.request)
        queryset = WaterIntake.objects.filter(user_id=user_id) if user_id else WaterIntake.objects.none()

        params = self.request.query_params
        date_from = params.get('date_from')
        if date_from:
            queryset = queryset.filter(date__gte=date_from)

        date_to = params.get('date_to')
        if date_to:
            queryset = queryset.filter(date__lte=date_to)

        return queryset

    def perform_create(self, serializer):
        # Same reasoning as FitnessRecordViewSet.perform_create, keyed on
        # UNIQUE(user_id, date): a second POST for a date the user already logged water for
        # updates that row instead of raising IntegrityError on a duplicate.
        user_id = _get_request_user_id(self.request)
        data = dict(serializer.validated_data)
        date = data.pop('date', None)
        # WaterIntake.date is a DateField(default=timezone.now): when a POST omits `date`,
        # DRF fills validated_data['date'] from that model default *without* running it
        # through to_internal_value(), so it arrives here as a raw datetime, not a date —
        # truthy, so a bare `... or timezone.now().date()` fallback wouldn't catch it and
        # a datetime would leak into the row, breaking serialization on the way back out.
        # Normalize explicitly instead of assuming the default is already a date.
        if isinstance(date, datetime.datetime):
            date = date.date()
        date = date or timezone.now().date()
        intake, _ = WaterIntake.objects.update_or_create(
            user_id=user_id, date=date, defaults=data,
        )
        serializer.instance = intake

    @action(detail=False, methods=['get'], url_path='today')
    def today(self, request):
        user_id = _get_request_user_id(request)
        intake, _ = WaterIntake.objects.get_or_create(
            user_id=user_id, date=timezone.now().date(),
            defaults={'amount_ml': 0},
        )
        serializer = self.get_serializer(intake)
        return Response(serializer.data, status=status.HTTP_200_OK)


class WorkoutRoutineViewSet(viewsets.ModelViewSet):
    serializer_class = WorkoutRoutineSerializer
    permission_classes = [permissions.IsAuthenticated]
    queryset = WorkoutRoutine.objects.all()

    def get_queryset(self):
        user_id = _get_request_user_id(self.request)
        return WorkoutRoutine.objects.filter(user_id=user_id) if user_id else WorkoutRoutine.objects.none()

    def perform_create(self, serializer):
        # Unlike FitnessRecord/FitnessGoal/WaterIntake, routines are NOT upserted by their
        # unique field — UNIQUE(user_id, name) here means "you already have a routine with
        # this name", a genuine conflict the client should resolve explicitly (rename, or
        # PATCH the existing one), not something to silently merge. So this is a real
        # create that can legitimately fail — just turned into a clean 400 instead of an
        # unhandled 500 IntegrityError.
        user_id = _get_request_user_id(self.request)
        try:
            serializer.save(user_id=user_id)
        except IntegrityError:
            name = serializer.validated_data.get('name', '')
            raise ValidationError(
                {'name': [f"You already have a routine named '{name}' — use PATCH to update it instead."]}
            )

    @action(detail=True, methods=['post'], url_path='log')
    def log(self, request, pk=None):
        # get_object() respects get_queryset()'s user scoping above, so this 404s rather
        # than leaks another user's routine if pk doesn't belong to the caller.
        routine = self.get_object()
        user_id = _get_request_user_id(request)

        # Same get_or_create-by-today's-date pattern as FitnessRecordViewSet.today().
        record, _ = FitnessRecord.objects.get_or_create(
            user_id=user_id, date=timezone.now().date(),
            defaults={'steps': 0, 'calories_burned': 0},
        )

        # Append, don't replace — preserves whatever's already logged today (manual entries
        # included), consistent with how this module avoids clobbering existing data
        # everywhere else (see FitnessRecordViewSet/WaterIntakeViewSet.perform_create).
        existing_log = record.workout_log or []
        record.workout_log = existing_log + list(routine.exercises or [])
        # update_fields scopes this write to exactly workout_log — steps, calories_burned,
        # and sleep_duration_minutes on this row are untouched by construction, not just by
        # convention.
        record.save(update_fields=['workout_log'])

        serializer = FitnessRecordSerializer(record)
        return Response(serializer.data, status=status.HTTP_200_OK)
