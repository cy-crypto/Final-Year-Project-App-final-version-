import datetime

from django.contrib.auth import get_user_model
from rest_framework import permissions, status
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import UserProfile
from .serializers import ProfileSerializer, merged_preferences
from .timezones import user_now


User = get_user_model()


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
        'timezone': profile.timezone,
        'preferences': merged_preferences(profile.preferences),
        'email': profile.user.email,
        'member_since': profile.user.date_joined.date().isoformat(),
    }


def _auth_payload(user, request=None):
    profile, _ = UserProfile.objects.get_or_create(user=user)
    return {
        'email': user.email,
        'user_id': str(profile.external_user_id),
        'full_name': profile.full_name,
        'avatar_url': _resolve_avatar_url(profile, request=request),
        'bio': profile.bio,
        'selected_city': profile.selected_city,
        'timezone': profile.timezone,
        'preferences': merged_preferences(profile.preferences),
        'member_since': user.date_joined.date().isoformat(),
    }


class MeView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        return Response(_auth_payload(request.user, request=request), status=status.HTTP_200_OK)


class ProfileView(APIView):
    permission_classes = [permissions.IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def get(self, request):
        profile, _ = UserProfile.objects.get_or_create(user=request.user)
        return Response(_profile_payload(profile, request=request), status=status.HTTP_200_OK)

    def patch(self, request):
        serializer = ProfileSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        data = dict(serializer.validated_data)

        profile, _ = UserProfile.objects.get_or_create(user=request.user)
        changed = set()
        if data.pop('remove_avatar', False):
            if profile.avatar_image:
                profile.avatar_image.delete(save=False)
            profile.avatar_image = None
            profile.avatar_url = ''
            changed |= {'avatar_image', 'avatar_url'}
        if 'preferences' in data:
            profile.preferences = {**merged_preferences(profile.preferences), **data.pop('preferences')}
            changed.add('preferences')
        if 'avatar_image' in data and profile.avatar_image:
            profile.avatar_image.delete(save=False)
        for field, value in data.items():
            setattr(profile, field, value)
            changed.add(field)
        if changed:
            profile.save(update_fields=sorted(changed))

        return Response(_profile_payload(profile, request=request), status=status.HTTP_200_OK)


class ProfileSummaryView(APIView):
    """Numbers for the profile page, read from each module (tasks, medication, habits, community)."""

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        from habits.models import Habit
        from medications.models import Medication
        from medications.services import adherence, next_dose
        from tasks.models import Task

        user = request.user
        profile, _ = UserProfile.objects.get_or_create(user=user)
        today = user_now(user).date()
        tasks = Task.objects.filter(user=user)
        habits = Habit.objects.filter(user_id=profile.external_user_id)
        meds = Medication.objects.filter(user=user, is_active=True)
        week = adherence(user, 7)
        upcoming = next_dose(user)

        summary = {
            'member_since': user.date_joined.date().isoformat(),
            'days_active': (today - user.date_joined.date()).days + 1,
            'tasks': {
                'open': tasks.exclude(status=Task.STATUS_DONE).count(),
                'done': tasks.filter(status=Task.STATUS_DONE).count(),
                'due_today': tasks.filter(deadline=today).exclude(status=Task.STATUS_DONE).count(),
                'done_this_week': tasks.filter(
                    completed_at__date__gte=today - datetime.timedelta(days=6)
                ).count(),
            },
            'habits': {
                'count': habits.count(),
                'best_streak': max((h.best_streak for h in habits), default=0),
                'current_streak': max((h.streak_count for h in habits), default=0),
            },
            'medication': {
                'active': meds.count(),
                'needs_refill': sum(1 for m in meds if m.needs_refill),
                'adherence_7d': week['rate'],
                'next_dose': upcoming,
            },
        }
        try:
            from community.models import Post

            summary['community'] = {'posts': Post.objects.filter(author=user).count()}
        except ImportError:
            pass
        return Response(summary)
