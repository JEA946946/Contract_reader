from __future__ import annotations

from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import EmailFolderRule, Folder
from app.schemas import EmailFolderRuleCreate, EmailFolderRuleUpdate, EmailFolderRuleOut

router = APIRouter(prefix="/api/email-rules", tags=["email-rules"])


@router.get("", response_model=List[EmailFolderRuleOut])
def list_rules(db: Session = Depends(get_db)):
    rules = (
        db.query(EmailFolderRule)
        .order_by(EmailFolderRule.priority.desc(), EmailFolderRule.id.asc())
        .all()
    )
    result = []
    for rule in rules:
        folder_name = None
        if rule.folder:
            folder_name = rule.folder.name
        result.append(
            EmailFolderRuleOut(
                id=rule.id,
                keyword=rule.keyword,
                folder_id=rule.folder_id,
                is_case_sensitive=rule.is_case_sensitive,
                priority=rule.priority,
                created_at=rule.created_at,
                folder_name=folder_name,
            )
        )
    return result


@router.post("", response_model=EmailFolderRuleOut, status_code=201)
def create_rule(body: EmailFolderRuleCreate, db: Session = Depends(get_db)):
    folder = db.query(Folder).filter(Folder.id == body.folder_id).first()
    if not folder:
        raise HTTPException(status_code=404, detail="Folder not found")

    rule = EmailFolderRule(
        keyword=body.keyword,
        folder_id=body.folder_id,
        is_case_sensitive=body.is_case_sensitive,
        priority=body.priority,
    )
    db.add(rule)
    db.commit()
    db.refresh(rule)

    return EmailFolderRuleOut(
        id=rule.id,
        keyword=rule.keyword,
        folder_id=rule.folder_id,
        is_case_sensitive=rule.is_case_sensitive,
        priority=rule.priority,
        created_at=rule.created_at,
        folder_name=folder.name,
    )


@router.put("/{rule_id}", response_model=EmailFolderRuleOut)
def update_rule(rule_id: int, body: EmailFolderRuleUpdate, db: Session = Depends(get_db)):
    rule = db.query(EmailFolderRule).filter(EmailFolderRule.id == rule_id).first()
    if not rule:
        raise HTTPException(status_code=404, detail="Rule not found")

    if body.keyword is not None:
        rule.keyword = body.keyword
    if body.folder_id is not None:
        folder = db.query(Folder).filter(Folder.id == body.folder_id).first()
        if not folder:
            raise HTTPException(status_code=404, detail="Folder not found")
        rule.folder_id = body.folder_id
    if body.is_case_sensitive is not None:
        rule.is_case_sensitive = body.is_case_sensitive
    if body.priority is not None:
        rule.priority = body.priority

    db.commit()
    db.refresh(rule)

    folder_name = rule.folder.name if rule.folder else None
    return EmailFolderRuleOut(
        id=rule.id,
        keyword=rule.keyword,
        folder_id=rule.folder_id,
        is_case_sensitive=rule.is_case_sensitive,
        priority=rule.priority,
        created_at=rule.created_at,
        folder_name=folder_name,
    )


@router.delete("/{rule_id}", status_code=204)
def delete_rule(rule_id: int, db: Session = Depends(get_db)):
    rule = db.query(EmailFolderRule).filter(EmailFolderRule.id == rule_id).first()
    if not rule:
        raise HTTPException(status_code=404, detail="Rule not found")
    db.delete(rule)
    db.commit()
