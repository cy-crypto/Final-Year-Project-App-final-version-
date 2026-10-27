from django.conf import settings
from django.contrib.auth import get_user_model
from rest_framework.authentication import BaseAuthentication, get_authorization_header

from .models import UserProfile


User = get_user_model()

DEMO_EMAIL = 'demo@personalcompanion.local'


class DevBypassAuthentication(BaseAuthentication):
    """DEV ONLY: with DEV_AUTH_BYPASS on, requests without a token act as one shared demo user.

    Lets the app skip Supabase sign-in while login is disabled. Requests that do send a
    Bearer token still go through SupabaseJWTAuthentication first.
    """

    def authenticate(self, request):
        if not settings.DEV_AUTH_BYPASS or get_authorization_header(request):
            return None

        user, created = User.objects.get_or_create(username=DEMO_EMAIL, defaults={'email': DEMO_EMAIL})
        if created:
            user.set_unusable_password()
            user.save(update_fields=['password'])
        profile, _ = UserProfile.objects.get_or_create(user=user)
        if not profile.full_name:
            profile.full_name = 'Demo User'
            profile.save(update_fields=['full_name'])
        return (user, None)
