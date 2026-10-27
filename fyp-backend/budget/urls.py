from django.urls import path

from .views import BudgetSettingsView, BudgetTransactionViewSet, CategoryBudgetViewSet, SavingsGoalViewSet, SubscriptionViewSet

transaction_list = BudgetTransactionViewSet.as_view({'get': 'list', 'post': 'create'})
transaction_detail = BudgetTransactionViewSet.as_view({
    'get': 'retrieve', 'put': 'update', 'patch': 'partial_update', 'delete': 'destroy',
})
transaction_summary = BudgetTransactionViewSet.as_view({'get': 'summary'})

category_budget_list = CategoryBudgetViewSet.as_view({'get': 'list', 'post': 'create'})
category_budget_detail = CategoryBudgetViewSet.as_view({
    'get': 'retrieve', 'put': 'update', 'patch': 'partial_update', 'delete': 'destroy',
})

goal_list = SavingsGoalViewSet.as_view({'get': 'list', 'post': 'create'})
goal_detail = SavingsGoalViewSet.as_view({
    'get': 'retrieve', 'put': 'update', 'patch': 'partial_update', 'delete': 'destroy',
})
goal_contributions = SavingsGoalViewSet.as_view({'get': 'contributions', 'post': 'contributions'})
goal_contribution_detail = SavingsGoalViewSet.as_view({'delete': 'delete_contribution'})

subscription_list = SubscriptionViewSet.as_view({'get': 'list', 'post': 'create'})
subscription_detail = SubscriptionViewSet.as_view({
    'get': 'retrieve', 'put': 'update', 'patch': 'partial_update', 'delete': 'destroy',
})
subscription_pay = SubscriptionViewSet.as_view({'post': 'pay'})

urlpatterns = [
    path('subscriptions/', subscription_list, name='budget-subscriptions-list-create'),
    path('subscriptions/<uuid:pk>/', subscription_detail, name='budget-subscriptions-detail'),
    path('subscriptions/<uuid:pk>/pay/', subscription_pay, name='budget-subscriptions-pay'),
    path('goals/', goal_list, name='budget-goals-list-create'),
    path('goals/<uuid:pk>/', goal_detail, name='budget-goals-detail'),
    path('goals/<uuid:pk>/contributions/', goal_contributions, name='budget-goal-contributions'),
    path('goals/<uuid:pk>/contributions/<uuid:contribution_id>/', goal_contribution_detail,
         name='budget-goal-contribution-detail'),
    path('category-budgets/', category_budget_list, name='budget-category-budgets-list-create'),
    path('category-budgets/<uuid:pk>/', category_budget_detail, name='budget-category-budgets-detail'),
    path('transactions/summary/', transaction_summary, name='budget-transactions-summary'),
    path('transactions/', transaction_list, name='budget-transactions-list-create'),
    path('transactions/<uuid:pk>/', transaction_detail, name='budget-transactions-detail'),
    path('settings/', BudgetSettingsView.as_view(), name='budget-settings'),
]
