import datetime

from django.contrib.auth import get_user_model
from django.db.models import Count, Exists, OuterRef, Sum
from django.shortcuts import get_object_or_404
from rest_framework import mixins, permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response

from accounts.timezones import user_now
from fitness.models import FitnessRecord
from habits.models import Habit

from . import services
from .models import Challenge, ChallengeParticipant, Comment, Post, PostLike
from .serializers import ChallengeSerializer, CommentSerializer, PostSerializer, ShareSerializer

User = get_user_model()
FEED_PAGE = 20


class IsAuthorOrReadOnly(permissions.BasePermission):
    """Everyone signed in can read and interact (like, comment, join); only the author can change
    or delete the post or challenge itself (row-level ownership)."""

    INTERACTIONS = {'like', 'comments', 'join', 'standings'}

    def has_object_permission(self, request, view, obj):
        if request.method in permissions.SAFE_METHODS or view.action in self.INTERACTIONS:
            return True
        owner_id = getattr(obj, 'author_id', None) or getattr(obj, 'created_by_id', None)
        return owner_id == request.user.id


class PostViewSet(viewsets.ModelViewSet):
    """Community feed. List params: kind, mine=1, before=<post id> (older page), limit."""

    serializer_class = PostSerializer
    permission_classes = [permissions.IsAuthenticated, IsAuthorOrReadOnly]
    parser_classes = [JSONParser, MultiPartParser, FormParser]

    def get_queryset(self):
        user = self.request.user
        qs = Post.objects.select_related('author').annotate(
            like_count=Count('likes', distinct=True),
            comment_count=Count('comments', distinct=True),
            liked=Exists(PostLike.objects.filter(post=OuterRef('pk'), user=user)),
        )
        params = self.request.query_params
        if params.get('kind'):
            qs = qs.filter(kind=params['kind'])
        if params.get('mine') == '1':
            qs = qs.filter(author=user)
        return qs

    def get_serializer_context(self):
        return {**super().get_serializer_context(), 'with_comments': True}

    def list(self, request, *args, **kwargs):
        qs = self.get_queryset()
        before = request.query_params.get('before')
        if before and before.isdigit():
            qs = qs.filter(id__lt=int(before))
        try:
            limit = min(max(int(request.query_params.get('limit', FEED_PAGE)), 1), 50)
        except ValueError:
            limit = FEED_PAGE
        page = list(qs.order_by('-id')[: limit + 1])
        has_more = len(page) > limit
        page = page[:limit]
        return Response({
            'results': self.get_serializer(page, many=True).data,
            'next_before': page[-1].id if has_more and page else None,
        })

    def perform_create(self, serializer):
        serializer.save(author=self.request.user, kind=Post.KIND_POST)

    def _fresh(self, post_id):
        return self.get_queryset().get(pk=post_id)

    @action(detail=True, methods=['post'])
    def like(self, request, pk=None):
        post = self.get_object()
        like, created = PostLike.objects.get_or_create(post=post, user=request.user)
        if not created:
            like.delete()
        return Response({'liked': created, 'like_count': post.likes.count()})

    @action(detail=True, methods=['get', 'post'])
    def comments(self, request, pk=None):
        post = self.get_object()
        if request.method == 'GET':
            comments = post.comments.select_related('author')
            return Response(CommentSerializer(comments, many=True, context={'request': request}).data)
        serializer = CommentSerializer(data=request.data, context={'request': request})
        serializer.is_valid(raise_exception=True)
        serializer.save(post=post, author=request.user)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=['post'])
    def share(self, request):
        """Share an achievement from another module as a post (FR-10.3)."""
        data = ShareSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        kind, message = data.validated_data['kind'], data.validated_data['message'].strip()
        user = request.user
        today = user_now(user).date()

        if kind == Post.KIND_HABIT_STREAK:
            if data.validated_data.get('habit_id'):
                profile = services.profile_of(user)
                habit = Habit.objects.filter(pk=data.validated_data['habit_id'], user_id=profile.external_user_id).first()
                if not habit:
                    return Response({'detail': 'Habit not found.'}, status=status.HTTP_404_NOT_FOUND)
                streak = services.live_streak(habit, today)
            else:
                streak, habit = services.best_live_habit(user)
            if not habit or streak <= 0:
                return Response({'detail': 'You have no active habit streak to share yet.'}, status=status.HTTP_400_BAD_REQUEST)
            meta = {'habit': habit.name, 'streak': streak, 'best_streak': habit.best_streak, 'category': habit.category}
            default = f'{streak}-day streak on "{habit.name}"!'
        elif kind == Post.KIND_TASK_MILESTONE:
            week = services.tasks_done_since(user, today - datetime.timedelta(days=6))
            if week <= 0:
                return Response({'detail': 'Finish a task this week to share a milestone.'}, status=status.HTTP_400_BAD_REQUEST)
            meta = {'tasks_this_week': week}
            default = f'Finished {week} task{"s" if week != 1 else ""} this week!'
        else:
            profile = services.profile_of(user)
            records = FitnessRecord.objects.filter(user_id=profile.external_user_id)
            steps_today = records.filter(date=today).aggregate(s=Sum('steps'))['s'] or 0
            steps_week = records.filter(date__gte=today - datetime.timedelta(days=6)).aggregate(s=Sum('steps'))['s'] or 0
            if steps_week <= 0:
                return Response({'detail': 'Log some steps in Fitness to share a milestone.'}, status=status.HTTP_400_BAD_REQUEST)
            meta = {'steps_today': steps_today, 'steps_week': steps_week}
            default = f'Walked {steps_week:,} steps this week!'

        post = Post.objects.create(author=user, kind=kind, meta=meta, content=message or default)
        return Response(self.get_serializer(self._fresh(post.id)).data, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=['get'])
    def leaderboard(self, request):
        metric = request.query_params.get('metric', 'streak')
        if metric not in ('streak', 'tasks'):
            return Response({'detail': 'metric must be streak or tasks.'}, status=status.HTTP_400_BAD_REQUEST)
        users = User.objects.filter(is_active=True)
        return Response(services.leaderboard(users, metric, request.user))


class CommentViewSet(mixins.DestroyModelMixin, viewsets.GenericViewSet):
    """Delete a comment: its author, or the author of the post it is on."""

    permission_classes = [permissions.IsAuthenticated]
    queryset = Comment.objects.select_related('post')

    def destroy(self, request, *args, **kwargs):
        comment = get_object_or_404(Comment.objects.select_related('post'), pk=kwargs['pk'])
        if request.user.id not in (comment.author_id, comment.post.author_id):
            return Response({'detail': 'You can only delete your own comments.'}, status=status.HTTP_403_FORBIDDEN)
        comment.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class ChallengeViewSet(viewsets.ModelViewSet):
    """Community challenges (FR-10.4). Lists running and upcoming ones; include_ended=1 adds finished ones."""

    serializer_class = ChallengeSerializer
    permission_classes = [permissions.IsAuthenticated, IsAuthorOrReadOnly]

    def get_queryset(self):
        user = self.request.user
        qs = Challenge.objects.annotate(
            participant_count=Count('participants', distinct=True),
            joined=Exists(ChallengeParticipant.objects.filter(challenge=OuterRef('pk'), user=user)),
        )
        if self.action == 'list' and self.request.query_params.get('include_ended') != '1':
            qs = qs.filter(end_date__gte=user_now(user).date())
        return qs

    def perform_create(self, serializer):
        challenge = serializer.save(created_by=self.request.user)
        ChallengeParticipant.objects.create(challenge=challenge, user=self.request.user)

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        fresh = self.get_queryset().get(pk=serializer.instance.pk)
        return Response(self.get_serializer(fresh).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'])
    def join(self, request, pk=None):
        challenge = self.get_object()
        entry, created = ChallengeParticipant.objects.get_or_create(challenge=challenge, user=request.user)
        if not created:
            entry.delete()
        return Response(self.get_serializer(self.get_queryset().get(pk=challenge.pk)).data)

    @action(detail=True, methods=['get'])
    def standings(self, request, pk=None):
        challenge = self.get_object()
        end = min(challenge.end_date, user_now(request.user).date())
        rows = []
        for entry in challenge.participants.select_related('user'):
            user = entry.user
            profile = services.profile_of(user)
            if user != request.user and not services.is_visible(profile):
                continue
            progress = services.metric_value(user, challenge.metric, challenge.start_date, end) if end >= challenge.start_date else 0
            rows.append({
                'name': services.display_name(user, profile),
                'progress': progress,
                'pct': min(round(progress * 100 / challenge.target), 100),
                'completed': progress >= challenge.target,
                'is_me': user == request.user,
            })
        rows.sort(key=lambda r: (-r['progress'], r['name'].lower()))
        for index, row in enumerate(rows, start=1):
            row['rank'] = index
        return Response({'challenge': self.get_serializer(challenge).data, 'rows': rows})
