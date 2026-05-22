from __future__ import annotations

import logging
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models import Document, ExtractionFeedback

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/settings", tags=["settings"])


class AppSettings(BaseModel):
    # Database
    database_connected: bool
    database_url_display: str  # masked

    # Anthropic
    anthropic_configured: bool
    anthropic_key_display: str  # masked

    # Gmail polling
    gmail_enabled: bool
    gmail_email: str
    gmail_poll_interval_minutes: int

    # CMR integration
    cmr_configured: bool
    cmr_api_base: str
    cmr_api_token_display: str  # masked

    # Google Places
    google_places_configured: bool
    google_places_key_display: str  # masked

    # AI parser
    ai_validation_pass_enabled: bool

    # Upload
    upload_dir: str

    # Stats
    total_documents: int
    documents_with_hash: int
    total_feedback_entries: int
    avg_confidence_score: Optional[float]


class AnthropicSettingsUpdate(BaseModel):
    anthropic_api_key: str = ""  # empty = keep existing


class AnthropicSettingsResponse(BaseModel):
    anthropic_api_key_display: str


class CmrSettingsUpdate(BaseModel):
    cmr_api_base: str = ""
    cmr_api_token: str = ""  # empty = keep existing


class CmrSettingsResponse(BaseModel):
    cmr_api_base: str
    cmr_api_token_display: str


class GooglePlacesSettingsUpdate(BaseModel):
    google_places_api_key: str = ""  # empty = keep existing


class GooglePlacesSettingsResponse(BaseModel):
    google_places_api_key_display: str


class GmailSettingsUpdate(BaseModel):
    gmail_email: str = ""
    gmail_app_password: str = ""  # empty string = keep existing
    gmail_imap_host: str = "imap.gmail.com"
    gmail_imap_port: int = 993
    gmail_poll_interval_minutes: int = 15
    gmail_poll_enabled: bool = False


class GmailSettingsResponse(BaseModel):
    gmail_email: str
    gmail_app_password_display: str
    gmail_imap_host: str
    gmail_imap_port: int
    gmail_poll_interval_minutes: int
    gmail_poll_enabled: bool


def _update_env_file(updates: dict[str, str]) -> None:
    """Update or add keys in the backend .env file."""
    env_path = Path(__file__).resolve().parent.parent.parent / ".env"
    lines: list[str] = []
    if env_path.exists():
        lines = env_path.read_text().splitlines()

    updated_keys: set[str] = set()
    new_lines: list[str] = []
    for line in lines:
        stripped = line.strip()
        if stripped and not stripped.startswith("#") and "=" in stripped:
            key = stripped.split("=", 1)[0]
            if key in updates:
                new_lines.append(f"{key}={updates[key]}")
                updated_keys.add(key)
                continue
        new_lines.append(line)

    # Append keys that weren't already in the file
    for key, value in updates.items():
        if key not in updated_keys:
            new_lines.append(f"{key}={value}")

    env_path.write_text("\n".join(new_lines) + "\n")


def _mask_key(key: str) -> str:
    """Show first 10 and last 4 chars of a key."""
    if not key or len(key) < 20:
        return "not set" if not key else "***"
    return f"{key[:10]}...{key[-4:]}"


def _mask_db_url(url: str) -> str:
    """Mask password in database URL."""
    import re
    return re.sub(r'://([^:]+):([^@]+)@', r'://\1:***@', url)


@router.get("", response_model=AppSettings)
def get_settings(db: Session = Depends(get_db)):
    # Test database connection
    db_ok = True
    try:
        db.execute(func.now())
    except Exception:
        db_ok = False

    total_docs = db.query(func.count(Document.id)).scalar() or 0
    docs_with_hash = db.query(func.count(Document.id)).filter(
        Document.content_hash.isnot(None)
    ).scalar() or 0

    total_feedback = 0
    try:
        total_feedback = db.query(func.count(ExtractionFeedback.id)).scalar() or 0
    except Exception:
        pass

    avg_conf = None
    try:
        avg_conf = db.query(func.avg(Document.confidence_score)).filter(
            Document.confidence_score.isnot(None)
        ).scalar()
        if avg_conf is not None:
            avg_conf = round(float(avg_conf), 2)
    except Exception:
        pass

    return AppSettings(
        database_connected=db_ok,
        database_url_display=_mask_db_url(settings.database_url),
        anthropic_configured=bool(settings.anthropic_api_key and settings.anthropic_api_key != "your-api-key-here"),
        anthropic_key_display=_mask_key(settings.anthropic_api_key),
        gmail_enabled=settings.gmail_configured,
        gmail_email=settings.gmail_email or "",
        gmail_poll_interval_minutes=settings.gmail_poll_interval_minutes,
        cmr_configured=bool(settings.cmr_api_base),
        cmr_api_base=settings.cmr_api_base or "",
        cmr_api_token_display=_mask_key(settings.cmr_api_token),
        google_places_configured=bool(settings.google_places_api_key),
        google_places_key_display=_mask_key(settings.google_places_api_key),
        ai_validation_pass_enabled=settings.ai_validation_pass_enabled,
        upload_dir=settings.upload_dir,
        total_documents=total_docs,
        documents_with_hash=docs_with_hash,
        total_feedback_entries=total_feedback,
        avg_confidence_score=avg_conf,
    )


@router.get("/gmail", response_model=GmailSettingsResponse)
def get_gmail_settings():
    return GmailSettingsResponse(
        gmail_email=settings.gmail_email or "",
        gmail_app_password_display=_mask_key(settings.gmail_app_password) if settings.gmail_app_password else "",
        gmail_imap_host=settings.gmail_imap_host,
        gmail_imap_port=settings.gmail_imap_port,
        gmail_poll_interval_minutes=settings.gmail_poll_interval_minutes,
        gmail_poll_enabled=settings.gmail_poll_enabled,
    )


@router.put("/gmail", response_model=GmailSettingsResponse)
def update_gmail_settings(body: GmailSettingsUpdate):
    # Determine actual password (keep existing if blank submitted)
    actual_password = body.gmail_app_password if body.gmail_app_password else settings.gmail_app_password

    # Update runtime settings
    settings.gmail_email = body.gmail_email
    settings.gmail_app_password = actual_password
    settings.gmail_imap_host = body.gmail_imap_host
    settings.gmail_imap_port = body.gmail_imap_port
    settings.gmail_poll_interval_minutes = body.gmail_poll_interval_minutes
    settings.gmail_poll_enabled = body.gmail_poll_enabled

    # Persist to .env file
    env_updates = {
        "GMAIL_EMAIL": body.gmail_email,
        "GMAIL_IMAP_HOST": body.gmail_imap_host,
        "GMAIL_IMAP_PORT": str(body.gmail_imap_port),
        "GMAIL_POLL_INTERVAL_MINUTES": str(body.gmail_poll_interval_minutes),
        "GMAIL_POLL_ENABLED": str(body.gmail_poll_enabled).lower(),
    }
    if body.gmail_app_password:
        env_updates["GMAIL_APP_PASSWORD"] = body.gmail_app_password
    _update_env_file(env_updates)

    # Restart scheduler job with new interval
    _reschedule_gmail_polling()

    logger.info("Gmail settings updated (email=%s, enabled=%s, interval=%d min)",
                body.gmail_email, body.gmail_poll_enabled, body.gmail_poll_interval_minutes)

    return GmailSettingsResponse(
        gmail_email=settings.gmail_email,
        gmail_app_password_display=_mask_key(settings.gmail_app_password) if settings.gmail_app_password else "",
        gmail_imap_host=settings.gmail_imap_host,
        gmail_imap_port=settings.gmail_imap_port,
        gmail_poll_interval_minutes=settings.gmail_poll_interval_minutes,
        gmail_poll_enabled=settings.gmail_poll_enabled,
    )


@router.get("/anthropic", response_model=AnthropicSettingsResponse)
def get_anthropic_settings():
    return AnthropicSettingsResponse(
        anthropic_api_key_display=_mask_key(settings.anthropic_api_key),
    )


@router.put("/anthropic", response_model=AnthropicSettingsResponse)
def update_anthropic_settings(body: AnthropicSettingsUpdate):
    actual_key = body.anthropic_api_key if body.anthropic_api_key else settings.anthropic_api_key
    settings.anthropic_api_key = actual_key
    env_updates: dict[str, str] = {}
    if body.anthropic_api_key:
        env_updates["ANTHROPIC_API_KEY"] = body.anthropic_api_key
    if env_updates:
        _update_env_file(env_updates)
    logger.info("Anthropic settings updated")
    return AnthropicSettingsResponse(
        anthropic_api_key_display=_mask_key(settings.anthropic_api_key),
    )


@router.get("/cmr", response_model=CmrSettingsResponse)
def get_cmr_settings():
    return CmrSettingsResponse(
        cmr_api_base=settings.cmr_api_base or "",
        cmr_api_token_display=_mask_key(settings.cmr_api_token),
    )


@router.put("/cmr", response_model=CmrSettingsResponse)
def update_cmr_settings(body: CmrSettingsUpdate):
    actual_token = body.cmr_api_token if body.cmr_api_token else settings.cmr_api_token
    settings.cmr_api_base = body.cmr_api_base
    settings.cmr_api_token = actual_token
    env_updates: dict[str, str] = {"CMR_API_BASE": body.cmr_api_base}
    if body.cmr_api_token:
        env_updates["CMR_API_TOKEN"] = body.cmr_api_token
    _update_env_file(env_updates)
    logger.info("CMR settings updated (base=%s)", body.cmr_api_base)
    return CmrSettingsResponse(
        cmr_api_base=settings.cmr_api_base or "",
        cmr_api_token_display=_mask_key(settings.cmr_api_token),
    )


@router.get("/google-places", response_model=GooglePlacesSettingsResponse)
def get_google_places_settings():
    return GooglePlacesSettingsResponse(
        google_places_api_key_display=_mask_key(settings.google_places_api_key),
    )


@router.put("/google-places", response_model=GooglePlacesSettingsResponse)
def update_google_places_settings(body: GooglePlacesSettingsUpdate):
    actual_key = body.google_places_api_key if body.google_places_api_key else settings.google_places_api_key
    settings.google_places_api_key = actual_key
    env_updates: dict[str, str] = {}
    if body.google_places_api_key:
        env_updates["GOOGLE_PLACES_API_KEY"] = body.google_places_api_key
    if env_updates:
        _update_env_file(env_updates)
    logger.info("Google Places settings updated")
    return GooglePlacesSettingsResponse(
        google_places_api_key_display=_mask_key(settings.google_places_api_key),
    )


def _reschedule_gmail_polling() -> None:
    """Add, update, or remove the Gmail polling scheduler job based on current settings."""
    from app.services.scheduler import get_scheduler, _run_poll

    scheduler = get_scheduler()
    if scheduler is None:
        return

    # Remove existing job if present
    try:
        scheduler.remove_job("gmail_poll")
    except Exception:
        pass

    # Add job if configured
    if settings.gmail_configured:
        scheduler.add_job(
            _run_poll,
            "interval",
            minutes=settings.gmail_poll_interval_minutes,
            id="gmail_poll",
            max_instances=1,
            replace_existing=True,
        )
        logger.info("Gmail polling rescheduled — every %d minutes", settings.gmail_poll_interval_minutes)
