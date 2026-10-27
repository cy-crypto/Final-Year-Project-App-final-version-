import datetime

from django.contrib.auth.models import User
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import UserProfile
from accounts.timezones import user_now
from habits.models import Habit, HabitCompletion
from tasks.models import Task

from .models import Post


class CommunityTests(TestCase):
    def setUp(self):
        self.alice = User.objects.create_user('alice@test.com', 'alice@test.com')
        self.bob = User.objects.create_user('bob@test.com', 'bob@test.com')
        self.alice_profile = UserProfile.objects.create(user=self.alice, full_name='Alice', timezone='Asia/Karachi')
        self.bob_profile = UserProfile.objects.create(user=self.bob, full_name='Bob', timezone='Asia/Karachi')
        self.a = APIClient()
        self.a.force_authenticate(self.alice)
        self.b = APIClient()
        self.b.force_authenticate(self.bob)
        self.today = user_now(self.alice).date()

    def test_post_comment_like_and_ownership(self):
        res = self.a.post('/api/community/posts/', {'content': '  Hello all '}, format='json')
        self.assertEqual(res.status_code, 201, res.data)
        post_id = res.data['id']
        self.assertEqual(res.data['content'], 'Hello all')
        self.assertEqual(self.a.post('/api/community/posts/', {'content': '  '}, format='json').status_code, 400)

        # Bob can read, comment and like, but not edit or delete Alice's post.
        self.assertEqual(self.b.patch(f'/api/community/posts/{post_id}/', {'content': 'x'}, format='json').status_code, 403)
        self.assertEqual(self.b.delete(f'/api/community/posts/{post_id}/').status_code, 403)
        res = self.b.post(f'/api/community/posts/{post_id}/comments/', {'content': 'Nice'}, format='json')
        self.assertEqual(res.status_code, 201)
        comment_id = res.data['id']
        self.assertEqual(self.b.post(f'/api/community/posts/{post_id}/like/').data, {'liked': True, 'like_count': 1})

        feed = self.a.get('/api/community/posts/').data['results']
        self.assertEqual(feed[0]['comment_count'], 1)
        self.assertEqual(feed[0]['like_count'], 1)
        self.assertFalse(feed[0]['liked'])
        self.assertEqual(feed[0]['author']['name'], 'Alice')

        # The post author may remove comments on their post.
        self.assertEqual(self.a.delete(f'/api/community/comments/{comment_id}/').status_code, 204)
        self.assertEqual(self.b.post(f'/api/community/posts/{post_id}/like/').data['liked'], False)
        self.assertEqual(self.a.delete(f'/api/community/posts/{post_id}/').status_code, 204)

    def test_feed_pagination(self):
        for i in range(25):
            Post.objects.create(author=self.alice, content=f'p{i}')
        first = self.a.get('/api/community/posts/?limit=20').data
        self.assertEqual(len(first['results']), 20)
        second = self.a.get(f'/api/community/posts/?before={first["next_before"]}').data
        self.assertEqual(len(second['results']), 5)
        self.assertIsNone(second['next_before'])

    def test_share_streak_and_leaderboard(self):
        self.assertEqual(self.a.post('/api/community/posts/share/', {'kind': 'habit_streak'}, format='json').status_code, 400)
        Habit.objects.create(user_id=self.alice_profile.external_user_id, name='Read', streak_count=5, best_streak=5,
                             last_completed_date=self.today)
        Habit.objects.create(user_id=self.bob_profile.external_user_id, name='Run', streak_count=9, best_streak=9,
                             last_completed_date=self.today - datetime.timedelta(days=3))  # broken streak

        res = self.a.post('/api/community/posts/share/', {'kind': 'habit_streak'}, format='json')
        self.assertEqual(res.status_code, 201, res.data)
        self.assertEqual(res.data['meta']['streak'], 5)
        self.assertIn('Read', res.data['content'])

        board = self.a.get('/api/community/posts/leaderboard/?metric=streak').data
        self.assertEqual([r['name'] for r in board['rows']], ['Alice'])  # Bob's broken streak is not ranked
        self.assertEqual(board['me']['rank'], 1)

        self.alice_profile.preferences = {'community_visible': False}
        self.alice_profile.save()
        names = [r['name'] for r in self.b.get('/api/community/posts/leaderboard/?metric=streak').data['rows']]
        self.assertNotIn('Alice', names)

    def test_share_task_milestone(self):
        Task.objects.create(user=self.alice, title='A', status='done', completed_at=timezone.now())
        res = self.a.post('/api/community/posts/share/', {'kind': 'task_milestone', 'message': 'Good week'}, format='json')
        self.assertEqual(res.status_code, 201)
        self.assertEqual(res.data['content'], 'Good week')
        self.assertEqual(res.data['meta']['tasks_this_week'], 1)

    def test_challenges(self):
        body = {'title': 'Read daily', 'metric': 'habit_checkins', 'target': 3,
                'start_date': self.today.isoformat(), 'end_date': (self.today + datetime.timedelta(days=6)).isoformat()}
        res = self.a.post('/api/community/challenges/', body, format='json')
        self.assertEqual(res.status_code, 201, res.data)
        self.assertTrue(res.data['joined'])
        challenge_id = res.data['id']

        bad = {**body, 'end_date': (self.today - datetime.timedelta(days=1)).isoformat()}
        self.assertEqual(self.a.post('/api/community/challenges/', bad, format='json').status_code, 400)

        self.assertTrue(self.b.post(f'/api/community/challenges/{challenge_id}/join/').data['joined'])
        habit = Habit.objects.create(user_id=self.bob_profile.external_user_id, name='Read')
        HabitCompletion.objects.create(habit=habit, completed_date=self.today)

        standings = self.a.get(f'/api/community/challenges/{challenge_id}/standings/').data['rows']
        self.assertEqual(standings[0]['name'], 'Bob')
        self.assertEqual(standings[0]['progress'], 1)
        self.assertEqual(self.b.delete(f'/api/community/challenges/{challenge_id}/').status_code, 403)
