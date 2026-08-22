"""AI must not run unattended, and one switch must stop all of it.

Run it anywhere:  python3 tests/test_billing_gate.py

The account was emptied because the mail poller ran extraction on everything
that arrived, every few minutes, with nobody watching. The key was never the
problem — unattended bulk work was. These check the guards against that.

Deliberately dependency-free. The project has no test framework and no pytest in
requirements, and a guard that only runs once someone installs something is a
guard that does not run.
"""

from __future__ import annotations

import os
import re
import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parent.parent
APP = BACKEND / "app"
sys.path.insert(0, str(BACKEND))

_failed = 0
_skipped = 0


def check(name: str, ok: bool, why: str = "") -> None:
    global _failed
    if ok:
        print(f"PASS  {name}")
    else:
        _failed += 1
        print(f"FAIL  {name}" + (f"\n        {why}" if why else ""))


def skip(name: str, why: str) -> None:
    global _skipped
    _skipped += 1
    print(f"SKIP  {name}\n        {why}")


# ── 1. One switch stops every route into Claude ─────────────────────────────

def test_kill_switch_covers_both_routes() -> None:
    """The API client and the subscription CLI must both stop on one switch.

    The account was emptied by unattended work, not by the key existing, so the
    guard is a switch that reaches everything rather than a refusal to spend.
    Two routes reach a model — billing.anthropic_client() and claude_sdk — and a
    switch that only covers one is not a switch.
    """
    from app.services import billing

    os.environ["READER_AI_ENABLED"] = "0"
    try:
        try:
            billing.anthropic_client()
            check("the switch stops the API route", False, "a client was built while AI is off")
        except billing.AiDisabled:
            check("the switch stops the API route", True)
        except Exception as exc:  # noqa: BLE001
            check("the switch stops the API route", False,
                  f"stopped with {type(exc).__name__}, not AiDisabled: {exc}")

        from app.services import claude_sdk
        try:
            claude_sdk._invoke("hello", lambda Options: None)
            check("the switch stops the subscription route", False, "_invoke ran while AI is off")
        except billing.AiDisabled:
            check("the switch stops the subscription route", True)
        except Exception as exc:  # noqa: BLE001
            check("the switch stops the subscription route", False,
                  f"stopped with {type(exc).__name__}, not AiDisabled: {exc}")
    finally:
        os.environ.pop("READER_AI_ENABLED", None)

    # With AI on, the only thing that should stop a paid call is a missing key.
    os.environ["READER_AI_ENABLED"] = "1"
    try:
        billing.anthropic_client()
        detail = "built"
    except billing.AiDisabled:
        detail = "still blocked by the switch"
    except Exception as exc:  # noqa: BLE001
        detail = f"{type(exc).__name__}"
    finally:
        os.environ.pop("READER_AI_ENABLED", None)
    check("with AI on, a paid client is allowed",
          detail in ("built", "NoApiKey", "ModuleNotFoundError"),
          f"a key you have paid for is still refused: {detail}")


# ── 2. Nobody goes around the gate ──────────────────────────────────────────

def test_no_client_elsewhere() -> None:
    """The next parser someone writes must not be able to spend by copying a line.

    This is the check that matters most. The gate is easy to add and easy to
    bypass: `import anthropic; anthropic.Anthropic(api_key=...)` is two lines and
    was, until now, copied into five files.
    """
    pattern = re.compile(r"anthropic\.Anthropic\s*\(")
    offenders = []
    for path in sorted(APP.rglob("*.py")):
        if path.name == "billing.py":
            continue
        text = path.read_text(encoding="utf-8", errors="replace")
        for lineno, line in enumerate(text.splitlines(), 1):
            if line.strip().startswith("#"):
                continue
            if pattern.search(line):
                offenders.append(f"{path.relative_to(BACKEND)}:{lineno}")

    check("only billing.py builds an Anthropic client",
          not offenders,
          "these construct one directly and bypass the gate: " + ", ".join(offenders))


# ── 3. The vision parsers keep their two passes ─────────────────────────────

def test_two_passes_are_kept() -> None:
    """Merging pass 1 into pass 2 was tried, measured, and reverted.

    Three runs of each version on three documents. The merged version saved
    35-38% of the input tokens and lost rows: 6, 25, 6 where two passes returned
    25 every time, and 23, 23, 16 where two passes returned 23. Nine of nine
    two-pass runs were stable. Writing the analysis and the extraction into one
    reply makes the model stop early on documents with many lines.

    This guards the revert. The saving is real and will look tempting again.
    """
    for name in ("restaurant_ai_parser.py", "transportation_ai_parser.py"):
        src = (APP / "parsers" / name).read_text(encoding="utf-8")
        sends = src.count("pdf_block,")
        check(f"{name} keeps both document passes", sends == 2,
              f"the PDF is attached to {sends} call(s) — merging them lost rows when measured")

        # And the client still comes from billing, or the kill switch cannot reach it.
        check(f"{name} gets its client from billing",
              "from app.services.billing import anthropic_client" in src,
              "it builds its own client, which the switch cannot stop")


# ── 4. No second way into the model ─────────────────────────────────────────

def test_no_hidden_routes() -> None:
    from app.services import claude_sdk  # noqa: F401

    # It must be checked before the credential read, or an expired token would
    # mask the switch and give a misleading error.
    src = (APP / "services" / "claude_sdk.py").read_text(encoding="utf-8")
    check("the switch is asked before credentials are touched",
          src.index("_check_ai_enabled()") < src.index("_check_credentials()\n\n    from claude_agent_sdk"),
          "_check_credentials runs first, so an expired token hides the switch")

    # No second route into the model.
    strays = []
    for path in sorted(APP.rglob("*.py")):
        if path.name == "claude_sdk.py":
            continue
        for lineno, line in enumerate(path.read_text(encoding="utf-8", errors="replace").splitlines(), 1):
            if line.strip().startswith("#"):
                continue
            if "from claude_agent_sdk import" in line or "import claude_agent_sdk" in line:
                strays.append(f"{path.relative_to(BACKEND)}:{lineno}")
    check("only claude_sdk.py talks to the Agent SDK",
          not strays,
          "these bypass the kill switch: " + ", ".join(strays))


# ── 5. An unattended poll is bounded ────────────────────────────────────────

def test_poll_is_capped() -> None:
    src = (APP / "services" / "email_poller.py").read_text(encoding="utf-8")
    check("the poll processes at most a set number of emails per round",
          "poll_max_emails_per_run" in src and "email_ids[:cap]" in src,
          "the loop still walks every unseen email in one unattended run")

    # The real rule: fetching is free, extracting is not. Mail arrives and waits.
    #
    # Comments are stripped first. An earlier version of this searched the whole
    # file for "poll_auto_extract" and passed on the sentence explaining the
    # setting, while the code below it had been changed to ignore the setting
    # entirely — a check that reads prose is not a check.
    code = "\n".join(l for l in src.splitlines() if not l.strip().startswith("#"))

    check("polling parks documents rather than extracting them",
          "pending_extraction" in code,
          "no waiting status is set, so mail is still extracted on arrival")

    guard = "if not settings.poll_auto_extract:"
    call = "rows = parse_document("
    check("extraction from mail sits behind the setting",
          guard in code and call in code and code.index(guard) < code.index(call),
          "parse_document is reachable without passing the auto-extract check")

    cfg = (APP / "config.py").read_text(encoding="utf-8")
    check("the cap and the switch are configurable",
          "poll_max_emails_per_run" in cfg and "ai_enabled" in cfg,
          "settings are missing, so neither can be changed without a code edit")


if __name__ == "__main__":
    test_kill_switch_covers_both_routes()
    test_no_client_elsewhere()
    test_two_passes_are_kept()
    test_no_hidden_routes()
    test_poll_is_capped()
    print()
    if _failed:
        print(f"{_failed} failed.")
    else:
        print("AI runs only when asked, and one switch stops it."
              + (f" ({_skipped} skipped)" if _skipped else ""))
    sys.exit(1 if _failed else 0)
