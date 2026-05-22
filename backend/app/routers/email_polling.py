from __future__ import annotations

from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, BackgroundTasks, HTTPException
from pydantic import BaseModel
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models import ProcessedEmail, Document, Folder, EMAIL_LABELS
from app.schemas import ProcessedEmailDetailOut, ProcessedEmailListOut, AssignFolderRequest, SetLabelRequest

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


@router.get("/emails/by-document/{document_id}")
def get_email_by_document(document_id: int, db: Session = Depends(get_db)):
    """Look up the ProcessedEmail ID linked to a given document."""
    rec = db.query(ProcessedEmail).filter(ProcessedEmail.document_id == document_id).first()
    if not rec:
        raise HTTPException(status_code=404, detail="No email found for this document")
    return {"email_id": rec.id}


@router.get("/emails", response_model=ProcessedEmailListOut)
def list_emails(
    page: int = 1,
    page_size: int = 25,
    search: Optional[str] = None,
    status: Optional[str] = None,
    label: Optional[str] = None,
    folder_id: Optional[int] = None,
    unfiled: Optional[bool] = None,
    db: Session = Depends(get_db),
):
    query = db.query(ProcessedEmail)

    if search:
        like = f"%{search}%"
        query = query.filter(
            or_(
                ProcessedEmail.subject.ilike(like),
                ProcessedEmail.sender.ilike(like),
            )
        )

    if status:
        query = query.filter(ProcessedEmail.status == status)

    if label == "unlabeled":
        query = query.filter(ProcessedEmail.label.is_(None))
    elif label:
        query = query.filter(ProcessedEmail.label == label)

    # Server-side folder filtering via Document join
    if folder_id is not None:
        query = query.join(Document, ProcessedEmail.document_id == Document.id).filter(
            Document.folder_id == folder_id
        )
    elif unfiled:
        query = query.outerjoin(Document, ProcessedEmail.document_id == Document.id).filter(
            or_(ProcessedEmail.document_id.is_(None), Document.folder_id.is_(None))
        )

    total = query.count()
    records = (
        query.order_by(ProcessedEmail.received_date.desc(), ProcessedEmail.id.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )

    items = []
    for rec in records:
        folder_id = None
        folder_name = None
        doc_row_count = None
        doc_status = None
        if rec.document:
            doc_row_count = rec.document.row_count
            doc_status = rec.document.status
            if rec.document.folder_id:
                folder_id = rec.document.folder_id
                folder = db.query(Folder).filter(Folder.id == folder_id).first()
                if folder:
                    folder_name = folder.name

        items.append(
            ProcessedEmailDetailOut(
                id=rec.id,
                message_id=rec.message_id,
                subject=rec.subject,
                sender=rec.sender,
                received_date=rec.received_date,
                document_id=rec.document_id,
                processed_at=rec.processed_at,
                status=rec.status,
                notes=rec.notes,
                body_text=None,  # omit body in list view
                body_html=None,
                attachment_names=rec.attachment_names,
                folder_id=folder_id,
                folder_name=folder_name,
                label=rec.label,
                document_row_count=doc_row_count,
                document_status=doc_status,
            )
        )

    return ProcessedEmailListOut(items=items, total=total, page=page, page_size=page_size)


@router.get("/emails/{email_id}", response_model=ProcessedEmailDetailOut)
def get_email_detail(email_id: int, db: Session = Depends(get_db)):
    rec = db.query(ProcessedEmail).filter(ProcessedEmail.id == email_id).first()
    if not rec:
        raise HTTPException(status_code=404, detail="Email not found")

    folder_id = None
    folder_name = None
    doc_row_count = None
    doc_status = None
    if rec.document:
        doc_row_count = rec.document.row_count
        doc_status = rec.document.status
        if rec.document.folder_id:
            folder_id = rec.document.folder_id
            folder = db.query(Folder).filter(Folder.id == folder_id).first()
            if folder:
                folder_name = folder.name

    return ProcessedEmailDetailOut(
        id=rec.id,
        message_id=rec.message_id,
        subject=rec.subject,
        sender=rec.sender,
        received_date=rec.received_date,
        document_id=rec.document_id,
        processed_at=rec.processed_at,
        status=rec.status,
        notes=rec.notes,
        body_text=rec.body_text,
        body_html=rec.body_html,
        attachment_names=rec.attachment_names,
        folder_id=folder_id,
        folder_name=folder_name,
        label=rec.label,
        document_row_count=doc_row_count,
        document_status=doc_status,
    )


@router.patch("/emails/{email_id}/assign-folder")
def assign_email_folder(email_id: int, body: AssignFolderRequest, db: Session = Depends(get_db)):
    rec = db.query(ProcessedEmail).filter(ProcessedEmail.id == email_id).first()
    if not rec:
        raise HTTPException(status_code=404, detail="Email not found")
    if not rec.document_id:
        raise HTTPException(status_code=400, detail="Email has no linked document")

    doc = db.query(Document).filter(Document.id == rec.document_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Linked document not found")

    if body.folder_id is not None:
        folder = db.query(Folder).filter(Folder.id == body.folder_id).first()
        if not folder:
            raise HTTPException(status_code=404, detail="Folder not found")

    doc.folder_id = body.folder_id
    db.commit()
    return {"message": "Folder assigned", "folder_id": body.folder_id}


@router.patch("/emails/{email_id}/label")
def set_email_label(email_id: int, body: SetLabelRequest, db: Session = Depends(get_db)):
    rec = db.query(ProcessedEmail).filter(ProcessedEmail.id == email_id).first()
    if not rec:
        raise HTTPException(status_code=404, detail="Email not found")

    if body.label is not None and body.label not in EMAIL_LABELS:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid label. Must be one of: {', '.join(EMAIL_LABELS)}",
        )

    rec.label = body.label
    db.commit()
    return {"message": "Label updated", "label": body.label}


@router.post("/emails/{email_id}/requeue")
def requeue_email(email_id: int, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    """Reset the linked document to pending and trigger a re-parse in the background."""
    rec = db.query(ProcessedEmail).filter(ProcessedEmail.id == email_id).first()
    if not rec:
        raise HTTPException(status_code=404, detail="Email not found")
    if not rec.document_id:
        raise HTTPException(status_code=400, detail="Email has no linked document")

    doc = db.query(Document).filter(Document.id == rec.document_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Linked document not found")

    # Reset document for re-processing
    doc.status = "processing"
    doc.row_count = None
    doc.parsed_rows_json = None
    doc.notes = (doc.notes or "") + " | Requeued from Email Inbox"
    rec.status = "processing"
    db.commit()

    # Re-parse in background using the label as category hint
    background_tasks.add_task(_reparse_document, doc.id, rec.id, rec.label)
    return {"message": "Email requeued for re-processing"}


def _reparse_document(document_id: int, email_id: int, label: str | None):
    """Background task: re-parse the document's file."""
    from app.database import SessionLocal
    from app.services.extraction import parse_document

    db = SessionLocal()
    try:
        doc = db.query(Document).filter(Document.id == document_id).first()
        if not doc:
            return

        # Use the email label to set the document category for parsing
        category_map = {
            "accommodation": "hotel",
            "restaurant": "restaurant",
            "transportation": "transportation",
        }
        if label and label in category_map:
            doc.document_category = category_map[label]

        upload_path = settings.upload_path / doc.filename
        if not upload_path.exists():
            doc.status = "failed"
            doc.notes = (doc.notes or "") + " | Source file not found"
            rec = db.query(ProcessedEmail).filter(ProcessedEmail.id == email_id).first()
            if rec:
                rec.status = "failed"
            db.commit()
            return

        try:
            rows = parse_document(upload_path, doc, db)
            doc.row_count = len(rows)
            doc.status = "pending_review"
            doc.notes = f"Re-parsed: {len(rows)} rows"
            rec = db.query(ProcessedEmail).filter(ProcessedEmail.id == email_id).first()
            if rec:
                rec.status = "processed"
                rec.notes = f"Re-parsed: {len(rows)} rows"
            db.commit()
        except Exception as e:
            doc.status = "failed"
            doc.notes = f"Re-parse failed: {e}"
            rec = db.query(ProcessedEmail).filter(ProcessedEmail.id == email_id).first()
            if rec:
                rec.status = "failed"
            db.commit()
    finally:
        db.close()
