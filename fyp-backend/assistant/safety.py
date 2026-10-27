"""Keep credentials and secrets out of the assistant.

The model has no tool that can read accounts, tokens or settings, so this is a second layer: anything
that looks like a secret is masked in tool results (before the model sees them) and in replies
(before the user does), in case a user's own notes contain a password or the model echoes a key.
"""
import re

from django.conf import settings

MASK = '[hidden]'

_PATTERNS = [
    re.compile(r'eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}'),       # JWTs (Supabase tokens)
    re.compile(r'\bgsk_[A-Za-z0-9]{20,}'),                                            # Groq
    re.compile(r'\bAIza[0-9A-Za-z_-]{30,}'),                                          # Google API keys
    re.compile(r'\bAQ\.[A-Za-z0-9_-]{30,}'),                                          # Google AI Studio keys
    re.compile(r'\b(?:sk|pk|rk)[-_][A-Za-z0-9_-]{20,}'),                              # OpenAI/Stripe style
    re.compile(r'-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z ]*PRIVATE KEY-----|$)'),
    re.compile(r'\b[a-z][a-z0-9+.-]*://[^\s:@/]+:[^\s@/]+@[^\s]+'),                   # URLs with user:password@
]
# "password: hunter2", "my pin is 4321", "api key = abc" -> keep the label, hide the value
_LABELLED = re.compile(
    r'(?i)\b(pass(?:word|wd|code)?|pwd|pin|otp|cvv|cvc|secret|token|api[ _-]?key|private[ _-]?key)'
    r'(\s*(?:is|=|:|-)\s*)(\S+)'
)
_CARD = re.compile(r'\b(?:\d[ -]?){13,19}\b')


def _luhn(number):
    total = 0
    for i, ch in enumerate(reversed(number)):
        digit = int(ch)
        if i % 2:
            digit = digit * 2 - 9 if digit * 2 > 9 else digit * 2
        total += digit
    return total % 10 == 0


def _configured_secrets():
    values = [*getattr(settings, 'GEMINI_API_KEYS', []), *getattr(settings, 'GROQ_API_KEYS', []),
              settings.SECRET_KEY, getattr(settings, 'SUPABASE_JWT_SECRET', ''),
              getattr(settings, 'EMAIL_HOST_PASSWORD', '')]
    return [v for v in values if isinstance(v, str) and len(v) >= 8]


def scrub_text(text):
    if not isinstance(text, str) or not text:
        return text
    for secret in _configured_secrets():
        text = text.replace(secret, MASK)
    for pattern in _PATTERNS:
        text = pattern.sub(MASK, text)
    text = _LABELLED.sub(lambda m: f'{m.group(1)}{m.group(2)}{MASK}', text)

    def card(match):
        digits = re.sub(r'\D', '', match.group(0))
        return MASK if 13 <= len(digits) <= 19 and _luhn(digits) else match.group(0)

    return _CARD.sub(card, text)


def scrub(value):
    """Scrub every string inside a JSON-like structure."""
    if isinstance(value, str):
        return scrub_text(value)
    if isinstance(value, dict):
        return {k: scrub(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [scrub(v) for v in value]
    return value
