# Serializers for the live Supabase-backed tables `budget_transactions` and
# `budget_settings` (see budget/models.py) — schema-locked, not arbitrary Django fields.

from rest_framework import serializers

from django.db.models import Sum
from .models import BudgetTransaction, BudgetSettings, CategoryBudget, GoalContribution, SavingsGoal, Subscription


class BudgetTransactionSerializer(serializers.ModelSerializer):
    type = serializers.ChoiceField(choices=BudgetTransaction.TYPE_CHOICES)
    category = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    description = serializers.CharField(required=False, allow_null=True, allow_blank=True)

    class Meta:
        model = BudgetTransaction
        fields = [
            'id',
            'user_id',
            'type',
            'amount',
            'category',
            'description',
            'date',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['id', 'user_id', 'created_at', 'updated_at']


class BudgetSettingsSerializer(serializers.ModelSerializer):
    class Meta:
        model = BudgetSettings
        fields = [
            'id',
            'user_id',
            'monthly_limit',
            'currency',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['id', 'user_id', 'created_at', 'updated_at']

    # Get-or-create (one settings row per user) belongs in the view layer (Step 4),
    # not here — this serializer only validates/serializes whatever row it's given.


class CategoryBudgetSerializer(serializers.ModelSerializer):
    category = serializers.CharField(max_length=100)
    # Spent so far in the current month; filled in by the view via the serializer context.
    spent = serializers.SerializerMethodField()

    class Meta:
        model = CategoryBudget
        fields = ['id', 'user_id', 'category', 'monthly_limit', 'spent', 'created_at', 'updated_at']
        read_only_fields = ['id', 'user_id', 'spent', 'created_at', 'updated_at']

    def get_spent(self, obj):
        spent_by_category = self.context.get('spent_by_category', {})
        return str(spent_by_category.get(obj.category.strip().lower(), 0))

    def validate_category(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError('Category is required.')
        user_id = self.context.get('user_id')
        existing = CategoryBudget.objects.filter(user_id=user_id, category__iexact=value)
        if self.instance:
            existing = existing.exclude(pk=self.instance.pk)
        if existing.exists():
            raise serializers.ValidationError('A budget for this category already exists.')
        return value


class GoalContributionSerializer(serializers.ModelSerializer):
    note = serializers.CharField(required=False, allow_null=True, allow_blank=True, max_length=200)

    class Meta:
        model = GoalContribution
        fields = ['id', 'goal_id', 'amount', 'note', 'date', 'created_at']
        read_only_fields = ['id', 'goal_id', 'created_at']


class SavingsGoalSerializer(serializers.ModelSerializer):
    name = serializers.CharField(max_length=100)
    saved_amount = serializers.SerializerMethodField()

    class Meta:
        model = SavingsGoal
        fields = [
            'id',
            'user_id',
            'name',
            'icon',
            'target_amount',
            'deadline',
            'saved_amount',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['id', 'user_id', 'saved_amount', 'created_at', 'updated_at']

    def get_saved_amount(self, obj):
        # The list view annotates `saved`; fall back to a query for freshly created/updated rows.
        saved = getattr(obj, 'saved', None)
        if saved is None:
            saved = obj.contributions.aggregate(total=Sum('amount'))['total'] or 0
        return str(saved)

    def validate_name(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError('Name is required.')
        return value


class SubscriptionSerializer(serializers.ModelSerializer):
    name = serializers.CharField(max_length=100)
    category = serializers.CharField(required=False, allow_null=True, allow_blank=True, max_length=100)
    frequency = serializers.ChoiceField(choices=Subscription.FREQUENCY_CHOICES)

    class Meta:
        model = Subscription
        fields = [
            'id',
            'user_id',
            'name',
            'amount',
            'category',
            'frequency',
            'next_due_date',
            'is_active',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['id', 'user_id', 'created_at', 'updated_at']

    def validate_name(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError('Name is required.')
        return value
