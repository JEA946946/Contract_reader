"""Apply keyword-based folder rules to emails by subject line."""

from __future__ import annotations

import logging

from sqlalchemy.orm import Session

from app.models import Document, EmailFolderRule

logger = logging.getLogger(__name__)


def apply_keyword_rules(subject: str, document: Document, db: Session) -> bool:
    """Check subject against keyword rules (ordered by priority DESC).

    First match wins. Sets document.folder_id if a match is found.
    Returns True if a rule matched, False otherwise.
    """
    if not subject:
        return False

    rules = (
        db.query(EmailFolderRule)
        .order_by(EmailFolderRule.priority.desc(), EmailFolderRule.id.asc())
        .all()
    )

    for rule in rules:
        keyword = rule.keyword
        subj = subject

        if not rule.is_case_sensitive:
            keyword = keyword.lower()
            subj = subj.lower()

        if keyword in subj:
            document.folder_id = rule.folder_id
            logger.info(
                "Keyword rule matched: '%s' in subject '%s' -> folder %d",
                rule.keyword,
                subject,
                rule.folder_id,
            )
            return True

    return False
