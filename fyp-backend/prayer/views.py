import datetime

from django.utils import timezone
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import UserProfile
from accounts.serializers import merged_preferences
from accounts.timezones import user_now

from . import services


class PrayerTimesView(APIView):
    """GET /api/prayer/times/?lat=&lon= (or ?city=) &date=YYYY-MM-DD &days=1..7

    Without a location the city saved in the user's profile is used. Calculation method and Asr
    school come from the profile preferences unless method/school are passed.
    """

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        params = request.query_params
        profile, _ = UserProfile.objects.get_or_create(user=request.user)
        prefs = merged_preferences(profile.preferences)

        lat = lon = None
        if params.get('lat') and params.get('lon'):
            try:
                lat, lon = float(params['lat']), float(params['lon'])
            except ValueError:
                return Response({'detail': 'lat and lon must be numbers.'}, status=status.HTTP_400_BAD_REQUEST)
            if not (-90 <= lat <= 90 and -180 <= lon <= 180):
                return Response({'detail': 'lat/lon out of range.'}, status=status.HTTP_400_BAD_REQUEST)
        city = (params.get('city') or '').strip() or profile.selected_city
        if lat is None and not city:
            return Response({'detail': 'Share your location or enter a city.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            method = int(params.get('method', prefs['prayer_method']))
            school = int(params.get('school', prefs['prayer_school']))
            days = min(max(int(params.get('days', 1)), 1), 7)
            start = datetime.date.fromisoformat(params['date']) if params.get('date') else user_now(request.user).date()
        except ValueError:
            return Response({'detail': 'Invalid method, school, days or date.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            entries = [
                services.get_day(start + datetime.timedelta(days=i), lat=lat, lon=lon,
                                 address=None if lat is not None else city, method=method, school=school)
                for i in range(days)
            ]
        except services.PrayerError as exc:
            return Response({'detail': str(exc)}, status=exc.status_code)

        return Response({
            'location': {'lat': lat, 'lon': lon, 'city': None if lat is not None else city},
            'qibla': services.qibla_bearing(lat, lon) if lat is not None else None,
            'method': method,
            'school': school,
            'days': entries,
            'next_prayer': services.next_prayer(entries, timezone.now()),
        })


class QiblaView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        try:
            lat, lon = float(request.query_params['lat']), float(request.query_params['lon'])
        except (KeyError, ValueError):
            return Response({'detail': 'lat and lon are required numbers.'}, status=status.HTTP_400_BAD_REQUEST)
        return Response({'bearing': services.qibla_bearing(lat, lon)})
