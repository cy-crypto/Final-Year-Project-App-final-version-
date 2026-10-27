from uuid import UUID

import calendar
from datetime import timedelta
from decimal import Decimal

from django.db.models import Q, Sum
from django.db.models.functions import Coalesce, Lower
from django.utils import timezone
from rest_framework import permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import UserProfile

from .models import BudgetSettings, BudgetTransaction, CategoryBudget, SavingsGoal, Subscription
from .serializers import (
    BudgetSettingsSerializer,
    BudgetTransactionSerializer,
    CategoryBudgetSerializer,
    GoalContributionSerializer,
    SavingsGoalSerializer,
    SubscriptionSerializer,
)


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


WARNING_THRESHOLD = Decimal('80')


def _month_bounds(day):
    last = calendar.monthrange(day.year, day.month)[1]
    return day.replace(day=1), day.replace(day=last)


def _spent_by_category(user_id, day):
    """Expense totals for the month containing `day`, keyed by lower-cased category."""
    start, end = _month_bounds(day)
    rows = (
        BudgetTransaction.objects.filter(
            user_id=user_id, type=BudgetTransaction.TYPE_EXPENSE, date__gte=start, date__lte=end
        )
        .exclude(category__isnull=True)
        .annotate(cat=Lower('category'))
        .values('cat')
        .annotate(total=Sum('amount'))
    )
    return {row['cat'].strip(): row['total'] for row in rows}


def _budget_alert(user_id, transaction):
    """
    Describes the budget state after `transaction` was saved, or None when nothing
    needs flagging. 'exceeded' is reported on every expense over the limit;
    'warning' only when this expense is the one that crossed the 80% mark.
    """
    if transaction.type != BudgetTransaction.TYPE_EXPENSE or not transaction.category:
        return None

    budget = CategoryBudget.objects.filter(user_id=user_id, category__iexact=transaction.category.strip()).first()
    if budget is None:
        return None

    key = transaction.category.strip().lower()
    spent = _spent_by_category(user_id, transaction.date).get(key, Decimal('0'))
    limit = budget.monthly_limit
    percent = (spent / limit) * 100
    before_percent = ((spent - transaction.amount) / limit) * 100

    if percent >= 100:
        level = 'exceeded'
    elif percent >= WARNING_THRESHOLD and before_percent < WARNING_THRESHOLD:
        level = 'warning'
    else:
        return None

    return {
        'level': level,
        'category': budget.category,
        'limit': str(limit),
        'spent': str(spent),
        'percent': int(percent),
    }


def _add_months(day, months):
    index = day.month - 1 + months
    year = day.year + index // 12
    month = index % 12 + 1
    return day.replace(year=year, month=month, day=min(day.day, calendar.monthrange(year, month)[1]))


def _advance_due_date(day, frequency):
    if frequency == Subscription.FREQ_WEEKLY:
        return day + timedelta(days=7)
    if frequency == Subscription.FREQ_YEARLY:
        return _add_months(day, 12)
    return _add_months(day, 1)


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

    def create(self, request, *args, **kwargs):
        response = super().create(request, *args, **kwargs)
        transaction = BudgetTransaction.objects.get(pk=response.data['id'])
        alert = _budget_alert(transaction.user_id, transaction)
        if alert:
            response.data['budget_alert'] = alert
        return response

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


class CategoryBudgetViewSet(viewsets.ModelViewSet):
    serializer_class = CategoryBudgetSerializer
    permission_classes = [permissions.IsAuthenticated]
    queryset = CategoryBudget.objects.all()

    def get_queryset(self):
        user_id = _get_request_user_id(self.request)
        return CategoryBudget.objects.filter(user_id=user_id) if user_id else CategoryBudget.objects.none()

    def get_serializer_context(self):
        context = super().get_serializer_context()
        user_id = _get_request_user_id(self.request)
        context['user_id'] = user_id
        context['spent_by_category'] = _spent_by_category(user_id, timezone.localdate()) if user_id else {}
        return context

    def perform_create(self, serializer):
        serializer.save(user_id=_get_request_user_id(self.request))

    def perform_update(self, serializer):
        serializer.save(updated_at=timezone.now())


class SavingsGoalViewSet(viewsets.ModelViewSet):
    serializer_class = SavingsGoalSerializer
    permission_classes = [permissions.IsAuthenticated]
    queryset = SavingsGoal.objects.all()

    def get_queryset(self):
        user_id = _get_request_user_id(self.request)
        if not user_id:
            return SavingsGoal.objects.none()
        return SavingsGoal.objects.filter(user_id=user_id).annotate(saved=Coalesce(Sum('contributions__amount'), Decimal('0')))

    def perform_create(self, serializer):
        serializer.save(user_id=_get_request_user_id(self.request))

    def perform_update(self, serializer):
        serializer.save(updated_at=timezone.now())

    def contributions(self, request, pk=None):
        goal = self.get_object()
        if request.method == 'POST':
            serializer = GoalContributionSerializer(data=request.data)
            serializer.is_valid(raise_exception=True)
            serializer.save(goal=goal)
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        serializer = GoalContributionSerializer(goal.contributions.all(), many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    def delete_contribution(self, request, pk=None, contribution_id=None):
        goal = self.get_object()
        deleted, _ = goal.contributions.filter(pk=contribution_id).delete()
        if not deleted:
            return Response(status=status.HTTP_404_NOT_FOUND)
        return Response(status=status.HTTP_204_NO_CONTENT)


class SubscriptionViewSet(viewsets.ModelViewSet):
    serializer_class = SubscriptionSerializer
    permission_classes = [permissions.IsAuthenticated]
    queryset = Subscription.objects.all()

    def get_queryset(self):
        user_id = _get_request_user_id(self.request)
        return Subscription.objects.filter(user_id=user_id) if user_id else Subscription.objects.none()

    def perform_create(self, serializer):
        serializer.save(user_id=_get_request_user_id(self.request))

    def perform_update(self, serializer):
        serializer.save(updated_at=timezone.now())

    def pay(self, request, pk=None):
        """Logs this payment as an expense and moves the due date to the next cycle."""
        subscription = self.get_object()
        user_id = subscription.user_id

        transaction = BudgetTransaction.objects.create(
            user_id=user_id,
            type=BudgetTransaction.TYPE_EXPENSE,
            amount=subscription.amount,
            category=subscription.category or None,
            description=subscription.name,
            date=timezone.localdate(),
        )
        subscription.next_due_date = _advance_due_date(subscription.next_due_date, subscription.frequency)
        subscription.updated_at = timezone.now()
        subscription.save(update_fields=['next_due_date', 'updated_at'])

        data = {
            'subscription': SubscriptionSerializer(subscription).data,
            'transaction': BudgetTransactionSerializer(transaction).data,
        }
        alert = _budget_alert(user_id, transaction)
        if alert:
            data['budget_alert'] = alert
        return Response(data, status=status.HTTP_200_OK)
