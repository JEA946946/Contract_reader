from __future__ import annotations

import imaplib
import json
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
from app.services.email_folder_rules import apply_keyword_rules
from app.services.email_labeler import auto_detect_label
from app.services.folder_service import auto_assign_folder

logger = logging.getLogger(__name__)


def _extract_name_city(body_text: str) -> tuple[str, str]:
    """Extract entity name and city from the first lines of email body.

    Expected format (each separated by blank lines):
        Line 1: Entity name  (e.g. "Kenzi Solazur Hotel")
        Line 3: City         (e.g. "Tanger")
    Returns (name, city). Either may be empty.
    """
    if not body_text:
        return "", ""
    # Split into non-empty lines, stopping at forwarded-message markers
    lines: list[str] = []
    for raw in body_text.splitlines():
        stripped = raw.strip().strip("*")  # strip markdown-bold markers
        if stripped.startswith("----") or stripped.lower().startswith("x-mozilla"):
            break
        if stripped:
            lines.append(stripped)
        if len(lines) >= 2:
            break
    name = lines[0] if len(lines) >= 1 else ""
    city = lines[1] if len(lines) >= 2 else ""
    # Sanity: skip if the "name" looks like a header or is too long
    if len(name) > 120 or ":" in name:
        return "", ""
    if len(city) > 60 or ":" in city:
        return name, ""
    return name, city


def _apply_body_entity(body_text: str, document: Document, db) -> None:
    """Set entity name + city on the document from the email body first lines."""
    name, city = _extract_name_city(body_text)
    if not name:
        return

    category = document.document_category or "hotel"
    name_key = {
        "restaurant": "restaurant_name",
        "transportation": "company_name",
    }.get(category, "accommodation")

    if document.parsed_rows_json:
        rows = json.loads(document.parsed_rows_json)
    else:
        rows = [{}]

    for row in rows:
        if not row.get(name_key):
            row[name_key] = name
        if city and not row.get("city"):
            row["city"] = city

    document.parsed_rows_json = json.dumps(rows)

    # Re-assign folder based on the newly set city
    if city and document.folder_id is None:
        auto_assign_folder(document, db)

    db.commit()
    logger.info("Auto-labeled document %d: name=%s, city=%s", document.id, name, city)


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

    # Extract body and attachment info
    body_text = ""
    body_html = ""
    attachment_names = []
    for part in msg.walk():
        content_type = part.get_content_type()
        disposition = str(part.get("Content-Disposition", ""))
        if "attachment" in disposition:
            fname = part.get_filename()
            if fname:
                attachment_names.append(fname)
        elif content_type == "text/plain" and not body_text:
            payload = part.get_content()
            if isinstance(payload, str):
                body_text = payload
        elif content_type == "text/html" and not body_html:
            payload = part.get_content()
            if isinstance(payload, str):
                body_html = payload

    attachment_names_json = json.dumps(attachment_names) if attachment_names else None

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

    # Apply keyword-based folder rules before parsing
    apply_keyword_rules(subject, document, db)

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

    # Auto-extract entity name and city from first lines of body_text
    # Typical format: line 1 = name, line 2 = blank, line 3 = city
    _apply_body_entity(body_text, document, db)

    # Auto-detect label from subject/body
    label = auto_detect_label(subject, body_text)

    # Record in ProcessedEmail table
    record = ProcessedEmail(
        message_id=message_id,
        subject=subject,
        sender=sender,
        received_date=received_date,
        document_id=document.id,
        status=status,
        notes=notes,
        body_text=body_text or None,
        body_html=body_html or None,
        attachment_names=attachment_names_json,
        label=label,
    )
    db.add(record)
    db.commit()

    logger.info("Processed email: %s → document %d (%s)", subject, document.id, status)
