from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import MedicationViewSet, MedicationLogViewSet

router = DefaultRouter()
router.register(r'medications', MedicationViewSet)
router.register(r'medication-logs', MedicationLogViewSet)

urlpatterns = [
    path('', include(router.urls)),
]
