from __future__ import annotations

from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, BackgroundTasks
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models import ProcessedEmail

router = APIRouter(prefix="/api/email-polling", tags=["email-polling"])


class EmailPollingStatus(BaseModel):
    enabled: bool
    email_address: str
    poll_interval_minutes: int
    total_processed: int
    last_processed_at: Optional[datetime]


class ProcessedEmailOut(BaseModel):
    id: int
    message_id: str
    subject: Optional[str]
    sender: Optional[str]
    received_date: Optional[datetime]
    document_id: Optional[int]
    processed_at: datetime
    status: str
    notes: Optional[str]

    model_config = {"from_attributes": True}


class PollNowResponse(BaseModel):
    message: str


@router.get("/status", response_model=EmailPollingStatus)
def get_polling_status(db: Session = Depends(get_db)):
    total = db.query(func.count(ProcessedEmail.id)).scalar() or 0
    last = (
        db.query(ProcessedEmail.processed_at)
        .order_by(ProcessedEmail.processed_at.desc())
        .first()
    )
    return EmailPollingStatus(
        enabled=settings.gmail_configured,
        email_address=settings.gmail_email if settings.gmail_configured else "",
        poll_interval_minutes=settings.gmail_poll_interval_minutes,
        total_processed=total,
        last_processed_at=last[0] if last else None,
    )


@router.get("/history", response_model=List[ProcessedEmailOut])
def get_polling_history(
    limit: int = 50,
    offset: int = 0,
    db: Session = Depends(get_db),
):
    records = (
        db.query(ProcessedEmail)
        .order_by(ProcessedEmail.processed_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )
    return records


@router.post("/poll-now", response_model=PollNowResponse)
def trigger_poll_now(background_tasks: BackgroundTasks):
    if not settings.gmail_configured:
        return PollNowResponse(message="Gmail polling is not configured")

    from app.services.email_poller import poll_gmail
    background_tasks.add_task(poll_gmail)
    return PollNowResponse(message="Poll triggered — check /history for results")
