import datetime

from django.contrib.auth.models import User
from django.core import mail
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from .models import Task


class TaskApiTests(TestCase):
	def setUp(self):
		self.user = User.objects.create_user('a@test.com', 'a@test.com')
		self.other = User.objects.create_user('b@test.com', 'b@test.com')
		self.client = APIClient()
		self.client.force_authenticate(self.user)

	def test_create_update_and_toggle(self):
		res = self.client.post('/tasks/', {'title': '  Buy milk ', 'priority': 'high', 'deadline': '2026-11-01'}, format='json')
		self.assertEqual(res.status_code, 201, res.data)
		self.assertEqual(res.data['title'], 'Buy milk')
		self.assertEqual(res.data['time_spent_seconds'], 0)
		task_id = res.data['id']

		res = self.client.patch(f'/tasks/{task_id}/', {'status': 'done'}, format='json')
		self.assertEqual(res.status_code, 200)
		self.assertIsNotNone(res.data['completed_at'])
		self.assertEqual(res.data['progress_percentage'], 100)

		res = self.client.post(f'/tasks/{task_id}/toggle/')
		self.assertEqual(res.data['status'], 'pending')
		self.assertIsNone(res.data['completed_at'])

	def test_filters_and_isolation(self):
		Task.objects.create(user=self.user, title='Read book', category='Study', priority='low')
		Task.objects.create(user=self.user, title='Gym', category='Health', priority='high', status='done')
		Task.objects.create(user=self.other, title='Read secret', category='Study')

		self.assertEqual(len(self.client.get('/tasks/').data), 2)
		self.assertEqual([t['title'] for t in self.client.get('/tasks/?search=read').data], ['Read book'])
		self.assertEqual(len(self.client.get('/tasks/?status=done').data), 1)
		self.assertEqual(len(self.client.get('/tasks/?category=study').data), 1)
		other_task = Task.objects.get(user=self.other)
		self.assertEqual(self.client.patch(f'/tasks/{other_task.id}/', {'title': 'x'}, format='json').status_code, 404)

	def test_log_time_and_link_attachment(self):
		task = Task.objects.create(user=self.user, title='Write report')
		res = self.client.post(f'/tasks/{task.id}/log-time/', {'seconds': 90}, format='json')
		self.assertEqual(res.data['time_spent_seconds'], 90)
		self.assertEqual(self.client.post(f'/tasks/{task.id}/log-time/', {'seconds': 0}, format='json').status_code, 400)

		res = self.client.post(f'/tasks/{task.id}/attachments/', {'attachment_type': 'url', 'url': 'https://example.com'}, format='json')
		self.assertEqual(res.status_code, 201, res.data)
		attachment_id = res.data['id']
		self.assertEqual(len(self.client.get(f'/tasks/{task.id}/').data['attachments']), 1)
		self.assertEqual(self.client.delete(f'/tasks/{task.id}/attachments/{attachment_id}/').status_code, 204)

	def test_report_shape(self):
		Task.objects.create(user=self.user, title='A', priority='high', status='done', completed_at=timezone.now())
		Task.objects.create(user=self.user, title='B', priority='low', category='Work',
							deadline=timezone.localdate() - datetime.timedelta(days=2))
		res = self.client.get('/tasks/report/?period=weekly')
		self.assertEqual(res.status_code, 200)
		self.assertEqual(res.data['summary']['total'], 2)
		self.assertEqual(res.data['summary']['completed'], 1)
		self.assertEqual(res.data['summary']['overdue'], 1)
		self.assertEqual(res.data['by_priority']['high']['completed'], 1)
		self.assertIn('Work', res.data['by_category'])
		self.assertEqual(len(res.data['chart_data']['labels']), 7)
		self.assertEqual(sum(res.data['chart_data']['completed']), 1)
		self.assertEqual(len(self.client.get('/tasks/report/?period=monthly').data['chart_data']['labels']), 4)
		self.assertEqual(self.client.get('/tasks/report/?period=yearly').status_code, 400)

	def test_send_reminder_email(self):
		task = Task.objects.create(user=self.user, title='Pay rent')
		res = self.client.post(f'/tasks/{task.id}/send-reminder/')
		self.assertEqual(res.status_code, 200)
		self.assertEqual(len(mail.outbox), 1)
		self.assertIn('Pay rent', mail.outbox[0].subject)
