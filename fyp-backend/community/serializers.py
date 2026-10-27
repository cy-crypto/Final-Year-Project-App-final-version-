import datetime

from rest_framework import serializers

from accounts.timezones import user_now

from . import services
from .models import Challenge, Comment, Post


class AuthorField(serializers.Field):
    def __init__(self, **kwargs):
        kwargs['read_only'] = True
        super().__init__(**kwargs)

    def get_attribute(self, instance):
        return instance.author

    def to_representation(self, user):
        profile = services.profile_of(user)
        request = self.context.get('request')
        avatar = profile.avatar_url
        if profile.avatar_image:
            avatar = request.build_absolute_uri(profile.avatar_image.url) if request else profile.avatar_image.url
        return {
            'id': str(profile.external_user_id),
            'name': services.display_name(user, profile),
            'avatar_url': avatar,
        }


class CommentSerializer(serializers.ModelSerializer):
    author = AuthorField()
    is_mine = serializers.SerializerMethodField()

    class Meta:
        model = Comment
        fields = ['id', 'post', 'author', 'content', 'is_mine', 'created_at']
        read_only_fields = ['id', 'post', 'created_at']

    def get_is_mine(self, obj):
        request = self.context.get('request')
        return bool(request and obj.author_id == request.user.id)

    def validate_content(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError('Write something first.')
        return value


class PostSerializer(serializers.ModelSerializer):
    author = AuthorField()
    like_count = serializers.IntegerField(read_only=True, default=0)
    comment_count = serializers.IntegerField(read_only=True, default=0)
    liked = serializers.BooleanField(read_only=True, default=False)
    is_mine = serializers.SerializerMethodField()
    image_url = serializers.SerializerMethodField()
    recent_comments = serializers.SerializerMethodField()

    class Meta:
        model = Post
        fields = [
            'id', 'author', 'content', 'kind', 'meta', 'image', 'image_url', 'like_count', 'comment_count',
            'liked', 'is_mine', 'recent_comments', 'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'kind', 'meta', 'created_at', 'updated_at']
        extra_kwargs = {'image': {'write_only': True, 'required': False}}

    def get_is_mine(self, obj):
        request = self.context.get('request')
        return bool(request and obj.author_id == request.user.id)

    def get_image_url(self, obj):
        if not obj.image:
            return None
        request = self.context.get('request')
        return request.build_absolute_uri(obj.image.url) if request else obj.image.url

    def get_recent_comments(self, obj):
        if not self.context.get('with_comments'):
            return []
        comments = list(obj.comments.select_related('author').order_by('-created_at')[:2])[::-1]
        return CommentSerializer(comments, many=True, context=self.context).data

    def validate_content(self, value):
        return value.strip()

    def validate(self, attrs):
        content = attrs.get('content', getattr(self.instance, 'content', ''))
        image = attrs.get('image', getattr(self.instance, 'image', None))
        if not content and not image and (not self.instance or self.instance.kind == Post.KIND_POST):
            raise serializers.ValidationError({'content': 'Write something or add a photo.'})
        return attrs


class ShareSerializer(serializers.Serializer):
    kind = serializers.ChoiceField(choices=[Post.KIND_HABIT_STREAK, Post.KIND_TASK_MILESTONE, Post.KIND_FITNESS_MILESTONE])
    habit_id = serializers.IntegerField(required=False)
    message = serializers.CharField(required=False, allow_blank=True, max_length=500, default='')


class ChallengeSerializer(serializers.ModelSerializer):
    participant_count = serializers.IntegerField(read_only=True, default=0)
    joined = serializers.BooleanField(read_only=True, default=False)
    my_progress = serializers.SerializerMethodField()
    is_mine = serializers.SerializerMethodField()
    status = serializers.SerializerMethodField()

    class Meta:
        model = Challenge
        fields = [
            'id', 'title', 'description', 'metric', 'target', 'start_date', 'end_date',
            'participant_count', 'joined', 'my_progress', 'is_mine', 'status', 'created_at',
        ]
        read_only_fields = ['id', 'created_at']

    def _today(self):
        request = self.context.get('request')
        return user_now(request.user).date() if request else datetime.date.today()

    def get_status(self, obj):
        today = self._today()
        if today < obj.start_date:
            return 'upcoming'
        if today > obj.end_date:
            return 'ended'
        return 'active'

    def get_is_mine(self, obj):
        request = self.context.get('request')
        return bool(request and obj.created_by_id == request.user.id)

    def get_my_progress(self, obj):
        request = self.context.get('request')
        if not request or not getattr(obj, 'joined', False):
            return None
        return services.metric_value(request.user, obj.metric, obj.start_date, min(obj.end_date, self._today()))

    def validate_title(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError('Give the challenge a name.')
        return value

    def validate(self, attrs):
        start, end = attrs.get('start_date'), attrs.get('end_date')
        if start and end:
            if end < start:
                raise serializers.ValidationError({'end_date': 'The end date is before the start date.'})
            if (end - start).days > 90:
                raise serializers.ValidationError({'end_date': 'Challenges can last up to 90 days.'})
            if end < self._today():
                raise serializers.ValidationError({'end_date': 'This challenge would already be over.'})
        if attrs.get('target') == 0:
            raise serializers.ValidationError({'target': 'The target must be at least 1.'})
        return attrs
