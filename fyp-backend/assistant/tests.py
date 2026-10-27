import json
from decimal import Decimal
from unittest import mock

from django.contrib.auth.models import User
from django.test import TestCase as DjangoTestCase
from django.test import override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from habits.models import Habit
from medications.models import Medication, MedicationLog
from tasks.models import Task

from . import llm
from .tools import ToolContext, run_tool


class TestCase(DjangoTestCase):
    def _pre_setup(self):
        super()._pre_setup()
        llm.reset_cooldowns()  # key cooldowns are process-wide; don't let one test affect the next


class ToolIsolationTests(TestCase):
    def setUp(self):
        self.alice = User.objects.create_user('alice@x.com')
        self.bob = User.objects.create_user('bob@x.com')
        self.a, self.b = ToolContext(self.alice), ToolContext(self.bob)

    def test_task_created_for_caller_only(self):
        result, err = run_tool(self.a, 'create_task', {'title': 'Buy milk', 'deadline': '2026-11-01', 'priority': 'high'})
        self.assertFalse(err)
        self.assertEqual(Task.objects.get().user, self.alice)
        self.assertEqual(run_tool(self.b, 'list_tasks', {})[0]['tasks'], [])

    def test_cannot_touch_other_users_task(self):
        run_tool(self.a, 'create_task', {'title': 'Secret'})
        result, err = run_tool(self.b, 'update_task', {'task': 'Secret', 'status': 'done'})
        self.assertTrue(err)
        self.assertEqual(Task.objects.get().status, 'pending')
        _, err = run_tool(self.b, 'delete_task', {'task': str(Task.objects.get().id)})
        self.assertTrue(err)
        self.assertEqual(Task.objects.count(), 1)

    def test_complete_task_by_title(self):
        run_tool(self.a, 'create_task', {'title': 'Write report'})
        run_tool(self.a, 'update_task', {'task': 'report', 'status': 'done'})
        self.assertEqual(Task.objects.get().status, 'done')

    def test_medications_today_scoped_and_logged(self):
        med = Medication.objects.create(user=self.alice, name='Metformin', dosage='500mg', schedule_times=['08:00'])
        Medication.objects.create(user=self.bob, name='Bob pill', dosage='1', schedule_times=['09:00'])
        run_tool(self.a, 'log_medication', {'medication': 'metformin'})
        result, _ = run_tool(self.a, 'get_medications_today', {})
        self.assertEqual([m['name'] for m in result['medications']], ['Metformin'])
        self.assertEqual(result['medications'][0]['logged_today'][0]['status'], 'taken')
        self.assertEqual(MedicationLog.objects.filter(medication=med).count(), 1)
        _, err = run_tool(self.b, 'log_medication', {'medication': 'Metformin'})
        self.assertTrue(err)

    def test_habit_complete_and_isolation(self):
        run_tool(self.a, 'create_habit', {'name': 'Read'})
        result, err = run_tool(self.a, 'complete_habit', {'habit': 'read'})
        self.assertFalse(err)
        self.assertEqual(result['completed']['streak'], 1)
        self.assertTrue(run_tool(self.b, 'complete_habit', {'habit': 'read'})[1])
        self.assertEqual(Habit.objects.count(), 1)

    def test_budget_and_fitness(self):
        run_tool(self.a, 'add_transaction', {'type': 'expense', 'amount': 250, 'category': 'Food'})
        summary, _ = run_tool(self.a, 'get_budget_summary', {})
        self.assertEqual(Decimal(summary['expenses']), Decimal('250'))
        self.assertEqual(run_tool(self.b, 'get_budget_summary', {})[0]['expenses'], '0')
        run_tool(self.a, 'log_water', {'amount_ml': 300})
        run_tool(self.a, 'log_water', {'amount_ml': 200})
        self.assertEqual(run_tool(self.a, 'get_fitness_today', {})[0]['water_ml'], 500)
        self.assertEqual(run_tool(self.b, 'get_fitness_today', {})[0]['water_ml'], 0)

    def test_bad_input_is_an_error_not_a_crash(self):
        self.assertTrue(run_tool(self.a, 'create_task', {'title': 'x', 'deadline': 'tomorrow'})[1])
        self.assertTrue(run_tool(self.a, 'add_transaction', {'type': 'expense', 'amount': -5})[1])
        self.assertTrue(run_tool(self.a, 'nope', {})[1])
        self.assertTrue(run_tool(self.a, 'create_task', {'wrong': 1})[1])


def _reply(*parts):
    return mock.Mock(ok=True, status_code=200, json=lambda: {'candidates': [{'content': {'role': 'model', 'parts': list(parts)}}]})


@override_settings(GEMINI_API_KEYS=['test'], GROQ_API_KEYS=[], ASSISTANT_MODELS=['m'])
class ChatViewTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user('carol@x.com')
        self.client = APIClient()
        self.client.force_authenticate(self.user)

    def test_requires_auth(self):
        self.assertEqual(APIClient().post('/api/assistant/chat/', {}, format='json').status_code, 401)

    def test_tool_loop_creates_task_and_reports_change(self):
        call = {'functionCall': {'name': 'create_task', 'args': {'title': 'Call mom'}}}
        with mock.patch('assistant.llm.requests.post') as post:
            post.side_effect = [_reply(call), _reply({'text': 'Added "Call mom".'})]
            res = self.client.post('/api/assistant/chat/',
                                   {'messages': [{'role': 'user', 'content': 'add task call mom'}]}, format='json')
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data['reply'], 'Added "Call mom".')
        self.assertEqual(res.data['changed'], ['tasks'])
        self.assertEqual(Task.objects.get().user, self.user)

    def test_rejects_when_last_message_not_user(self):
        res = self.client.post('/api/assistant/chat/',
                               {'messages': [{'role': 'assistant', 'content': 'hi'}]}, format='json')
        self.assertEqual(res.status_code, 400)


@override_settings(GEMINI_API_KEYS=['test'], GROQ_API_KEYS=[], ASSISTANT_MODELS=['m'], ASSISTANT_TTS_MODEL='t')
class VoiceViewTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.client.force_authenticate(User.objects.create_user('dave@x.com'))

    def test_transcribe_returns_text(self):
        with mock.patch('assistant.llm.requests.post') as post:
            post.return_value = _reply({'text': 'urdu text'})
            res = self.client.post('/api/assistant/transcribe/', {'audio': 'QUJD', 'mime_type': 'audio/aac'}, format='json')
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data['text'], 'urdu text')
        sent = post.call_args.kwargs['json']
        self.assertNotIn('tools', sent)
        self.assertEqual(sent['contents'][0]['parts'][0]['inlineData']['mimeType'], 'audio/aac')

    def test_transcribe_rejects_bad_input_and_silence(self):
        bad = self.client.post('/api/assistant/transcribe/', {'audio': 'QUJD', 'mime_type': 'text/html'}, format='json')
        self.assertEqual(bad.status_code, 400)
        with mock.patch('assistant.llm.requests.post') as post:
            post.return_value = _reply({'text': '[no speech]'})
            res = self.client.post('/api/assistant/transcribe/', {'audio': 'QUJD', 'mime_type': 'audio/aac'}, format='json')
        self.assertEqual(res.status_code, 422)

    def test_speak_returns_audio(self):
        with mock.patch('assistant.llm.requests.post') as post:
            post.return_value = _reply({'inlineData': {'mimeType': 'audio/wav', 'data': 'UklGRg=='}})
            res = self.client.post('/api/assistant/speak/', {'text': 'Hello'}, format='json')
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data, {'audio': 'UklGRg==', 'mime_type': 'audio/wav'})
        self.assertIn('/models/t:generateContent', post.call_args.args[0])

    def test_voice_requires_auth(self):
        self.assertEqual(APIClient().post('/api/assistant/speak/', {}, format='json').status_code, 401)


@override_settings(GEMINI_API_KEYS=['test'], GROQ_API_KEYS=[], ASSISTANT_MODELS=['a', 'b'])
class ModelFallbackTests(TestCase):
    def test_falls_back_to_next_model_on_quota_error(self):
        client = APIClient()
        client.force_authenticate(User.objects.create_user('erin@x.com'))
        quota = mock.Mock(ok=False, status_code=429, text='quota')
        with mock.patch('assistant.llm.requests.post') as post:
            post.side_effect = [quota, _reply({'text': 'hi'})]
            res = client.post('/api/assistant/chat/', {'messages': [{'role': 'user', 'content': 'hello'}]}, format='json')
        self.assertEqual(res.status_code, 200)
        self.assertEqual([c.args[0].split('/models/')[1].split(':')[0] for c in post.call_args_list], ['a', 'b'])

    def test_all_models_out_of_quota(self):
        client = APIClient()
        client.force_authenticate(User.objects.create_user('fay@x.com'))
        with mock.patch('assistant.llm.requests.post') as post:
            post.return_value = mock.Mock(ok=False, status_code=429, text='quota')
            res = client.post('/api/assistant/chat/', {'messages': [{'role': 'user', 'content': 'hello'}]}, format='json')
        self.assertEqual(res.status_code, 429)


def _groq_reply(content=None, calls=None):
    message = {'content': content}
    if calls:
        message['tool_calls'] = [{'id': f'g{i}', 'type': 'function',
                                  'function': {'name': n, 'arguments': json.dumps(a)}} for i, (n, a) in enumerate(calls)]
    return mock.Mock(ok=True, status_code=200, json=lambda: {'choices': [{'message': message}]})


def _fail(status=429):
    return mock.Mock(ok=False, status_code=status, text='boom')


@override_settings(GEMINI_API_KEYS=['g'], GROQ_API_KEYS=['q'], ASSISTANT_MODELS=['gm'], GROQ_MODELS=['qm'])
class GroqFallbackTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user('gina@x.com')
        self.client = APIClient()
        self.client.force_authenticate(self.user)

    def _chat(self, text='add task call mom'):
        return self.client.post('/api/assistant/chat/', {'messages': [{'role': 'user', 'content': text}]}, format='json')

    def _router(self, gemini, groq):
        gemini, groq = iter(gemini), iter(groq)

        def post(url, **kwargs):
            return next(groq if 'groq.com' in url else gemini)
        return post

    def test_groq_answers_when_gemini_is_down(self):
        with mock.patch('assistant.llm.requests.post') as post:
            post.side_effect = self._router(
                [_fail(429)],
                [_groq_reply(calls=[('create_task', {'title': 'Call mom'})]), _groq_reply('Added.')])
            res = self._chat()
        self.assertEqual(res.status_code, 200)
        self.assertEqual((res.data['reply'], res.data['provider']), ('Added.', 'groq'))
        self.assertEqual(Task.objects.filter(user=self.user, title='Call mom').count(), 1)

    def test_switches_mid_request_without_repeating_the_tool(self):
        call = {'functionCall': {'id': 'c1', 'name': 'create_task', 'args': {'title': 'Pay rent'}}}
        with mock.patch('assistant.llm.requests.post') as post:
            post.side_effect = self._router([_reply(call), _fail(429)], [_groq_reply('Done, rent task added.')])
            res = self._chat('add task pay rent')
        self.assertEqual((res.data['reply'], res.data['provider']), ('Done, rent task added.', 'groq'))
        self.assertEqual(Task.objects.filter(title='Pay rent').count(), 1)
        sent = post.call_args.kwargs['json']['messages']
        self.assertEqual([m['role'] for m in sent], ['system', 'user', 'assistant', 'tool'])
        self.assertEqual(sent[2]['tool_calls'][0]['function']['name'], 'create_task')

    def test_gemini_is_used_first_when_healthy(self):
        with mock.patch('assistant.llm.requests.post') as post:
            post.side_effect = self._router([_reply({'text': 'Hi from Gemini'})], [])
            res = self._chat('hello')
        self.assertEqual((res.data['reply'], res.data['provider']), ('Hi from Gemini', 'gemini'))

    def test_both_down_returns_error(self):
        with mock.patch('assistant.llm.requests.post') as post:
            post.side_effect = self._router([_fail(500)], [_fail(429), _fail(429)])
            res = self._chat('hello')
        self.assertEqual(res.status_code, 429)

    def test_transcribe_falls_back_to_groq_whisper(self):
        with mock.patch('assistant.llm.requests.post') as post:
            post.side_effect = self._router([_fail(429)], [mock.Mock(ok=True, json=lambda: {'text': 'hello there'})])
            res = self.client.post('/api/assistant/transcribe/', {'audio': 'QUJD', 'mime_type': 'audio/aac'}, format='json')
        self.assertEqual((res.status_code, res.data['text']), (200, 'hello there'))


@override_settings(GEMINI_API_KEYS=['k1', 'k2', 'k3'], GROQ_API_KEYS=['q1', 'q2'],
                   ASSISTANT_MODELS=['gm'], GROQ_MODELS=['qm'])
class KeyRotationTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.client.force_authenticate(User.objects.create_user('kim@x.com'))

    def _chat(self):
        return self.client.post('/api/assistant/chat/', {'messages': [{'role': 'user', 'content': 'hello'}]}, format='json')

    @staticmethod
    def _used(post):
        return [(c.args[0].split('/')[2].split('.')[0], c.kwargs['headers'].get('x-goog-api-key') or c.kwargs['headers']['Authorization'][7:])
                for c in post.call_args_list]

    def test_moves_through_every_key_then_next_provider(self):
        limited = mock.Mock(ok=False, status_code=429, text='quota', headers={})
        with mock.patch('assistant.llm.requests.post') as post:
            post.side_effect = [limited, limited, limited, limited, _groq_reply('from q2')]
            res = self._chat()
        self.assertEqual((res.data['reply'], res.data['provider']), ('from q2', 'groq'))
        self.assertEqual([k for _, k in self._used(post)], ['k1', 'k2', 'k3', 'q1', 'q2'])

    def test_exhausted_key_is_skipped_on_the_next_request(self):
        limited = mock.Mock(ok=False, status_code=429, text='quota', headers={'retry-after': '120'})
        with mock.patch('assistant.llm.requests.post') as post:
            post.side_effect = [limited, _reply({'text': 'one'}), _reply({'text': 'two'})]
            self._chat()
            self._chat()
        self.assertEqual([k for _, k in self._used(post)], ['k1', 'k2', 'k2'])

    def test_invalid_key_is_skipped_not_fatal(self):
        bad = mock.Mock(ok=False, status_code=400, text='API key not valid', headers={})
        with mock.patch('assistant.llm.requests.post') as post:
            post.side_effect = [bad, _reply({'text': 'ok'})]
            res = self._chat()
        self.assertEqual(res.data['reply'], 'ok')

    def test_every_key_exhausted_reports_limit(self):
        limited = mock.Mock(ok=False, status_code=429, text='quota', headers={})
        with mock.patch('assistant.llm.requests.post', return_value=limited) as post:
            res = self._chat()
        self.assertEqual(res.status_code, 429)
        self.assertEqual(post.call_count, 5)


class SafetyTests(TestCase):
    def test_scrubs_secrets_and_credentials(self):
        from .safety import scrub, scrub_text
        cases = [
            'token eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abcdefghijk123',
            'key gsk_' + 'a' * 40,
            'key AIza' + 'b' * 35,
            'postgres://admin:hunter2pass@db.example.com:5432/app',
            'my wifi password is hunter2',
            'pin: 4321',
            'card 4111 1111 1111 1111',
        ]
        for text in cases:
            out = scrub_text(text)
            self.assertIn('[hidden]', out, text)
            for leaked in ('hunter2', '4321', '4111 1111', 'gsk_a', 'AIzab', 'eyJhbG'):
                self.assertNotIn(leaked, out)
        self.assertEqual(scrub({'a': ['password=abc']}), {'a': ['password=[hidden]']})

    def test_leaves_normal_text_alone(self):
        from .safety import scrub_text
        for text in ('Buy milk at 5pm', 'Spent 12500 on rent', 'Metformin 500mg', 'Call 03001234567 tomorrow'):
            self.assertEqual(scrub_text(text), text)

    @override_settings(GEMINI_API_KEYS=['my-very-secret-gemini-key'])
    def test_configured_keys_never_leave_even_if_model_echoes_them(self):
        from .safety import scrub_text
        self.assertEqual(scrub_text('the key is my-very-secret-gemini-key ok'), 'the key is [hidden] ok')

    def test_secrets_in_notes_are_hidden_from_the_model_and_the_reply(self):
        user = User.objects.create_user('sam@x.com')
        Task.objects.create(user=user, title='Wifi', description='router password: hunter2')
        client = APIClient()
        client.force_authenticate(user)
        call = {'functionCall': {'id': 'c', 'name': 'list_tasks', 'args': {}}}
        with override_settings(GEMINI_API_KEYS=['k'], GROQ_API_KEYS=[], ASSISTANT_MODELS=['m']), \
                mock.patch('assistant.llm.requests.post') as post:
            post.side_effect = [_reply(call), _reply({'text': 'Your wifi password is hunter2'})]
            res = client.post('/api/assistant/chat/', {'messages': [{'role': 'user', 'content': 'my tasks'}]}, format='json')
        sent_to_model = json.dumps(post.call_args_list[1].kwargs['json'])
        self.assertNotIn('hunter2', sent_to_model)
        self.assertNotIn('hunter2', res.data['reply'])
