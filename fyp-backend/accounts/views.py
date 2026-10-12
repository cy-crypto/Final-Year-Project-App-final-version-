import random

from django.conf import settings
from django.contrib.auth import authenticate, get_user_model
from django.core.mail import send_mail
from django.utils import timezone
from rest_framework import permissions, status
from rest_framework.authtoken.models import Token
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import ConfirmationCode, UserProfile
from .serializers import (
    ForgotPasswordSerializer,
    LoginSerializer,
    ProfileSerializer,
    ResetPasswordSerializer,
    SignupSerializer,
)


User = get_user_model()


def _create_confirmation_code(email: str, minutes_valid: int = 10) -> ConfirmationCode:
    code = f"{random.randint(100000, 999999)}"
    expires_at = timezone.now() + timezone.timedelta(minutes=minutes_valid)
    return ConfirmationCode.objects.create(email=email, code=code, expires_at=expires_at)


def _resolve_avatar_url(profile, request=None):
    if profile.avatar_image:
        url = profile.avatar_image.url
        if request:
            return request.build_absolute_uri(url)
        return url
    return profile.avatar_url


def _profile_payload(profile, request=None):
    return {
        'full_name': profile.full_name,
        'avatar_url': _resolve_avatar_url(profile, request=request),
        'bio': profile.bio,
        'selected_city': profile.selected_city,
    }


def _auth_payload(user, request=None):
    profile, _ = UserProfile.objects.get_or_create(user=user)
    token, _ = Token.objects.get_or_create(user=user)
    return {
        'token': token.key,
        'email': user.email,
        'user_id': str(profile.external_user_id),
        'full_name': profile.full_name,
        'avatar_url': _resolve_avatar_url(profile, request=request),
        'bio': profile.bio,
        'selected_city': profile.selected_city,
    }


class SignupView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        serializer = SignupSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        email = serializer.validated_data['email']
        password = serializer.validated_data['password']
        full_name = serializer.validated_data.get('full_name', '')

        user = User.objects.create_user(
            username=email,
            email=email,
            password=password,
        )

        # ensure profile exists and save full name if provided
        profile, _ = UserProfile.objects.get_or_create(user=user)
        if full_name:
            profile.full_name = full_name
        profile.save()

        return Response(_auth_payload(user, request=request), status=status.HTTP_201_CREATED)


class LoginView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        serializer = LoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        email = serializer.validated_data['email']
        password = serializer.validated_data['password']

        user = authenticate(request=request, username=email, password=password)
        if not user:
            return Response({'detail': 'Invalid email or password.'}, status=status.HTTP_401_UNAUTHORIZED)

        return Response(_auth_payload(user, request=request), status=status.HTTP_200_OK)


class MeView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        return Response(_auth_payload(request.user, request=request), status=status.HTTP_200_OK)


class LogoutView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        Token.objects.filter(user=request.user).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class ProfileView(APIView):
    permission_classes = [permissions.IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def get(self, request):
        profile, _ = UserProfile.objects.get_or_create(user=request.user)
        return Response(_profile_payload(profile, request=request), status=status.HTTP_200_OK)

    def patch(self, request):
        serializer = ProfileSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)

        profile, _ = UserProfile.objects.get_or_create(user=request.user)
        for field, value in serializer.validated_data.items():
            setattr(profile, field, value)
        profile.save(update_fields=list(serializer.validated_data.keys()))

        return Response(_profile_payload(profile, request=request), status=status.HTTP_200_OK)


class ForgotPasswordView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        serializer = ForgotPasswordSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        email = serializer.validated_data['email']

        # Avoid user enumeration: always return success.
        if User.objects.filter(username=email).exists():
            code_entry = _create_confirmation_code(email)
            send_mail(
                subject='Password reset code',
                message=f'Your password reset code is: {code_entry.code}',
                from_email=getattr(settings, 'DEFAULT_FROM_EMAIL', None),
                recipient_list=[email],
                fail_silently=False,
            )

        return Response({'detail': 'If the account exists, a reset code was sent.'}, status=status.HTTP_200_OK)


class ResetPasswordView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        serializer = ResetPasswordSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        email = serializer.validated_data['email']
        code = serializer.validated_data['code'].strip()
        new_password = serializer.validated_data['new_password']

        entry = (
            ConfirmationCode.objects.filter(
                email=email,
                code=code,
                used=False,
                expires_at__gt=timezone.now(),
            )
            .order_by('-created_at')
            .first()
        )

        if not entry:
            return Response({'detail': 'Invalid or expired code.'}, status=status.HTTP_400_BAD_REQUEST)

        user = User.objects.filter(username=email).first()
        if not user:
            return Response({'detail': 'Account not found.'}, status=status.HTTP_404_NOT_FOUND)

        user.set_password(new_password)
        user.save(update_fields=['password'])
        entry.used = True
        entry.save(update_fields=['used'])

        return Response({'detail': 'Password reset successful.'}, status=status.HTTP_200_OK)
