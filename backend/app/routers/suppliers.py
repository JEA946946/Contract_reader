"""Supplier linking endpoints — connect Hotel Price Reader entities to CMR suppliers."""

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from typing import Optional

from app.database import get_db
from app.config import settings
from app.models import Hotel, Restaurant, TransportCompany

router = APIRouter(prefix="/api/suppliers", tags=["suppliers"])


class LinkRequest(BaseModel):
    cmr_supplier_id: str


# ─── Hotels ──────────────────────────────────────────────────────────────────


@router.patch("/hotels/{hotel_id}/link")
def link_hotel(hotel_id: int, body: LinkRequest, db: Session = Depends(get_db)):
    hotel = db.get(Hotel, hotel_id)
    if not hotel:
        raise HTTPException(status_code=404, detail="Hotel not found")
    hotel.cmr_supplier_id = body.cmr_supplier_id
    db.commit()
    return {"success": True, "message": f"Hotel {hotel_id} linked to CMR supplier {body.cmr_supplier_id}"}


@router.delete("/hotels/{hotel_id}/unlink")
def unlink_hotel(hotel_id: int, db: Session = Depends(get_db)):
    hotel = db.get(Hotel, hotel_id)
    if not hotel:
        raise HTTPException(status_code=404, detail="Hotel not found")
    hotel.cmr_supplier_id = None
    db.commit()
    return {"success": True, "message": f"Hotel {hotel_id} unlinked from CMR supplier"}


# ─── Restaurants ─────────────────────────────────────────────────────────────


@router.patch("/restaurants/{restaurant_id}/link")
def link_restaurant(restaurant_id: int, body: LinkRequest, db: Session = Depends(get_db)):
    restaurant = db.get(Restaurant, restaurant_id)
    if not restaurant:
        raise HTTPException(status_code=404, detail="Restaurant not found")
    restaurant.cmr_supplier_id = body.cmr_supplier_id
    db.commit()
    return {"success": True, "message": f"Restaurant {restaurant_id} linked to CMR supplier {body.cmr_supplier_id}"}


@router.delete("/restaurants/{restaurant_id}/unlink")
def unlink_restaurant(restaurant_id: int, db: Session = Depends(get_db)):
    restaurant = db.get(Restaurant, restaurant_id)
    if not restaurant:
        raise HTTPException(status_code=404, detail="Restaurant not found")
    restaurant.cmr_supplier_id = None
    db.commit()
    return {"success": True, "message": f"Restaurant {restaurant_id} unlinked from CMR supplier"}


# ─── Transport Companies ────────────────────────────────────────────────────


@router.patch("/transport-companies/{company_id}/link")
def link_transport_company(company_id: int, body: LinkRequest, db: Session = Depends(get_db)):
    company = db.get(TransportCompany, company_id)
    if not company:
        raise HTTPException(status_code=404, detail="Transport company not found")
    company.cmr_supplier_id = body.cmr_supplier_id
    db.commit()
    return {"success": True, "message": f"Transport company {company_id} linked to CMR supplier {body.cmr_supplier_id}"}


@router.delete("/transport-companies/{company_id}/unlink")
def unlink_transport_company(company_id: int, db: Session = Depends(get_db)):
    company = db.get(TransportCompany, company_id)
    if not company:
        raise HTTPException(status_code=404, detail="Transport company not found")
    company.cmr_supplier_id = None
    db.commit()
    return {"success": True, "message": f"Transport company {company_id} unlinked from CMR supplier"}


# ─── CMR Supplier Proxy Search ──────────────────────────────────────────────


@router.get("/cmr-suppliers")
def search_cmr_suppliers(search: Optional[str] = None, category: Optional[str] = None):
    """Proxy search to CMR integrations/suppliers endpoint."""
    if not settings.cmr_api_base:
        raise HTTPException(status_code=503, detail="CMR API not configured")

    params = {}
    if search:
        params["search"] = search
    if category:
        params["category"] = category

    headers = {}
    if settings.cmr_api_token:
        headers["Authorization"] = f"Bearer {settings.cmr_api_token}"

    try:
        resp = httpx.get(
            f"{settings.cmr_api_base}/integrations/suppliers",
            params=params,
            headers=headers,
            timeout=10.0,
        )
        resp.raise_for_status()
        return resp.json()
    except httpx.HTTPError as e:
        raise HTTPException(status_code=502, detail=f"CMR API error: {e}")
