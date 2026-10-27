"""LLM providers for the assistant: Gemini first, Groq as automatic fallback.

Each provider has a pool of API keys and models. A call walks model-by-model (best model first),
and for each model key-by-key, skipping any key that recently hit its limit, until one answers.

The conversation is kept in a provider-neutral form so a request can switch provider part-way
(e.g. Gemini runs a tool, then runs out of quota, and Groq writes the final answer) without
re-running tools:

    {'role': 'user', 'text': str}
    {'role': 'assistant', 'text': str, 'calls': [{'id', 'name', 'args'}], 'gemini': <raw content> | None}
    {'role': 'tool', 'results': [{'id', 'name', 'result': dict, 'is_error': bool}]}
"""
import itertools
import json
import re
import threading
import time

import requests
from django.conf import settings

from .tools import TOOL_DEFINITIONS

GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent'
GROQ_CHAT_URL = 'https://api.groq.com/openai/v1/chat/completions'
GROQ_STT_URL = 'https://api.groq.com/openai/v1/audio/transcriptions'
REQUEST_TIMEOUT = 45
DEFAULT_COOLDOWN = 60       # seconds to rest a key/model after a 429 that gave no retry hint
MAX_COOLDOWN = 3600         # re-check an exhausted key at least hourly
INVALID_KEY_COOLDOWN = 3600

_call_ids = itertools.count(1)
_cooldowns = {}             # (provider, key, model) -> time.monotonic() deadline
_cooldown_lock = threading.Lock()


class LLMUnavailable(Exception):
    def __init__(self, detail, status=502):
        super().__init__(detail)
        self.detail, self.status = detail, status


def reset_cooldowns():
    with _cooldown_lock:
        _cooldowns.clear()


def _blocked(provider, key, model):
    with _cooldown_lock:
        return _cooldowns.get((provider, key, model), 0) > time.monotonic()


def _block(provider, key, model, seconds):
    with _cooldown_lock:
        _cooldowns[(provider, key, model)] = time.monotonic() + min(seconds, MAX_COOLDOWN)


def _retry_seconds(response):
    """How long the provider asks us to wait after a 429 (Retry-After header or Google's retryDelay)."""
    try:
        return float(response.headers.get('retry-after'))
    except (AttributeError, TypeError, ValueError):
        pass
    match = re.search(r'"retryDelay":\s*"(\d+(?:\.\d+)?)s"', getattr(response, 'text', '') or '')
    return float(match.group(1)) if match else DEFAULT_COOLDOWN


def _classify(response):
    """Failure -> (cooldown seconds, LLMUnavailable)."""
    if response.status_code == 429:
        return _retry_seconds(response), LLMUnavailable('The assistant has reached its usage limit. Try again later.', 429)
    if response.status_code in (400, 401, 403) and re.search(r'api[ _-]?key|invalid_api_key', response.text or '', re.I):
        return INVALID_KEY_COOLDOWN, LLMUnavailable('The assistant API key is invalid.', 503)
    return 30, LLMUnavailable('The assistant is unavailable right now.', 502)


def _post_with_pool(provider, keys, models, make_request):
    """Try models x keys until one succeeds. `make_request(key, model)` returns a requests.Response."""
    last = None
    for model in models:
        for key in keys:
            if _blocked(provider, key, model):
                last = last or LLMUnavailable('The assistant has reached its usage limit. Try again later.', 429)
                continue
            try:
                response = make_request(key, model)
            except requests.RequestException:
                last = LLMUnavailable('The assistant is unavailable right now.', 502)
                continue
            if response.ok:
                return response, model
            cooldown, last = _classify(response)
            _block(provider, key, model, cooldown)
    raise last or LLMUnavailable(f'{provider} is not configured.', 503)


# ---------------------------------------------------------------- Gemini
def gemini_tools():
    declarations = []
    for tool in TOOL_DEFINITIONS:
        declaration = {'name': tool['name'], 'description': tool['description']}
        schema = tool['input_schema']
        if schema['properties']:
            # Gemini's schema subset has no `additionalProperties`.
            declaration['parameters'] = {
                'type': 'object', 'properties': schema['properties'], 'required': schema['required'],
            }
        declarations.append(declaration)
    return [{'functionDeclarations': declarations}]


def _gemini_contents(turns):
    contents = []
    for turn in turns:
        if turn['role'] == 'user':
            contents.append({'role': 'user', 'parts': [{'text': turn['text']}]})
        elif turn['role'] == 'assistant':
            if turn.get('gemini'):
                # Echo Gemini's own parts back unchanged (it needs its thought signatures).
                contents.append(turn['gemini'])
                continue
            parts = [{'text': turn['text']}] if turn['text'] else []
            parts += [{'functionCall': {'id': c['id'], 'name': c['name'], 'args': c['args']}} for c in turn['calls']]
            contents.append({'role': 'model', 'parts': parts})
        else:
            contents.append({'role': 'user', 'parts': [{'functionResponse': {
                'id': r['id'], 'name': r['name'],
                'response': {'error': r['result']['error']} if r['is_error'] else {'result': r['result']},
            }} for r in turn['results']]})
    return contents


def gemini_post(contents, system=None, models=None, tools=True, extra=None):
    """POST to Gemini across its model/key pool. Returns (json, model_used)."""
    body = {'contents': contents, **(extra or {})}
    if system:
        body['systemInstruction'] = {'parts': [{'text': system}]}
    if tools:
        body['tools'] = gemini_tools()

    def make_request(key, model):
        return requests.post(GEMINI_URL.format(model=model), headers={'x-goog-api-key': key},
                             json=body, timeout=REQUEST_TIMEOUT)

    response, model = _post_with_pool('gemini', settings.GEMINI_API_KEYS, models or settings.ASSISTANT_MODELS, make_request)
    return response.json(), model


def _gemini_step(turns, system, state):
    data, used = gemini_post(_gemini_contents(turns), system, models=state.get('gemini_models'))
    state['gemini_models'] = [used]  # tool-call state is model-specific: stay on this model
    candidates = data.get('candidates') or []
    content = (candidates[0].get('content') if candidates else None) or {}
    parts = content.get('parts') or []
    calls = [{'id': p['functionCall'].get('id') or f'call_{next(_call_ids)}',
              'name': p['functionCall']['name'], 'args': p['functionCall'].get('args') or {}}
             for p in parts if 'functionCall' in p]
    text = ''.join(p.get('text', '') for p in parts if not p.get('thought')).strip()
    return {'role': 'assistant', 'text': text, 'calls': calls, 'gemini': content if calls else None}


# ---------------------------------------------------------------- Groq (OpenAI-compatible)
def _groq_tools():
    return [{'type': 'function', 'function': {
        'name': t['name'], 'description': t['description'], 'parameters': t['input_schema'],
    }} for t in TOOL_DEFINITIONS]


def _groq_messages(turns, system):
    messages = [{'role': 'system', 'content': system}]
    for turn in turns:
        if turn['role'] == 'user':
            messages.append({'role': 'user', 'content': turn['text']})
        elif turn['role'] == 'assistant':
            message = {'role': 'assistant', 'content': turn['text'] or None}
            if turn['calls']:
                message['tool_calls'] = [{
                    'id': c['id'], 'type': 'function',
                    'function': {'name': c['name'], 'arguments': json.dumps(c['args'])},
                } for c in turn['calls']]
            messages.append(message)
        else:
            for r in turn['results']:
                messages.append({'role': 'tool', 'tool_call_id': r['id'], 'content': json.dumps(r['result'], default=str)})
    return messages


def _groq_step(turns, system, state):
    body = {'messages': _groq_messages(turns, system), 'tools': _groq_tools(), 'reasoning_effort': 'low'}

    def make_request(key, model):
        return requests.post(GROQ_CHAT_URL, headers={'Authorization': f'Bearer {key}'},
                             json={**body, 'model': model}, timeout=REQUEST_TIMEOUT)

    response, model = _post_with_pool('groq', settings.GROQ_API_KEYS, state.get('groq_models') or settings.GROQ_MODELS,
                                      make_request)
    state['groq_models'] = [model]
    message = (response.json().get('choices') or [{}])[0].get('message') or {}
    calls = []
    for c in message.get('tool_calls') or []:
        try:
            args = json.loads(c['function'].get('arguments') or '{}')
        except json.JSONDecodeError:
            args = {}
        calls.append({'id': c.get('id') or f'call_{next(_call_ids)}', 'name': c['function']['name'], 'args': args})
    return {'role': 'assistant', 'text': (message.get('content') or '').strip(), 'calls': calls, 'gemini': None}


PROVIDERS = [('gemini', _gemini_step), ('groq', _groq_step)]


def generate(turns, system, state):
    """Next assistant turn. Tries Gemini, then Groq; once a provider fails it is skipped for the
    rest of this request (state['start']). Returns the turn with its provider name added."""
    last = None
    for index in range(state.get('start', 0), len(PROVIDERS)):
        name, step = PROVIDERS[index]
        try:
            turn = step(turns, system, state)
        except LLMUnavailable as exc:
            if exc.status != 503 or 'not configured' not in exc.detail:
                last = exc
            state['start'] = index + 1
            continue
        turn['provider'] = name
        return turn
    raise last or LLMUnavailable('The assistant is not configured.', 503)


# ---------------------------------------------------------------- speech to text fallback
def groq_transcribe(audio_bytes, mime_type):
    """Whisper transcription via Groq, used when Gemini cannot transcribe."""
    ext = {'audio/wav': 'wav', 'audio/mp3': 'mp3', 'audio/mpeg': 'mp3', 'audio/ogg': 'ogg', 'audio/flac': 'flac',
           'audio/webm': 'webm', 'audio/mp4': 'm4a', 'audio/x-m4a': 'm4a'}.get(mime_type, 'm4a')  # AAC (ADTS) as m4a

    def make_request(key, model):
        return requests.post(
            GROQ_STT_URL, headers={'Authorization': f'Bearer {key}'},
            files={'file': (f'voice.{ext}', audio_bytes, mime_type)},
            data={'model': model, 'response_format': 'json', 'temperature': 0},
            timeout=REQUEST_TIMEOUT,
        )

    response, _ = _post_with_pool('groq', settings.GROQ_API_KEYS, [settings.GROQ_STT_MODEL], make_request)
    return (response.json().get('text') or '').strip()
