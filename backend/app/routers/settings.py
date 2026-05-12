from __future__ import annotations

from typing import Optional
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models import Document, ExtractionFeedback

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

    # AI parser
    ai_validation_pass_enabled: bool

    # Upload
    upload_dir: str

    # Stats
    total_documents: int
    documents_with_hash: int
    total_feedback_entries: int
    avg_confidence_score: Optional[float]


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
        ai_validation_pass_enabled=settings.ai_validation_pass_enabled,
        upload_dir=settings.upload_dir,
        total_documents=total_docs,
        documents_with_hash=docs_with_hash,
        total_feedback_entries=total_feedback,
        avg_confidence_score=avg_conf,
    )
