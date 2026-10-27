import uuid

import jwt
from django.conf import settings
from django.contrib.auth import get_user_model
from rest_framework import exceptions
from rest_framework.authentication import BaseAuthentication, get_authorization_header

from .models import UserProfile


User = get_user_model()

_jwks_client = None


def _get_jwks_client():
    global _jwks_client
    if _jwks_client is None:
        _jwks_client = jwt.PyJWKClient(
            f'{settings.SUPABASE_URL}/auth/v1/.well-known/jwks.json',
            cache_keys=True,
        )
    return _jwks_client


def _decode_token(token: str) -> dict:
    """Verify a Supabase access token (asymmetric signing keys, or legacy HS256 secret)."""
    options = {'require': ['exp', 'sub']}
    try:
        alg = jwt.get_unverified_header(token).get('alg')
        if alg == 'HS256':
            if not settings.SUPABASE_JWT_SECRET:
                raise exceptions.AuthenticationFailed('Server is missing SUPABASE_JWT_SECRET.')
            return jwt.decode(
                token,
                settings.SUPABASE_JWT_SECRET,
                algorithms=['HS256'],
                audience='authenticated',
                options=options,
            )

        signing_key = _get_jwks_client().get_signing_key_from_jwt(token)
        return jwt.decode(
            token,
            signing_key.key,
            algorithms=[alg],
            audience='authenticated',
            options=options,
        )
    except jwt.ExpiredSignatureError:
        raise exceptions.AuthenticationFailed('Session expired. Please sign in again.')
    except jwt.PyJWTError:
        raise exceptions.AuthenticationFailed('Invalid authentication token.')


def _user_for_claims(claims: dict):
    supabase_id = uuid.UUID(claims['sub'])
    email = (claims.get('email') or '').strip().lower()
    metadata = claims.get('user_metadata') or {}

    profile = UserProfile.objects.select_related('user').filter(supabase_user_id=supabase_id).first()
    if profile:
        return profile.user

    if not email:
        raise exceptions.AuthenticationFailed('Account has no email address.')

    # Supabase only issues tokens after the email is confirmed, so linking an existing
    # Django account by email is safe and keeps the user's existing data.
    user = User.objects.filter(username=email).first()
    if not user:
        user = User.objects.create_user(username=email, email=email)
        user.set_unusable_password()
        user.save(update_fields=['password'])

    profile, _ = UserProfile.objects.get_or_create(user=user)
    profile.supabase_user_id = supabase_id
    profile.email_confirmed = True
    if not profile.full_name:
        profile.full_name = (metadata.get('full_name') or metadata.get('name') or '')[:120]
    profile.save()
    return user


class SupabaseJWTAuthentication(BaseAuthentication):
    keyword = b'bearer'

    def authenticate(self, request):
        parts = get_authorization_header(request).split()
        if not parts or parts[0].lower() != self.keyword:
            return None
        if len(parts) != 2:
            raise exceptions.AuthenticationFailed('Invalid Authorization header.')

        claims = _decode_token(parts[1].decode())
        return (_user_for_claims(claims), claims)

    def authenticate_header(self, request):
        return 'Bearer'
