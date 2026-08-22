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


def _check_ai_enabled() -> None:
    """The same switch the API path uses — defined once, in billing."""
    from app.services.billing import check_ai_enabled

    check_ai_enabled()


def _invoke(prompt: str, build_options) -> str:
    """Run one prompt through the Agent SDK on subscription billing.

    Shared by every public call below. ``build_options`` receives the
    ``ClaudeAgentOptions`` class and returns a configured instance, so callers
    can differ in tools and turns without each repeating the credential
    handling, the environment stripping and the event-loop dance.
    """
    _check_ai_enabled()

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
            options = build_options(ClaudeAgentOptions)

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


def call_claude_sdk(prompt: str, system_prompt: str = "") -> str:
    """Send a text prompt to Claude via the Agent SDK using subscription billing."""
    return _invoke(
        prompt,
        lambda Options: Options(
            system_prompt=system_prompt or None,
            max_turns=1,
            allowed_tools=[],
            permission_mode="bypassPermissions",
        ),
    )


def call_claude_sdk_with_file(
    prompt: str,
    file_path,
    system_prompt: str = "",
    max_turns: int = 6,
) -> str:
    """Same, but Claude opens the document itself instead of being sent it.

    The restaurant and transport parsers need Claude to *see* a PDF — a menu or a
    tariff table read as flat text loses the columns that give the numbers their
    meaning. Their way of doing that was to base64 the file into an API request,
    which is what spent the money.

    Handing the CLI the ``Read`` tool and the directory the file sits in gets the
    same document in front of the same model, billed to the subscription. Read
    handles PDFs directly, so no conversion happens on our side.

    Access is granted to one directory, not the filesystem: ``add_dirs`` and
    ``cwd`` are both the file's own folder, and ``Read`` is the only tool
    allowed. Several turns are needed — one to call the tool, one to answer, and
    slack for a multi-page document — where a text prompt needs exactly one.
    """
    from pathlib import Path

    path = Path(file_path).resolve()
    if not path.is_file():
        raise FileNotFoundError(f"Nothing to read at {path}")

    folder = str(path.parent)
    instruction = f"Read the file `{path.name}` in the current directory, then:\n\n{prompt}"

    return _invoke(
        instruction,
        lambda Options: Options(
            system_prompt=system_prompt or None,
            max_turns=max_turns,
            allowed_tools=["Read"],
            permission_mode="bypassPermissions",
            cwd=folder,
            add_dirs=[folder],
        ),
    )
