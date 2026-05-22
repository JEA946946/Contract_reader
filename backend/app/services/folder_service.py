"""Auto-assign documents to folders based on parsed data.

Hierarchy: Category (Hotels/Restaurants/Transportation) → City → documents
"""

from __future__ import annotations

import json
import logging

from sqlalchemy.orm import Session

from app.models import Document, Folder

logger = logging.getLogger(__name__)

CATEGORY_LABELS = {
    "hotel": "Hotels",
    "restaurant": "Restaurants",
    "transportation": "Transportation",
}


def auto_assign_folder(document: Document, db: Session) -> None:
    """Read parsed_rows_json, extract city, and assign to Category → City folder."""
    # Don't overwrite folder if already assigned (e.g. by keyword rules)
    if document.folder_id is not None:
        return

    if not document.parsed_rows_json:
        return

    try:
        rows = json.loads(document.parsed_rows_json)
    except Exception:
        return

    if not rows:
        return

    category = document.document_category or "hotel"
    category_label = CATEGORY_LABELS.get(category, "Hotels")

    # Extract city from first row that has one
    city = None
    for row in rows:
        city = (row.get("city") or "").strip()
        if city:
            break

    if not city:
        city = "Unknown City"

    # Find or create category folder (root level, type=auto)
    cat_folder = (
        db.query(Folder)
        .filter(Folder.name == category_label, Folder.parent_id.is_(None), Folder.folder_type == "auto")
        .first()
    )
    if not cat_folder:
        cat_folder = Folder(name=category_label, parent_id=None, folder_type="auto")
        db.add(cat_folder)
        db.flush()
        logger.info("Auto-created category folder: %s (id=%d)", category_label, cat_folder.id)

    # Find or create city folder (under category, type=auto)
    city_folder = (
        db.query(Folder)
        .filter(Folder.name == city, Folder.parent_id == cat_folder.id, Folder.folder_type == "auto")
        .first()
    )
    if not city_folder:
        city_folder = Folder(name=city, parent_id=cat_folder.id, folder_type="auto")
        db.add(city_folder)
        db.flush()
        logger.info("Auto-created city folder: %s under %s (id=%d)", city, category_label, city_folder.id)

    document.folder_id = city_folder.id
