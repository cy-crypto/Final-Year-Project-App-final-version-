from django.urls import path

from .views import BudgetSettingsView, BudgetTransactionViewSet

transaction_list = BudgetTransactionViewSet.as_view({'get': 'list', 'post': 'create'})
transaction_detail = BudgetTransactionViewSet.as_view({
    'get': 'retrieve', 'put': 'update', 'patch': 'partial_update', 'delete': 'destroy',
})
transaction_summary = BudgetTransactionViewSet.as_view({'get': 'summary'})

urlpatterns = [
    path('transactions/summary/', transaction_summary, name='budget-transactions-summary'),
    path('transactions/', transaction_list, name='budget-transactions-list-create'),
    path('transactions/<uuid:pk>/', transaction_detail, name='budget-transactions-detail'),
    path('settings/', BudgetSettingsView.as_view(), name='budget-settings'),
]
