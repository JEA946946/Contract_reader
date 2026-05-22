"""Wrapper around claude-agent-sdk for subscription-billed AI calls.

Authentication is handled via ~/.claude/.credentials.json which contains
both an access token and a refresh token. The CLI reads this file directly.
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
import time

logger = logging.getLogger(__name__)

# Minimum remaining validity (5 minutes) before we warn about expiry
_TOKEN_EXPIRY_BUFFER_MS = 5 * 60 * 1000


def _check_credentials() -> None:
    """Check if the credentials file exists and the token hasn't expired.

    Raises RuntimeError with a clear message if credentials are missing or expired.
    """
    creds_path = os.path.expanduser("~/.claude/.credentials.json")
    if not os.path.exists(creds_path):
        raise RuntimeError(
            "Claude SDK credentials not found at ~/.claude/.credentials.json. "
            "Run sync-claude-credentials.sh from the local machine to deploy credentials."
        )

    try:
        with open(creds_path) as f:
            creds = json.load(f)
        oauth = creds.get("claudeAiOauth", {})
        expires_at = oauth.get("expiresAt", 0)
        now_ms = int(time.time() * 1000)

        if now_ms > expires_at - _TOKEN_EXPIRY_BUFFER_MS:
            hours_ago = (now_ms - expires_at) / 3600000
            raise RuntimeError(
                f"Claude SDK access token expired {hours_ago:.1f} hours ago. "
                "Run sync-claude-credentials.sh from the local machine to refresh."
            )
    except (json.JSONDecodeError, KeyError) as exc:
        raise RuntimeError(f"Invalid credentials file: {exc}") from exc


def call_claude_sdk(prompt: str, system_prompt: str = "") -> str:
    """Send a prompt to Claude via the Agent SDK using subscription billing.

    This is a synchronous wrapper around the async SDK ``query()`` function.
    It temporarily removes ``ANTHROPIC_API_KEY`` and ``CLAUDE_CODE_OAUTH_TOKEN``
    from the environment so the CLI reads credentials from
    ``~/.claude/.credentials.json``.
    """
    # Check credentials before spawning the CLI subprocess
    _check_credentials()

    from claude_agent_sdk import query, ClaudeAgentOptions, AssistantMessage, TextBlock

    async def _run() -> str:
        # Remove both keys so the CLI falls back to .credentials.json
        saved_api_key = os.environ.pop("ANTHROPIC_API_KEY", None)
        saved_oauth = os.environ.pop("CLAUDE_CODE_OAUTH_TOKEN", None)

        saved_home = os.environ.get("HOME")
        if not saved_home or not os.path.isdir(saved_home):
            fallback_home = "/tmp/claude_home"
            os.makedirs(fallback_home, exist_ok=True)
            os.environ["HOME"] = fallback_home

        try:
            options = ClaudeAgentOptions(
                system_prompt=system_prompt or None,
                max_turns=1,
                allowed_tools=[],
                permission_mode="bypassPermissions",
            )

            parts: list[str] = []
            async for message in query(prompt=prompt, options=options):
                if isinstance(message, AssistantMessage):
                    for block in message.content:
                        if isinstance(block, TextBlock):
                            parts.append(block.text)

            return "".join(parts)
        finally:
            if saved_api_key:
                os.environ["ANTHROPIC_API_KEY"] = saved_api_key
            if saved_oauth:
                os.environ["CLAUDE_CODE_OAUTH_TOKEN"] = saved_oauth
            if saved_home:
                os.environ["HOME"] = saved_home

    # Use asyncio.run() — safe in background threads (parse_document_background)
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        loop = None

    if loop and loop.is_running():
        # Already inside an async context — run in a new thread
        import concurrent.futures
        with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
            return pool.submit(asyncio.run, _run()).result()
    else:
        return asyncio.run(_run())
