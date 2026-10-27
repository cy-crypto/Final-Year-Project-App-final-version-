from django.urls import path

from .views import PrayerTimesView, QiblaView

urlpatterns = [
    path('times/', PrayerTimesView.as_view(), name='prayer-times'),
    path('qibla/', QiblaView.as_view(), name='prayer-qibla'),
]
