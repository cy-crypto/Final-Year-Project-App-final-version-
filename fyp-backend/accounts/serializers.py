from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from rest_framework import serializers


User = get_user_model()


class SignupSerializer(serializers.Serializer):
    full_name = serializers.CharField(required=False, allow_blank=True, max_length=120)
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True, min_length=8)

    def validate_email(self, value):
        clean = value.strip().lower()
        if User.objects.filter(username=clean).exists():
            raise serializers.ValidationError('An account with this email already exists.')
        return clean

    def validate_password(self, value):
        validate_password(value)
        return value


class LoginSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True, min_length=8)

    def validate_email(self, value):
        return value.strip().lower()


# Known app preferences with their defaults. Unknown keys are rejected so typos do not pile up.
DEFAULT_PREFERENCES = {
    'temperature_unit': 'C',          # 'C' or 'F'
    'notify_tasks': True,
    'notify_habits': True,
    'notify_medication': True,
    'notify_prayer': True,
    'notify_weather_alerts': True,
    'prayer_method': 1,               # Aladhan method id; 1 = University of Islamic Sciences, Karachi
    'prayer_school': 1,               # Asr juristic school; 0 = Shafi, 1 = Hanafi
    'community_visible': True,        # appear on community leaderboards
}

_PREFERENCE_CHOICES = {
    'temperature_unit': {'C', 'F'},
    'prayer_method': set(range(0, 24)),
    'prayer_school': {0, 1},
}


def merged_preferences(stored):
    return {**DEFAULT_PREFERENCES, **{k: v for k, v in (stored or {}).items() if k in DEFAULT_PREFERENCES}}


class ProfileSerializer(serializers.Serializer):
    full_name = serializers.CharField(required=False, allow_blank=True, max_length=120)
    avatar_url = serializers.URLField(required=False, allow_blank=True)
    avatar_image = serializers.ImageField(required=False, allow_null=True)
    remove_avatar = serializers.BooleanField(required=False, write_only=True)
    bio = serializers.CharField(required=False, allow_blank=True, max_length=280)
    selected_city = serializers.CharField(required=False, allow_blank=True, max_length=120)
    timezone = serializers.CharField(required=False, allow_blank=True, max_length=64)
    preferences = serializers.DictField(required=False)

    def validate_full_name(self, value):
        return value.strip()

    def validate_selected_city(self, value):
        return value.strip()

    def validate_timezone(self, value):
        from .timezones import is_valid_timezone

        if value and not is_valid_timezone(value):
            raise serializers.ValidationError('Unknown time zone.')
        return value

    def validate_preferences(self, value):
        cleaned = {}
        for key, item in value.items():
            if key not in DEFAULT_PREFERENCES:
                raise serializers.ValidationError(f'Unknown preference "{key}".')
            default = DEFAULT_PREFERENCES[key]
            if isinstance(default, bool):
                if not isinstance(item, bool):
                    raise serializers.ValidationError(f'"{key}" must be true or false.')
            elif isinstance(default, int):
                if isinstance(item, bool) or not isinstance(item, int):
                    raise serializers.ValidationError(f'"{key}" must be a number.')
            if key in _PREFERENCE_CHOICES and item not in _PREFERENCE_CHOICES[key]:
                raise serializers.ValidationError(f'"{item}" is not a valid value for "{key}".')
            cleaned[key] = item
        return cleaned


class VerifyCodeSerializer(serializers.Serializer):
    email = serializers.EmailField()
    code = serializers.CharField()


class ResendCodeSerializer(serializers.Serializer):
    email = serializers.EmailField()


class SocialAuthSerializer(serializers.Serializer):
    provider = serializers.ChoiceField(choices=['google', 'apple'])
    credential = serializers.CharField(required=False, allow_blank=True)
    identity_token = serializers.CharField(required=False, allow_blank=True)
    email = serializers.EmailField(required=False)
    full_name = serializers.CharField(required=False, allow_blank=True)


class ForgotPasswordSerializer(serializers.Serializer):
    email = serializers.EmailField()

    def validate_email(self, value):
        return value.strip().lower()


class ResetPasswordSerializer(serializers.Serializer):
    email = serializers.EmailField()
    code = serializers.CharField()
    new_password = serializers.CharField(write_only=True, min_length=8)

    def validate_email(self, value):
        return value.strip().lower()

    def validate_new_password(self, value):
        validate_password(value)
        return value
