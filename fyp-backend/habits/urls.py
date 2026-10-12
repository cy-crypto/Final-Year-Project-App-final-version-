from django.urls import path

from .views import HabitViewSet

habit_list = HabitViewSet.as_view({'get': 'list', 'post': 'create'})
habit_complete = HabitViewSet.as_view({'patch': 'complete'})
habit_history = HabitViewSet.as_view({'get': 'history'})
habit_detail = HabitViewSet.as_view({'get': 'retrieve', 'patch': 'update', 'delete': 'destroy'})

urlpatterns = [
    path('habits/', habit_list, name='habits-list-create'),
    path('habits/<int:pk>/complete/', habit_complete, name='habits-complete'),
    path('habits/<int:pk>/history/', habit_history, name='habits-history'),
    path('habits/<int:pk>/', habit_detail, name='habits-detail'),
]
