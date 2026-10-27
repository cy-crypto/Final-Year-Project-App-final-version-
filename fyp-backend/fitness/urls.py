from django.urls import path

from .views import (
    FitnessGoalViewSet,
    FitnessProfileView,
    FitnessRecordViewSet,
    WaterIntakeViewSet,
    WorkoutRoutineViewSet,
    SleepRecordViewSet,
)

record_list = FitnessRecordViewSet.as_view({'get': 'list', 'post': 'create'})
record_detail = FitnessRecordViewSet.as_view({
    'get': 'retrieve', 'put': 'update', 'patch': 'partial_update', 'delete': 'destroy',
})
record_today = FitnessRecordViewSet.as_view({'get': 'today'})
record_trends = FitnessRecordViewSet.as_view({'get': 'trends'})

goal_list = FitnessGoalViewSet.as_view({'get': 'list', 'post': 'create'})
goal_detail = FitnessGoalViewSet.as_view({
    'get': 'retrieve', 'put': 'update', 'patch': 'partial_update', 'delete': 'destroy',
})

water_list = WaterIntakeViewSet.as_view({'get': 'list', 'post': 'create'})
water_detail = WaterIntakeViewSet.as_view({
    'get': 'retrieve', 'put': 'update', 'patch': 'partial_update', 'delete': 'destroy',
})
water_today = WaterIntakeViewSet.as_view({'get': 'today'})

routine_list = WorkoutRoutineViewSet.as_view({'get': 'list', 'post': 'create'})
routine_detail = WorkoutRoutineViewSet.as_view({
    'get': 'retrieve', 'put': 'update', 'patch': 'partial_update', 'delete': 'destroy',
})
routine_log = WorkoutRoutineViewSet.as_view({'post': 'log'})

urlpatterns = [
    path('sleep/summary/', SleepRecordViewSet.as_view({'get': 'summary'}), name='fitness-sleep-summary'),
    path('sleep/', SleepRecordViewSet.as_view({'get': 'list', 'post': 'create'}), name='fitness-sleep-list'),
    path('sleep/<uuid:pk>/', SleepRecordViewSet.as_view({'get': 'retrieve', 'patch': 'partial_update', 'delete': 'destroy'}), name='fitness-sleep-detail'),
    path('goals/achievements/', FitnessGoalViewSet.as_view({'post': 'achievements'}), name='fitness-goal-achievements'),
    path('records/today/', record_today, name='fitness-records-today'),
    path('records/trends/', record_trends, name='fitness-records-trends'),
    path('records/', record_list, name='fitness-records-list-create'),
    path('records/<uuid:pk>/', record_detail, name='fitness-records-detail'),
    path('goals/', goal_list, name='fitness-goals-list-create'),
    path('goals/<uuid:pk>/', goal_detail, name='fitness-goals-detail'),
    path('profile/', FitnessProfileView.as_view(), name='fitness-profile'),
    path('water/today/', water_today, name='fitness-water-today'),
    path('water/', water_list, name='fitness-water-list-create'),
    path('water/<uuid:pk>/', water_detail, name='fitness-water-detail'),
    path('routines/', routine_list, name='fitness-routines-list-create'),
    path('routines/<uuid:pk>/', routine_detail, name='fitness-routines-detail'),
    path('routines/<uuid:pk>/log/', routine_log, name='fitness-routines-log'),
]
