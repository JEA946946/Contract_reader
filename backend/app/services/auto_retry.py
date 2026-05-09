"""Auto-retry failed documents: max 2 retries per doc, every 30 min, max 5 per run."""

from __future__ import annotations

import logging
import re
import threading
from datetime import datetime, timedelta

from app.database import SessionLocal
from app.models import Document

logger = logging.getLogger(__name__)

MAX_RETRIES = 2
MAX_PER_RUN = 5
MIN_AGE_MINUTES = 30


def _get_retry_count(notes: str | None) -> int:
    """Count how many 'Auto-retry #N' markers are in the notes."""
    if not notes:
        return 0
    return len(re.findall(r"Auto-retry #\d+", notes))


def run_auto_retry() -> None:
    """Find failed documents eligible for retry and re-process them."""
    db = SessionLocal()
    try:
        cutoff = datetime.utcnow() - timedelta(minutes=MIN_AGE_MINUTES)
        failed_docs = (
            db.query(Document)
            .filter(
                Document.status == "failed",
                Document.upload_date < cutoff,
            )
            .order_by(Document.upload_date.asc())
            .limit(MAX_PER_RUN * 2)  # fetch extra to filter by retry count
            .all()
        )

        retried = 0
        for doc in failed_docs:
            if retried >= MAX_PER_RUN:
                break

            retry_count = _get_retry_count(doc.notes)
            if retry_count >= MAX_RETRIES:
                continue

            new_retry_num = retry_count + 1
            logger.info("Auto-retry #%d for document %d (%s)", new_retry_num, doc.id, doc.filename)

            doc.status = "processing"
            doc.notes = (doc.notes or "") + f" | Auto-retry #{new_retry_num}"
            db.commit()

            # Launch background parse in a thread (same as upload flow)
            from app.services.extraction import parse_document_background
            thread = threading.Thread(
                target=parse_document_background,
                args=(doc.id,),
                daemon=True,
            )
            thread.start()
            retried += 1

        if retried:
            logger.info("Auto-retry: queued %d documents for re-processing", retried)

    except Exception:
        logger.exception("Auto-retry job failed")
        db.rollback()
    finally:
        db.close()
