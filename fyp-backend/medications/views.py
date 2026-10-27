import datetime

from rest_framework import permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from accounts.timezones import user_now, user_tz

from . import services
from .models import Medication, MedicationLog
from .serializers import LogDoseSerializer, MedicationLogSerializer, MedicationSerializer


def _date_param(request, name):
    value = request.query_params.get(name)
    if not value:
        return None
    try:
        return datetime.date.fromisoformat(value)
    except ValueError:
        return None


class MedicationViewSet(viewsets.ModelViewSet):
    serializer_class = MedicationSerializer
    permission_classes = [permissions.IsAuthenticated]
    queryset = Medication.objects.all()

    def get_queryset(self):
        qs = Medication.objects.filter(user=self.request.user).order_by('-is_active', 'name')
        active = self.request.query_params.get('active')
        if active in ('true', 'false'):
            qs = qs.filter(is_active=active == 'true')
        return qs

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)

    @action(detail=False, methods=['get'])
    def today(self, request):
        """Today's dose schedule with the state of each slot, the next dose and refill alerts."""
        day = _date_param(request, 'date')
        slots = services.day_schedule(request.user, day)
        refills = MedicationSerializer(
            [m for m in self.get_queryset() if m.needs_refill], many=True, context={'request': request}
        ).data
        return Response({
            'date': (day or user_now(request.user).date()).isoformat(),
            'slots': slots,
            'taken': sum(1 for s in slots if s['status'] == 'taken'),
            'total': len(slots),
            'next_dose': services.next_dose(request.user),
            'refills': refills,
        })

    @action(detail=False, methods=['get'], url_path='next-dose')
    def next_dose(self, request):
        return Response({'next_dose': services.next_dose(request.user)})

    @action(detail=False, methods=['get'])
    def adherence(self, request):
        try:
            days = min(max(int(request.query_params.get('days', 7)), 1), 31)
        except ValueError:
            days = 7
        return Response(services.adherence(request.user, days))

    @action(detail=True, methods=['post'])
    def log(self, request, pk=None):
        """Record a dose for a schedule slot (or an as-needed dose when dose_time is empty)."""
        medication = self.get_object()
        data = LogDoseSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        try:
            log = services.log_dose(
                request.user, medication,
                status=data.validated_data['status'],
                dose_time=data.validated_data['dose_time'],
                day=data.validated_data.get('date'),
                notes=data.validated_data['notes'],
            )
        except services.DoseError as exc:
            return Response({'detail': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        medication.refresh_from_db()
        return Response({
            'log': MedicationLogSerializer(log).data,
            'medication': MedicationSerializer(medication).data,
        }, status=status.HTTP_201_CREATED)


class MedicationLogViewSet(viewsets.ModelViewSet):
    """Dose history. Filters: medication, status, date_from, date_to (local days)."""

    serializer_class = MedicationLogSerializer
    permission_classes = [permissions.IsAuthenticated]
    queryset = MedicationLog.objects.all()

    def get_queryset(self):
        qs = MedicationLog.objects.filter(user=self.request.user).select_related('medication')
        params = self.request.query_params
        if params.get('medication'):
            qs = qs.filter(medication_id=params['medication'])
        if params.get('status'):
            qs = qs.filter(status=params['status'])
        tz = user_tz(self.request.user)
        date_from = _date_param(self.request, 'date_from')
        date_to = _date_param(self.request, 'date_to')
        if date_from:
            qs = qs.filter(scheduled_time__gte=datetime.datetime(date_from.year, date_from.month, date_from.day, tzinfo=tz))
        if date_to:
            end = datetime.datetime(date_to.year, date_to.month, date_to.day, tzinfo=tz) + datetime.timedelta(days=1)
            qs = qs.filter(scheduled_time__lt=end)
        return qs.order_by('-scheduled_time', '-created_at')

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)
