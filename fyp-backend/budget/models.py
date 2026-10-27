import uuid

from django.core.validators import MinValueValidator
from django.db import models
from django.utils import timezone


class BudgetTransaction(models.Model):
    TYPE_INCOME = 'income'
    TYPE_EXPENSE = 'expense'

    TYPE_CHOICES = [
        (TYPE_INCOME, 'income'),
        (TYPE_EXPENSE, 'expense'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user_id = models.UUIDField(db_index=True)
    type = models.CharField(max_length=10, choices=TYPE_CHOICES)
    amount = models.DecimalField(max_digits=12, decimal_places=2, validators=[MinValueValidator(0.01)])
    category = models.CharField(max_length=100, null=True, blank=True)
    description = models.TextField(null=True, blank=True)
    date = models.DateField(default=timezone.now)
    created_at = models.DateTimeField(default=timezone.now, editable=False)
    updated_at = models.DateTimeField(default=timezone.now, editable=False)

    class Meta:
        db_table = 'budget_transactions'
        ordering = ['-date']

    def __str__(self):
        return f"{self.type} - {self.amount} - {self.date}"


class BudgetSettings(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user_id = models.UUIDField(unique=True, db_index=True)
    monthly_limit = models.DecimalField(
        max_digits=12, decimal_places=2, null=True, blank=True,
        validators=[MinValueValidator(0.01)],
    )
    currency = models.CharField(max_length=10, default='PKR')
    created_at = models.DateTimeField(default=timezone.now, editable=False)
    updated_at = models.DateTimeField(default=timezone.now, editable=False)

    class Meta:
        db_table = 'budget_settings'

    def __str__(self):
        return f"{self.user_id} - {self.currency}"


class CategoryBudget(models.Model):
    """Monthly spending limit for one expense category."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user_id = models.UUIDField(db_index=True)
    category = models.CharField(max_length=100)
    monthly_limit = models.DecimalField(max_digits=12, decimal_places=2, validators=[MinValueValidator(0.01)])
    created_at = models.DateTimeField(default=timezone.now, editable=False)
    updated_at = models.DateTimeField(default=timezone.now, editable=False)

    class Meta:
        db_table = 'budget_category_budgets'
        ordering = ['category']

    def __str__(self):
        return f"{self.category} - {self.monthly_limit}"


class SavingsGoal(models.Model):
    """A savings target such as Ummrah, a laptop or an emergency fund."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user_id = models.UUIDField(db_index=True)
    name = models.CharField(max_length=100)
    icon = models.CharField(max_length=30, default='flag')
    target_amount = models.DecimalField(max_digits=12, decimal_places=2, validators=[MinValueValidator(0.01)])
    deadline = models.DateField(null=True, blank=True)
    created_at = models.DateTimeField(default=timezone.now, editable=False)
    updated_at = models.DateTimeField(default=timezone.now, editable=False)

    class Meta:
        db_table = 'budget_goals'
        ordering = ['created_at']

    def __str__(self):
        return f"{self.name} - {self.target_amount}"


class GoalContribution(models.Model):
    """One deposit towards a goal. A goal's saved amount is the sum of these."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    goal = models.ForeignKey(SavingsGoal, on_delete=models.CASCADE, related_name='contributions')
    amount = models.DecimalField(max_digits=12, decimal_places=2, validators=[MinValueValidator(0.01)])
    note = models.CharField(max_length=200, null=True, blank=True)
    date = models.DateField(default=timezone.localdate)
    created_at = models.DateTimeField(default=timezone.now, editable=False)

    class Meta:
        db_table = 'budget_goal_contributions'
        ordering = ['-date', '-created_at']

    def __str__(self):
        return f"{self.goal_id} + {self.amount}"


class Subscription(models.Model):
    """A recurring payment (rent, Netflix, gym...) the user wants to be reminded about."""

    FREQ_WEEKLY = 'weekly'
    FREQ_MONTHLY = 'monthly'
    FREQ_YEARLY = 'yearly'
    FREQUENCY_CHOICES = [
        (FREQ_WEEKLY, 'weekly'),
        (FREQ_MONTHLY, 'monthly'),
        (FREQ_YEARLY, 'yearly'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user_id = models.UUIDField(db_index=True)
    name = models.CharField(max_length=100)
    amount = models.DecimalField(max_digits=12, decimal_places=2, validators=[MinValueValidator(0.01)])
    category = models.CharField(max_length=100, null=True, blank=True)
    frequency = models.CharField(max_length=10, choices=FREQUENCY_CHOICES, default=FREQ_MONTHLY)
    next_due_date = models.DateField()
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(default=timezone.now, editable=False)
    updated_at = models.DateTimeField(default=timezone.now, editable=False)

    class Meta:
        db_table = 'budget_subscriptions'
        ordering = ['next_due_date', 'name']

    def __str__(self):
        return f"{self.name} - {self.amount} {self.frequency}"
