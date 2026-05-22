from __future__ import annotations

from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import ManagedCity, ManagedCategory, Document
from app.schemas import (
    ManagedCityCreate,
    ManagedCityOut,
    ManagedCategoryCreate,
    ManagedCategoryUpdate,
    ManagedCategoryOut,
)

router = APIRouter(prefix="/api/managed", tags=["managed-data"])


# ── Cities ──────────────────────────────────────────────

@router.get("/cities", response_model=List[ManagedCityOut])
def list_cities(db: Session = Depends(get_db)):
    return db.query(ManagedCity).order_by(ManagedCity.name).all()


@router.post("/cities", response_model=ManagedCityOut, status_code=201)
def create_city(body: ManagedCityCreate, db: Session = Depends(get_db)):
    existing = db.query(ManagedCity).filter(ManagedCity.name == body.name.strip()).first()
    if existing:
        raise HTTPException(status_code=409, detail="City already exists")
    city = ManagedCity(name=body.name.strip())
    db.add(city)
    db.commit()
    db.refresh(city)
    return city


@router.put("/cities/{city_id}", response_model=ManagedCityOut)
def update_city(city_id: int, body: ManagedCityCreate, db: Session = Depends(get_db)):
    city = db.query(ManagedCity).filter(ManagedCity.id == city_id).first()
    if not city:
        raise HTTPException(status_code=404, detail="City not found")
    duplicate = (
        db.query(ManagedCity)
        .filter(ManagedCity.name == body.name.strip(), ManagedCity.id != city_id)
        .first()
    )
    if duplicate:
        raise HTTPException(status_code=409, detail="City name already exists")
    city.name = body.name.strip()
    db.commit()
    db.refresh(city)
    return city


@router.delete("/cities/{city_id}", status_code=204)
def delete_city(city_id: int, db: Session = Depends(get_db)):
    city = db.query(ManagedCity).filter(ManagedCity.id == city_id).first()
    if not city:
        raise HTTPException(status_code=404, detail="City not found")
    db.delete(city)
    db.commit()


# ── Categories ──────────────────────────────────────────

@router.get("/categories", response_model=List[ManagedCategoryOut])
def list_categories(db: Session = Depends(get_db)):
    return db.query(ManagedCategory).order_by(ManagedCategory.slug).all()


@router.post("/categories", response_model=ManagedCategoryOut, status_code=201)
def create_category(body: ManagedCategoryCreate, db: Session = Depends(get_db)):
    existing = db.query(ManagedCategory).filter(ManagedCategory.slug == body.slug.strip()).first()
    if existing:
        raise HTTPException(status_code=409, detail="Category slug already exists")
    cat = ManagedCategory(slug=body.slug.strip(), label=body.label.strip())
    db.add(cat)
    db.commit()
    db.refresh(cat)
    return cat


@router.put("/categories/{cat_id}", response_model=ManagedCategoryOut)
def update_category(cat_id: int, body: ManagedCategoryUpdate, db: Session = Depends(get_db)):
    cat = db.query(ManagedCategory).filter(ManagedCategory.id == cat_id).first()
    if not cat:
        raise HTTPException(status_code=404, detail="Category not found")
    if body.slug is not None:
        duplicate = (
            db.query(ManagedCategory)
            .filter(ManagedCategory.slug == body.slug.strip(), ManagedCategory.id != cat_id)
            .first()
        )
        if duplicate:
            raise HTTPException(status_code=409, detail="Category slug already exists")
        cat.slug = body.slug.strip()
    if body.label is not None:
        cat.label = body.label.strip()
    db.commit()
    db.refresh(cat)
    return cat


@router.delete("/categories/{cat_id}", status_code=204)
def delete_category(cat_id: int, db: Session = Depends(get_db)):
    cat = db.query(ManagedCategory).filter(ManagedCategory.id == cat_id).first()
    if not cat:
        raise HTTPException(status_code=404, detail="Category not found")
    # Reject deletion if documents reference this category slug
    in_use = db.query(Document).filter(Document.document_category == cat.slug).first()
    if in_use:
        raise HTTPException(
            status_code=409,
            detail="Cannot delete category: documents are using it",
        )
    db.delete(cat)
    db.commit()
