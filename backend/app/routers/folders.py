from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Folder, Document
from app.schemas import (
    FolderCreate,
    FolderRename,
    FolderMove,
    FolderOut,
    DocumentMoveToFolder,
    BatchMoveDocuments,
    DocumentOut,
)

router = APIRouter(prefix="/api/folders", tags=["folders"])


def _build_tree(folders: list[Folder], doc_counts: dict[int, int]) -> list[dict]:
    """Build nested tree from flat list of folders."""
    by_id: dict[int, dict] = {}
    roots: list[dict] = []

    for f in folders:
        by_id[f.id] = {
            "id": f.id,
            "name": f.name,
            "parent_id": f.parent_id,
            "folder_type": f.folder_type,
            "created_at": f.created_at,
            "document_count": doc_counts.get(f.id, 0),
            "children": [],
        }

    for f in folders:
        node = by_id[f.id]
        if f.parent_id and f.parent_id in by_id:
            by_id[f.parent_id]["children"].append(node)
        else:
            roots.append(node)

    return roots


@router.get("/tree", response_model=List[FolderOut])
def get_folder_tree(db: Session = Depends(get_db)):
    """Return the full nested folder tree with document counts."""
    folders = db.query(Folder).order_by(Folder.name).all()
    doc_counts_rows = (
        db.query(Document.folder_id, func.count(Document.id))
        .filter(Document.folder_id.isnot(None))
        .group_by(Document.folder_id)
        .all()
    )
    doc_counts = {folder_id: count for folder_id, count in doc_counts_rows}
    return _build_tree(folders, doc_counts)


@router.post("", response_model=FolderOut)
def create_folder(body: FolderCreate, db: Session = Depends(get_db)):
    if body.parent_id:
        parent = db.query(Folder).filter(Folder.id == body.parent_id).first()
        if not parent:
            raise HTTPException(status_code=404, detail="Parent folder not found")

    folder = Folder(name=body.name, parent_id=body.parent_id, folder_type="manual")
    db.add(folder)
    db.commit()
    db.refresh(folder)
    return FolderOut(
        id=folder.id,
        name=folder.name,
        parent_id=folder.parent_id,
        folder_type=folder.folder_type,
        created_at=folder.created_at,
        document_count=0,
        children=[],
    )


@router.patch("/{folder_id}/rename", response_model=FolderOut)
def rename_folder(folder_id: int, body: FolderRename, db: Session = Depends(get_db)):
    folder = db.query(Folder).filter(Folder.id == folder_id).first()
    if not folder:
        raise HTTPException(status_code=404, detail="Folder not found")
    folder.name = body.name
    db.commit()
    doc_count = db.query(func.count(Document.id)).filter(Document.folder_id == folder_id).scalar() or 0
    return FolderOut(
        id=folder.id,
        name=folder.name,
        parent_id=folder.parent_id,
        folder_type=folder.folder_type,
        created_at=folder.created_at,
        document_count=doc_count,
        children=[],
    )


@router.patch("/{folder_id}/move", response_model=FolderOut)
def move_folder(folder_id: int, body: FolderMove, db: Session = Depends(get_db)):
    folder = db.query(Folder).filter(Folder.id == folder_id).first()
    if not folder:
        raise HTTPException(status_code=404, detail="Folder not found")
    if body.parent_id == folder_id:
        raise HTTPException(status_code=400, detail="Cannot move folder into itself")
    if body.parent_id:
        parent = db.query(Folder).filter(Folder.id == body.parent_id).first()
        if not parent:
            raise HTTPException(status_code=404, detail="Target parent not found")
        # Prevent circular reference
        current = parent
        while current:
            if current.id == folder_id:
                raise HTTPException(status_code=400, detail="Cannot create circular folder reference")
            current = current.parent
    folder.parent_id = body.parent_id
    db.commit()
    doc_count = db.query(func.count(Document.id)).filter(Document.folder_id == folder_id).scalar() or 0
    return FolderOut(
        id=folder.id,
        name=folder.name,
        parent_id=folder.parent_id,
        folder_type=folder.folder_type,
        created_at=folder.created_at,
        document_count=doc_count,
        children=[],
    )


@router.delete("/{folder_id}")
def delete_folder(folder_id: int, db: Session = Depends(get_db)):
    folder = db.query(Folder).filter(Folder.id == folder_id).first()
    if not folder:
        raise HTTPException(status_code=404, detail="Folder not found")

    # Re-parent documents to parent folder (or null)
    db.query(Document).filter(Document.folder_id == folder_id).update(
        {"folder_id": folder.parent_id}, synchronize_session="fetch"
    )
    # Re-parent child folders
    db.query(Folder).filter(Folder.parent_id == folder_id).update(
        {"parent_id": folder.parent_id}, synchronize_session="fetch"
    )
    db.delete(folder)
    db.commit()
    return {"message": "Folder deleted"}


def _doc_to_out(doc: Document) -> DocumentOut:
    """Convert Document to DocumentOut with entity name extraction."""
    import json
    hotel_name = None
    if doc.parsed_rows_json:
        try:
            rows = json.loads(doc.parsed_rows_json)
            if doc.document_category == "restaurant":
                names = list(dict.fromkeys(r.get("restaurant_name") for r in rows if r.get("restaurant_name")))
            elif doc.document_category == "transportation":
                names = list(dict.fromkeys(r.get("company_name") for r in rows if r.get("company_name")))
            else:
                names = list(dict.fromkeys(r.get("accommodation") for r in rows if r.get("accommodation")))
            hotel_name = ", ".join(names) if names else None
        except Exception:
            pass
    return DocumentOut(
        id=doc.id,
        filename=doc.filename,
        file_type=doc.file_type,
        upload_date=doc.upload_date,
        status=doc.status,
        row_count=doc.row_count,
        notes=doc.notes,
        hotel_name=hotel_name,
        document_category=doc.document_category or "hotel",
        folder_id=doc.folder_id,
    )


@router.get("/{folder_id}/documents", response_model=List[DocumentOut])
def get_folder_documents(folder_id: int, db: Session = Depends(get_db)):
    folder = db.query(Folder).filter(Folder.id == folder_id).first()
    if not folder:
        raise HTTPException(status_code=404, detail="Folder not found")
    docs = (
        db.query(Document)
        .filter(Document.folder_id == folder_id)
        .order_by(Document.upload_date.desc())
        .all()
    )
    return [_doc_to_out(d) for d in docs]


@router.get("/unfiled", response_model=List[DocumentOut])
def get_unfiled_documents(db: Session = Depends(get_db)):
    docs = (
        db.query(Document)
        .filter(Document.folder_id.is_(None))
        .order_by(Document.upload_date.desc())
        .all()
    )
    return [_doc_to_out(d) for d in docs]


@router.patch("/documents/{document_id}/move-to-folder", response_model=DocumentOut)
def move_document_to_folder(
    document_id: int, body: DocumentMoveToFolder, db: Session = Depends(get_db)
):
    doc = db.query(Document).filter(Document.id == document_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    if body.folder_id:
        folder = db.query(Folder).filter(Folder.id == body.folder_id).first()
        if not folder:
            raise HTTPException(status_code=404, detail="Folder not found")
    doc.folder_id = body.folder_id
    db.commit()
    return _doc_to_out(doc)


@router.patch("/documents/batch-move")
def batch_move_documents(body: BatchMoveDocuments, db: Session = Depends(get_db)):
    if body.folder_id:
        folder = db.query(Folder).filter(Folder.id == body.folder_id).first()
        if not folder:
            raise HTTPException(status_code=404, detail="Folder not found")
    db.query(Document).filter(Document.id.in_(body.document_ids)).update(
        {"folder_id": body.folder_id}, synchronize_session="fetch"
    )
    db.commit()
    return {"message": f"Moved {len(body.document_ids)} documents"}
