from django.conf import settings
from django.db import models


class Post(models.Model):
    KIND_POST = 'post'
    KIND_HABIT_STREAK = 'habit_streak'
    KIND_TASK_MILESTONE = 'task_milestone'
    KIND_FITNESS_MILESTONE = 'fitness_milestone'
    KIND_CHOICES = [
        (KIND_POST, 'Post'),
        (KIND_HABIT_STREAK, 'Habit streak'),
        (KIND_TASK_MILESTONE, 'Task milestone'),
        (KIND_FITNESS_MILESTONE, 'Fitness milestone'),
    ]

    author = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='community_posts')
    content = models.TextField(max_length=1000, blank=True)
    kind = models.CharField(max_length=20, choices=KIND_CHOICES, default=KIND_POST)
    # Facts behind a shared achievement, e.g. {"habit": "Read", "streak": 12}.
    meta = models.JSONField(default=dict, blank=True)
    image = models.ImageField(upload_to='community/', blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at', '-id']

    def __str__(self):
        return f'{self.author} · {self.kind} · {self.created_at:%Y-%m-%d}'


class Comment(models.Model):
    post = models.ForeignKey(Post, on_delete=models.CASCADE, related_name='comments')
    author = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='community_comments')
    content = models.TextField(max_length=500)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['created_at', 'id']


class PostLike(models.Model):
    post = models.ForeignKey(Post, on_delete=models.CASCADE, related_name='likes')
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='community_likes')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=['post', 'user'], name='one_like_per_user')]


class Challenge(models.Model):
    METRIC_HABIT_CHECKINS = 'habit_checkins'
    METRIC_TASKS_COMPLETED = 'tasks_completed'
    METRIC_STEPS = 'steps'
    METRIC_CHOICES = [
        (METRIC_HABIT_CHECKINS, 'Habit check-ins'),
        (METRIC_TASKS_COMPLETED, 'Tasks completed'),
        (METRIC_STEPS, 'Steps walked'),
    ]

    title = models.CharField(max_length=120)
    description = models.TextField(max_length=500, blank=True)
    metric = models.CharField(max_length=20, choices=METRIC_CHOICES)
    target = models.PositiveIntegerField()
    start_date = models.DateField()
    end_date = models.DateField()
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='created_challenges')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['end_date', 'id']


class ChallengeParticipant(models.Model):
    challenge = models.ForeignKey(Challenge, on_delete=models.CASCADE, related_name='participants')
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='challenge_entries')
    joined_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=['challenge', 'user'], name='join_challenge_once')]
