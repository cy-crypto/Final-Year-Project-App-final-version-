import os
from uuid import UUID

from rest_framework import mixins, permissions, status, viewsets
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import UserProfile
from django.db import IntegrityError

from .models import SavedLocation
from .serializers import SavedLocationSerializer
from .services import WeatherAdapter, WeatherAdapterError


def _get_request_user_id(request):
    if getattr(request, "user", None) and request.user.is_authenticated:
        profile, _ = UserProfile.objects.get_or_create(user=request.user)
        return profile.external_user_id

    raw = request.headers.get("X-User-Id") or request.query_params.get("user_id")
    if not raw:
        return None

    try:
        return UUID(str(raw))
    except (ValueError, TypeError):
        return None


class WeatherByCityView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        city = request.query_params.get("city", "").strip()
        if not city:
            return Response({"detail": 'Query parameter "city" is required.'}, status=status.HTTP_400_BAD_REQUEST)

        api_key = os.getenv("OPENWEATHER_API_KEY")
        if not api_key:
            return Response({"detail": "Server weather API key is not configured."}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        try:
            cache_ttl = int(os.getenv("OPENWEATHER_CACHE_TTL", "1800"))
        except Exception:
            cache_ttl = 1800

        adapter = WeatherAdapter(api_key, cache_ttl=cache_ttl)
        try:
            cleaned = adapter.get_by_city(city)
        except WeatherAdapterError as exc:
            return Response({"detail": str(exc)}, status=exc.status_code)

        return Response(cleaned, status=status.HTTP_200_OK)


class WeatherHealthView(APIView):
    permission_classes = [permissions.AllowAny]

    def get(self, request):
        api_key = os.getenv("OPENWEATHER_API_KEY")
        if not api_key:
            return Response({"ok": False, "detail": "Server weather API key is not configured."}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        adapter = WeatherAdapter(api_key, cache_ttl=0)
        try:
            coords = adapter.geocode_city("London")
        except WeatherAdapterError as exc:
            status_code = exc.status_code or status.HTTP_502_BAD_GATEWAY
            return Response({"ok": False, "detail": str(exc)}, status=status_code)

        if not coords:
            return Response({"ok": False, "detail": "City not found."}, status=status.HTTP_404_NOT_FOUND)

        return Response({"ok": True, "detail": "OpenWeather key is valid.", "coords": coords}, status=status.HTTP_200_OK)


class SavedLocationViewSet(
    mixins.ListModelMixin,
    mixins.CreateModelMixin,
    mixins.DestroyModelMixin,
    viewsets.GenericViewSet,
):
    queryset = SavedLocation.objects.all()
    serializer_class = SavedLocationSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        queryset = super().get_queryset()
        request_user_id = _get_request_user_id(self.request)
        if request_user_id:
            return queryset.filter(user_id=request_user_id)
        return queryset.none()

    def create(self, request, *args, **kwargs):
        request_user_id = _get_request_user_id(request)
        if not request_user_id:
            return Response({"detail": "User id is required."}, status=status.HTTP_400_BAD_REQUEST)

        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            serializer.save(user_id=request_user_id)
        except IntegrityError:
            return Response({"detail": "Location already saved."}, status=status.HTTP_409_CONFLICT)

        headers = self.get_success_headers(serializer.data)
        return Response(serializer.data, status=status.HTTP_201_CREATED, headers=headers)


class UVIndexView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        lat = request.query_params.get("lat")
        lon = request.query_params.get("lon")
        
        if not lat or not lon:
            return Response({"detail": 'Query parameters "lat" and "lon" are required.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            lat_float = float(lat)
            lon_float = float(lon)
        except ValueError:
            return Response({"detail": 'Invalid latitude or longitude values.'}, status=status.HTTP_400_BAD_REQUEST)

        api_key = os.getenv("OPENWEATHER_API_KEY")
        if not api_key:
            return Response({"detail": "Server weather API key is not configured."}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        adapter = WeatherAdapter(api_key, cache_ttl=600)  # 10 minute cache for UV data
        try:
            uv_data = adapter.get_uv_index(lat_float, lon_float)
        except WeatherAdapterError as exc:
            return Response({"detail": str(exc)}, status=exc.status_code)

        return Response(uv_data, status=status.HTTP_200_OK)


class AirPollutionView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        lat = request.query_params.get("lat")
        lon = request.query_params.get("lon")
        
        if not lat or not lon:
            return Response({"detail": 'Query parameters "lat" and "lon" are required.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            lat_float = float(lat)
            lon_float = float(lon)
        except ValueError:
            return Response({"detail": 'Invalid latitude or longitude values.'}, status=status.HTTP_400_BAD_REQUEST)

        api_key = os.getenv("OPENWEATHER_API_KEY")
        if not api_key:
            return Response({"detail": "Server weather API key is not configured."}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        adapter = WeatherAdapter(api_key, cache_ttl=600)  # 10 minute cache for AQI data
        try:
            aqi_data = adapter.get_air_pollution(lat_float, lon_float)
        except WeatherAdapterError as exc:
            return Response({"detail": str(exc)}, status=exc.status_code)

        return Response(aqi_data, status=status.HTTP_200_OK)
