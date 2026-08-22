"""Read the documents pdfplumber cannot: scans.

There is no OCR anywhere else in the Reader. Measured on the 37 real supplier
documents in `Hoteller/`, ten of them yield nothing at all — nine are scanned
PDFs, where pdfplumber returns an empty text layer and the AI is handed an empty
string. Those contracts have never been readable.

This is a **fallback, not a replacement**. Measured three runs each on the same
documents through the production prompt:

    Kasbah Africa      pdfplumber 22, 22, 22 rows    xberg-based 10, 11, 10
    FIT Group Exe      pdfplumber 16, 20, 16         xberg-based 20, 16, 16
    ODYSSEE Park       pdfplumber (no text)          xberg-based 15, 15, 15

Where pdfplumber can read the document it is as good or better -- it places each
table inline, between [TABLE] markers, so the rows stay next to the prose that
says which room type and season they belong to. So it goes first, every time,
and this is only reached when it comes back with nothing.
"""

from __future__ import annotations

import logging
from pathlib import Path

logger = logging.getLogger(__name__)

# pdfplumber returned ten characters on a scanned contract and thousands on every
# readable one, so anything this thin is an empty text layer, not a short document.
MIN_USABLE_CHARS = 200


def looks_unreadable(text: str | None) -> bool:
    """Did the normal extraction come back with nothing worth sending?"""
    return len((text or "").strip()) < MIN_USABLE_CHARS


def ocr_text(path: Path) -> str:
    """OCR a document with xberg. Returns "" rather than raising.

    A failure here must leave the caller exactly where it was — with the empty
    text it already had — never break a parse that was going to fail anyway.

    xberg's entry point is a coroutine. Calling it without awaiting returns a
    coroutine object whose `.content` is simply absent, which reads as an empty
    result and looks like the document was unreadable. That mistake cost a whole
    measurement round, so the await is explicit here and in one place only.
    """
    try:
        import asyncio
        from urllib.parse import quote

        import xberg
        from xberg.options import ExtractInput

        async def _run() -> str:
            res = await xberg.extract(
                ExtractInput(kind="uri", uri="file://" + quote(str(Path(path).resolve())))
            )
            if not res.results:
                return ""
            return (res.results[0].content or "").strip()

        try:
            asyncio.get_running_loop()
        except RuntimeError:
            return asyncio.run(_run())

        # Already inside an event loop (the parsers run in background threads).
        import concurrent.futures

        with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
            return pool.submit(asyncio.run, _run()).result()

    except Exception as exc:  # noqa: BLE001
        logger.warning("OCR fallback failed for %s: %s", getattr(path, "name", path), exc)
        return ""


def with_fallback(path: Path, text: str | None) -> str:
    """The normal extraction, or an OCR of the same file when it came back empty."""
    if not looks_unreadable(text):
        return text or ""

    # Guarded here as well as inside ocr_text. The caller is already holding an
    # empty extraction; a rescue that raises would turn "no rows" into a crash,
    # and this is reached from a background thread where that is hard to see.
    try:
        recovered = ocr_text(path)
    except Exception as exc:  # noqa: BLE001
        logger.warning("OCR fallback raised for %s: %s", getattr(path, "name", path), exc)
        return text or ""

    if looks_unreadable(recovered):
        return text or ""

    logger.info(
        "OCR fallback read %s: %d characters where the text layer gave %d",
        getattr(path, "name", path), len(recovered), len((text or "").strip()),
    )
    return recovered
