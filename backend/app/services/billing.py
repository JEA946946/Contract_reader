"""One place to build a Claude client, and one switch that stops all of them.

The Reader emptied an API account once. The cause was not the key — it was that
the mail poller ran extraction on every message that arrived, unattended, every
few minutes. Fetching mail is free; reading documents with a model is not, and
nobody was watching.

So the guard is on *unattended* work, not on spending:

- ``app.services.email_poller`` stores what it fetches and starts nothing. A
  person presses Extract on the documents they actually want read.
- ``ai_enabled`` / ``READER_AI_ENABLED=0`` stops every call into Claude at once,
  through whichever route — the API client here, or the subscription CLI in
  ``claude_sdk``. One switch, both paths, for when something is running away.

Building the client in one place is what makes the second bullet possible. Five
files used to construct their own, so there was no single point to stop.
"""

from __future__ import annotations

import os


class AiDisabled(RuntimeError):
    """Raised when AI work is switched off."""


class NoApiKey(RuntimeError):
    """Raised when a paid call is wanted but no key is configured."""


def ai_enabled() -> bool:
    """The kill switch, environment first so it can be thrown without a deploy."""
    env = os.getenv("READER_AI_ENABLED")
    if env is not None:
        return env in ("1", "true", "True")

    try:
        from app.config import settings
    except Exception:  # pragma: no cover - config should always import
        return True
    return bool(getattr(settings, "ai_enabled", True))


def check_ai_enabled() -> None:
    if not ai_enabled():
        raise AiDisabled(
            "AI is switched off. Set READER_AI_ENABLED=1 (or ai_enabled) to turn "
            "it back on."
        )


def anthropic_client():
    """An Anthropic client, unless AI is switched off or no key is configured."""
    check_ai_enabled()

    from app.config import settings

    key = settings.anthropic_api_key
    if not key or key == "your-api-key-here":
        raise NoApiKey(
            "No Anthropic API key configured. Set ANTHROPIC_API_KEY in the "
            "environment."
        )

    import anthropic

    return anthropic.Anthropic(api_key=key)
