# Serializers for the live Supabase-backed tables `budget_transactions` and
# `budget_settings` (see budget/models.py) — schema-locked, not arbitrary Django fields.

from rest_framework import serializers

from .models import BudgetTransaction, BudgetSettings


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
