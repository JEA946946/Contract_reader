"""REST API endpoints for transportation prices."""
from decimal import Decimal
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import select, or_

from app.database import get_db
from app.models import TransportCompany, TransportPrice
from app.schemas import (
    TransportPriceOut,
    TransportPriceListResponse,
    ManualTransportRowSchema,
    CreateTransportRequest,
    CreateTransportResponse,
    TransportDetailOut,
)

router = APIRouter(prefix="/api/transportation", tags=["transportation"])


@router.get("", response_model=TransportPriceListResponse)
def list_transport_prices(
    city: Optional[str] = None,
    company: Optional[str] = None,
    service_type: Optional[str] = None,
    bus_size: Optional[int] = None,
    search: Optional[str] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
):
    query = (
        db.query(TransportPrice)
        .join(TransportCompany)
        .options(joinedload(TransportPrice.company))
    )

    if city:
        query = query.filter(TransportPrice.city == city)
    if company:
        query = query.filter(TransportCompany.name == company)
    if service_type:
        query = query.filter(TransportPrice.service_type == service_type)
    if bus_size:
        query = query.filter(TransportPrice.bus_size == bus_size)
    if search:
        pattern = f"%{search}%"
        query = query.filter(
            or_(
                TransportCompany.name.ilike(pattern),
                TransportPrice.code.ilike(pattern),
                TransportPrice.product.ilike(pattern),
                TransportPrice.route_description.ilike(pattern),
                TransportPrice.city.ilike(pattern),
            )
        )

    total = query.count()
    items = (
        query.order_by(TransportCompany.name, TransportPrice.service_type)
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )

    return TransportPriceListResponse(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/cities", response_model=List[str])
def get_transport_cities(db: Session = Depends(get_db)):
    result = db.execute(
        select(TransportPrice.city).distinct().order_by(TransportPrice.city)
    ).scalars().all()
    return [c for c in result if c]


@router.get("/service-types", response_model=List[str])
def get_service_types(db: Session = Depends(get_db)):
    result = db.execute(
        select(TransportPrice.service_type).distinct().order_by(TransportPrice.service_type)
    ).scalars().all()
    return [t for t in result if t]


@router.get("/companies", response_model=List[str])
def get_transport_companies(db: Session = Depends(get_db)):
    result = db.execute(
        select(TransportCompany.name).distinct().order_by(TransportCompany.name)
    ).scalars().all()
    return list(result)


def _save_transport_rows(rows: list[ManualTransportRowSchema], company_id: int, db: Session, document_id: Optional[int] = None) -> int:
    count = 0
    for row in rows:
        tp = TransportPrice(
            document_id=document_id,
            company_id=company_id,
            code=row.code,
            price=Decimal(str(row.price)) if row.price is not None else None,
            product=row.product,
            bus_size=row.bus_size,
            service_type=row.service_type,
            days=row.days,
            route_description=row.route_description,
            note=row.note,
            city=row.city,
        )
        db.add(tp)
        count += 1
    return count


@router.get("/{company_id}", response_model=TransportDetailOut)
def get_transport_company(company_id: int, db: Session = Depends(get_db)):
    company = (
        db.query(TransportCompany)
        .options(joinedload(TransportCompany.transport_prices))
        .filter(TransportCompany.id == company_id)
        .first()
    )
    if not company:
        raise HTTPException(status_code=404, detail="Transport company not found")
    return company


@router.post("", response_model=CreateTransportResponse)
def create_transport_company(body: CreateTransportRequest, db: Session = Depends(get_db)):
    if not body.name or not body.code or not body.city:
        raise HTTPException(status_code=400, detail="Company name, code, and city are required")

    company = TransportCompany(
        name=body.name,
        code=body.code,
        city=body.city,
        phone=body.phone,
        email=body.email,
    )
    db.add(company)
    db.flush()

    count = _save_transport_rows(body.transport_prices, company.id, db)
    db.commit()

    return CreateTransportResponse(
        company_id=company.id,
        company_name=company.name,
        price_count=count,
        message=f"Created transport company '{company.name}' with {count} price rows",
    )


@router.put("/{company_id}", response_model=CreateTransportResponse)
def update_transport_company(company_id: int, body: CreateTransportRequest, db: Session = Depends(get_db)):
    company = db.query(TransportCompany).filter(TransportCompany.id == company_id).first()
    if not company:
        raise HTTPException(status_code=404, detail="Transport company not found")

    company.name = body.name
    company.code = body.code
    company.city = body.city
    company.phone = body.phone
    company.email = body.email

    # Preserve document_id from old prices
    old_prices = db.query(TransportPrice).filter(TransportPrice.company_id == company_id).all()
    preserved_doc_id = next(
        (p.document_id for p in old_prices if p.document_id is not None),
        None,
    )
    for p in old_prices:
        db.delete(p)
    db.flush()

    count = _save_transport_rows(body.transport_prices, company.id, db, document_id=preserved_doc_id)
    db.commit()

    return CreateTransportResponse(
        company_id=company.id,
        company_name=company.name,
        price_count=count,
        message=f"Updated transport company '{company.name}' with {count} price rows",
    )


@router.delete("/{company_id}")
def delete_transport_company(company_id: int, db: Session = Depends(get_db)):
    company = db.query(TransportCompany).filter(TransportCompany.id == company_id).first()
    if not company:
        raise HTTPException(status_code=404, detail="Transport company not found")

    # Delete transport prices
    db.query(TransportPrice).filter(TransportPrice.company_id == company_id).delete()
    db.delete(company)
    db.commit()
    return {"message": "Transport company deleted"}
