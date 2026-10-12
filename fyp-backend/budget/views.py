from uuid import UUID

from django.db.models import Q, Sum
from rest_framework import permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import UserProfile

from .models import BudgetSettings, BudgetTransaction
from .serializers import BudgetSettingsSerializer, BudgetTransactionSerializer


def _get_request_user_id(request):
    # Mirrors habits/views.py:_get_request_user_id exactly, so budget behaves the
    # same as the rest of the app under the project's real auth (Django TokenAuthentication
    # + IsAuthenticated), not the nonexistent "IsSupabaseAuthenticated".
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


class BudgetTransactionViewSet(viewsets.ModelViewSet):
    serializer_class = BudgetTransactionSerializer
    permission_classes = [permissions.IsAuthenticated]
    queryset = BudgetTransaction.objects.all()

    def get_queryset(self):
        user_id = _get_request_user_id(self.request)
        queryset = BudgetTransaction.objects.filter(user_id=user_id) if user_id else BudgetTransaction.objects.none()

        params = self.request.query_params
        type_param = params.get('type')
        if type_param:
            queryset = queryset.filter(type=type_param)

        category_param = params.get('category')
        if category_param:
            queryset = queryset.filter(category=category_param)

        date_from = params.get('date_from')
        if date_from:
            queryset = queryset.filter(date__gte=date_from)

        date_to = params.get('date_to')
        if date_to:
            queryset = queryset.filter(date__lte=date_to)

        search = params.get('search')
        if search:
            queryset = queryset.filter(Q(description__icontains=search) | Q(category__icontains=search))

        return queryset

    def perform_create(self, serializer):
        serializer.save(user_id=_get_request_user_id(self.request))

    @action(detail=False, methods=['get'], url_path='summary')
    def summary(self, request):
        totals = (
            self.get_queryset()
            .values('category', 'type')
            .annotate(total_amount=Sum('amount'))
            .order_by('category', 'type')
        )
        return Response(list(totals), status=status.HTTP_200_OK)


class BudgetSettingsView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def _get_or_create(self, request):
        user_id = _get_request_user_id(request)
        settings_obj, _ = BudgetSettings.objects.get_or_create(user_id=user_id)
        return settings_obj

    def get(self, request):
        settings_obj = self._get_or_create(request)
        serializer = BudgetSettingsSerializer(settings_obj)
        return Response(serializer.data, status=status.HTTP_200_OK)

    def patch(self, request):
        settings_obj = self._get_or_create(request)
        serializer = BudgetSettingsSerializer(settings_obj, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data, status=status.HTTP_200_OK)

    def put(self, request):
        return self.patch(request)
