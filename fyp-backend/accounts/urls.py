from django.urls import path

from .views import MeView, ProfileSummaryView, ProfileView

# Sign up, sign in, email verification and password reset are handled by Supabase Auth.
urlpatterns = [
    path('me/', MeView.as_view(), name='auth-me'),
    path('profile/', ProfileView.as_view(), name='auth-profile'),
    path('profile/summary/', ProfileSummaryView.as_view(), name='auth-profile-summary'),
]
