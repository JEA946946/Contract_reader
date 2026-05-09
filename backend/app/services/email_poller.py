from __future__ import annotations

import imaplib
import email as email_lib
from email import policy
from email.utils import parsedate_to_datetime
from datetime import datetime
import logging
import re

from app.config import settings
from app.database import SessionLocal
from app.models import Document, ProcessedEmail
from app.services.extraction import parse_document

logger = logging.getLogger(__name__)


def poll_gmail() -> None:
    """Entry point called by the scheduler. Creates its own DB session."""
    if not settings.gmail_configured:
        return

    db = SessionLocal()
    try:
        _poll_inbox(db)
    except Exception as e:
        logger.error("Gmail polling failed: %s", e)
    finally:
        db.close()


def _poll_inbox(db) -> None:
    """Connect to IMAP, search for UNSEEN emails, and process each one."""
    logger.info("Connecting to %s as %s", settings.gmail_imap_host, settings.gmail_email)

    imap = imaplib.IMAP4_SSL(settings.gmail_imap_host, settings.gmail_imap_port)
    try:
        imap.login(settings.gmail_email, settings.gmail_app_password)
        imap.select("INBOX")

        _status, data = imap.search(None, "UNSEEN")
        email_ids = data[0].split() if data[0] else []
        logger.info("Found %d unseen emails", len(email_ids))

        for eid in email_ids:
            try:
                _process_single_email(imap, eid, db)
            except Exception as e:
                logger.error("Failed to process email %s: %s", eid, e)
    finally:
        try:
            imap.close()
            imap.logout()
        except Exception:
            pass


def _process_single_email(imap, email_id: bytes, db) -> None:
    """Fetch, dedup, save as .eml, parse via existing pipeline, and record."""
    _status, msg_data = imap.fetch(email_id, "(RFC822)")
    raw_bytes = msg_data[0][1]

    msg = email_lib.message_from_bytes(raw_bytes, policy=policy.default)

    message_id = msg.get("Message-ID", "").strip()
    if not message_id:
        message_id = f"no-msgid-{email_id.decode()}-{datetime.utcnow().isoformat()}"

    # Dedup check
    existing = db.query(ProcessedEmail).filter(ProcessedEmail.message_id == message_id).first()
    if existing:
        logger.info("Skipping already-processed email: %s", message_id)
        return

    subject = msg.get("Subject", "(no subject)")
    sender = msg.get("From", "")
    received_date = None
    date_str = msg.get("Date")
    if date_str:
        try:
            received_date = parsedate_to_datetime(date_str)
        except Exception:
            pass

    # Save raw .eml to uploads/
    safe_subject = re.sub(r'[^\w\s-]', '', subject)[:50].strip()
    timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    eml_filename = f"email_{timestamp}_{safe_subject}.eml"
    eml_path = settings.upload_path / eml_filename
    eml_path.write_bytes(raw_bytes)

    # Create Document record
    document = Document(
        filename=eml_filename,
        file_type="eml",
        status="processing",
    )
    db.add(document)
    db.commit()
    db.refresh(document)

    # Parse via existing pipeline
    status = "processed"
    notes = None
    try:
        rows = parse_document(eml_path, document, db)
        document.row_count = len(rows)
        if rows:
            document.status = "pending_review"
            notes = f"Parsed {len(rows)} price rows from email"
        else:
            document.status = "pending_review"
            notes = "No price data extracted from email"
        db.commit()
    except Exception as e:
        status = "failed"
        notes = f"Parsing error: {e}"
        document.status = "failed"
        document.notes = str(e)
        db.commit()
        logger.error("Parsing failed for email %s: %s", message_id, e)

    # Record in ProcessedEmail table
    record = ProcessedEmail(
        message_id=message_id,
        subject=subject,
        sender=sender,
        received_date=received_date,
        document_id=document.id,
        status=status,
        notes=notes,
    )
    db.add(record)
    db.commit()

    logger.info("Processed email: %s → document %d (%s)", subject, document.id, status)
