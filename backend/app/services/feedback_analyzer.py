"""Analyze extraction feedback to identify common correction patterns.

Compares original AI-extracted rows with user-confirmed rows to detect
systematic errors that can feed back into AI prompts as "known issues".
"""
from __future__ import annotations

import json
import logging
from collections import Counter

from sqlalchemy.orm import Session

from app.models import ExtractionFeedback

logger = logging.getLogger(__name__)


def compute_diff_summary(original_json: str, corrected_json: str) -> str:
    """Compute a human-readable summary of differences between original and corrected rows."""
    try:
        original = json.loads(original_json)
        corrected = json.loads(corrected_json)
    except (json.JSONDecodeError, TypeError):
        return "Invalid JSON"

    changes: list[str] = []
    row_count_diff = len(corrected) - len(original)
    if row_count_diff > 0:
        changes.append(f"+{row_count_diff} rows added")
    elif row_count_diff < 0:
        changes.append(f"{row_count_diff} rows removed")

    # Compare matching rows by index (simple positional comparison)
    field_changes: Counter = Counter()
    for i, (orig_row, corr_row) in enumerate(zip(original, corrected)):
        for key in set(list(orig_row.keys()) + list(corr_row.keys())):
            if key == "date_ranges":
                continue  # Skip complex nested comparison
            if orig_row.get(key) != corr_row.get(key):
                field_changes[key] += 1

    for field, count in field_changes.most_common(10):
        changes.append(f"{field}: {count} corrections")

    return "; ".join(changes) if changes else "No changes"


def save_feedback(
    document_id: int,
    original_rows_json: str,
    corrected_rows_json: str,
    db: Session,
) -> None:
    """Save extraction feedback if the user made corrections."""
    if original_rows_json == corrected_rows_json:
        return  # No changes

    diff = compute_diff_summary(original_rows_json, corrected_rows_json)
    if diff == "No changes":
        return

    feedback = ExtractionFeedback(
        document_id=document_id,
        original_rows_json=original_rows_json,
        corrected_rows_json=corrected_rows_json,
        diff_summary=diff,
    )
    db.add(feedback)
    logger.info("Saved extraction feedback for document %d: %s", document_id, diff)


def get_common_corrections(db: Session, limit: int = 20) -> list[dict]:
    """Analyze stored feedback to find the most common correction patterns.

    Returns a list of {field, correction_count, examples} dicts.
    """
    feedbacks = db.query(ExtractionFeedback).order_by(
        ExtractionFeedback.created_at.desc()
    ).limit(200).all()

    if not feedbacks:
        return []

    field_corrections: Counter = Counter()
    field_examples: dict[str, list[dict]] = {}

    for fb in feedbacks:
        try:
            original = json.loads(fb.original_rows_json)
            corrected = json.loads(fb.corrected_rows_json)
        except (json.JSONDecodeError, TypeError):
            continue

        for i, (orig_row, corr_row) in enumerate(zip(original, corrected)):
            for key in set(list(orig_row.keys()) + list(corr_row.keys())):
                if key == "date_ranges":
                    continue
                orig_val = orig_row.get(key)
                corr_val = corr_row.get(key)
                if orig_val != corr_val:
                    field_corrections[key] += 1
                    if key not in field_examples:
                        field_examples[key] = []
                    if len(field_examples[key]) < 3:
                        field_examples[key].append({
                            "original": orig_val,
                            "corrected": corr_val,
                            "document_id": fb.document_id,
                        })

    return [
        {
            "field": field,
            "correction_count": count,
            "examples": field_examples.get(field, []),
        }
        for field, count in field_corrections.most_common(limit)
    ]
