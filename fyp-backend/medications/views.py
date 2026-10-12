from rest_framework import viewsets, permissions
from rest_framework.permissions import IsAuthenticated
from .models import Medication, MedicationLog
from .serializers import MedicationSerializer, MedicationLogSerializer


class MedicationViewSet(viewsets.ModelViewSet):
    serializer_class = MedicationSerializer
    permission_classes = [IsAuthenticated]
    queryset = Medication.objects.all()

    def get_queryset(self):
        return Medication.objects.filter(user=self.request.user).order_by('-created_at')

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)


class MedicationLogViewSet(viewsets.ModelViewSet):
    serializer_class = MedicationLogSerializer
    permission_classes = [IsAuthenticated]
    queryset = MedicationLog.objects.all()

    def get_queryset(self):
        return MedicationLog.objects.filter(user=self.request.user).order_by('-created_at')

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)
