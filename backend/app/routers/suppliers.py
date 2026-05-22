"""Supplier linking endpoints — connect Hotel Price Reader entities to CMR suppliers."""

import httpx
from uuid import uuid4
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload
from typing import Optional

from app.database import get_db
from app.config import settings
from app.models import Hotel, Price, SeasonDate, Restaurant, MenuPrice, MenuSeasonDate, TransportCompany, TransportPrice

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

    headers = {"Host": "crm.vmmorocco.com"}
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


# ─── Push to CMR ───────────────────────────────────────────────────────────


def _push_to_cmr(payload: dict) -> dict:
    """POST to the CMR integrations/suppliers/push endpoint (creates or updates)."""
    if not settings.cmr_api_base:
        raise HTTPException(status_code=503, detail="CMR API not configured")

    try:
        resp = httpx.post(
            f"{settings.cmr_api_base}/integrations/suppliers/push",
            json=payload,
            headers={"Host": "crm.vmmorocco.com"},
            timeout=15.0,
        )
        resp.raise_for_status()
        return resp.json()
    except httpx.HTTPError as e:
        raise HTTPException(status_code=502, detail=f"CMR API error: {e}")


@router.post("/hotels/{hotel_id}/push-to-cmr")
def push_hotel_to_cmr(hotel_id: int, db: Session = Depends(get_db)):
    hotel = (
        db.query(Hotel)
        .options(joinedload(Hotel.prices).joinedload(Price.season_dates))
        .filter(Hotel.id == hotel_id)
        .first()
    )
    if not hotel:
        raise HTTPException(status_code=404, detail="Hotel not found")

    prices = hotel.prices
    min_stays = [p.min_stay for p in prices if p.min_stay]

    accommodation_data = {
        "etoiles": f"{hotel.stars}*" if hotel.stars else "",
        "type": hotel.type or "Hotel",
        "min_stay": min(min_stays) if min_stays else 1,
        "rates": [
            {
                "id": str(uuid4()),
                "room_type": p.room_desc or "",
                "meal_plan": p.meal_plan or "",
                "season": p.season_code or "",
                "fit_git": p.fit_git or "",
                "double_rate": float(p.double_price) if p.double_price is not None else 0,
                "single_rate": float(p.single_price) if p.single_price is not None else 0,
                "twin_rate": float(p.twin_price) if p.twin_price is not None else 0,
                "triple_rate": float(p.triple_price) if p.triple_price is not None else 0,
                "quadruple_rate": float(p.quadruple_price) if p.quadruple_price is not None else 0,
                "baby_discount": p.baby_discount or "",
                "child_discount": p.child_discount or "",
                "note": p.note or "",
                "date_ranges": [
                    {"from": str(sd.date_from), "to": str(sd.date_to)}
                    for sd in p.season_dates
                ],
            }
            for p in prices
        ],
    }

    # Pre-push dedup: if this hotel has no cmr_supplier_id yet, check if
    # another hotel with the same name+city already has one — reuse it
    supplier_id_to_send = hotel.cmr_supplier_id
    if not supplier_id_to_send and hotel.name:
        sibling = (
            db.query(Hotel)
            .filter(
                Hotel.id != hotel.id,
                func.lower(Hotel.name) == hotel.name.strip().lower(),
                func.lower(Hotel.city) == (hotel.city or "").strip().lower(),
                Hotel.cmr_supplier_id.isnot(None),
            )
            .first()
        )
        if sibling:
            supplier_id_to_send = sibling.cmr_supplier_id

    result = _push_to_cmr({
        "supplier_id": supplier_id_to_send,
        "company_name": hotel.name,
        "category": "Accommodation",
        "city": hotel.city or "",
        "phone": hotel.phone or "",
        "email": hotel.email or "",
        "address": hotel.address or "",
        "country": hotel.country or "",
        "postal_code": hotel.postal_code or "",
        "state": hotel.state or "",
        "accommodation_data": accommodation_data,
    })

    # Save the cmr_supplier_id if newly created
    cmr_id = result.get("data", {}).get("supplier_id")
    action = result.get("data", {}).get("action", "updated")
    if cmr_id and not hotel.cmr_supplier_id:
        hotel.cmr_supplier_id = cmr_id
        db.commit()

    return {
        "success": True,
        "message": f"{'Created' if action == 'created' else 'Updated'} CRM supplier with {len(prices)} rates",
        "action": action,
        "cmr_supplier_id": cmr_id,
        "rates_count": len(prices),
    }


@router.post("/restaurants/{restaurant_id}/push-to-cmr")
def push_restaurant_to_cmr(restaurant_id: int, db: Session = Depends(get_db)):
    restaurant = (
        db.query(Restaurant)
        .options(joinedload(Restaurant.menu_prices).joinedload(MenuPrice.season_dates))
        .filter(Restaurant.id == restaurant_id)
        .first()
    )
    if not restaurant:
        raise HTTPException(status_code=404, detail="Restaurant not found")

    menu_prices = restaurant.menu_prices

    accommodation_data = {
        "type": "Restaurant",
        "menus": [
            {
                "id": str(uuid4()),
                "menu_name": mp.menu_name or "",
                "description": mp.description or "",
                "lunch_price": float(mp.lunch_price) if mp.lunch_price is not None else 0,
                "dinner_price": float(mp.dinner_price) if mp.dinner_price is not None else 0,
                "lunch_child_price": float(mp.lunch_child_price) if mp.lunch_child_price is not None else 0,
                "dinner_child_price": float(mp.dinner_child_price) if mp.dinner_child_price is not None else 0,
                "course_1": mp.course_1 or "",
                "course_2": mp.course_2 or "",
                "course_3": mp.course_3 or "",
                "course_4": mp.course_4 or "",
                "course_5": mp.course_5 or "",
                "min_pax": mp.min_pax,
                "drink_included": mp.drink_included or "",
                "season": mp.season_code or "",
                "note": mp.note or "",
                "date_ranges": [
                    {"from": str(sd.date_from), "to": str(sd.date_to)}
                    for sd in mp.season_dates
                ],
            }
            for mp in menu_prices
        ],
    }

    result = _push_to_cmr({
        "supplier_id": restaurant.cmr_supplier_id,
        "company_name": restaurant.name,
        "category": "Restaurant",
        "city": restaurant.city or "",
        "phone": restaurant.phone or "",
        "email": restaurant.email or "",
        "accommodation_data": accommodation_data,
    })

    cmr_id = result.get("data", {}).get("supplier_id")
    action = result.get("data", {}).get("action", "updated")
    if cmr_id and not restaurant.cmr_supplier_id:
        restaurant.cmr_supplier_id = cmr_id
        db.commit()

    return {
        "success": True,
        "message": f"{'Created' if action == 'created' else 'Updated'} CRM supplier with {len(menu_prices)} menus",
        "action": action,
        "cmr_supplier_id": cmr_id,
        "menus_count": len(menu_prices),
    }


@router.post("/transport-companies/{company_id}/push-to-cmr")
def push_transport_to_cmr(company_id: int, db: Session = Depends(get_db)):
    company = (
        db.query(TransportCompany)
        .options(joinedload(TransportCompany.transport_prices))
        .filter(TransportCompany.id == company_id)
        .first()
    )
    if not company:
        raise HTTPException(status_code=404, detail="Transport company not found")

    transport_prices = company.transport_prices

    accommodation_data = {
        "type": "Transport",
        "routes": [
            {
                "id": str(uuid4()),
                "code": tp.code or "",
                "price": float(tp.price) if tp.price is not None else 0,
                "product": tp.product or "",
                "seater": tp.bus_size,
                "service_type": tp.service_type or "",
                "days": tp.days,
                "route_cities": tp.route_description or "",
                "note": tp.note or "",
                "city": tp.city or "",
            }
            for tp in transport_prices
        ],
    }

    result = _push_to_cmr({
        "supplier_id": company.cmr_supplier_id,
        "company_name": company.name,
        "category": "Transport",
        "city": company.city or "",
        "phone": company.phone or "",
        "email": company.email or "",
        "accommodation_data": accommodation_data,
    })

    cmr_id = result.get("data", {}).get("supplier_id")
    action = result.get("data", {}).get("action", "updated")
    if cmr_id and not company.cmr_supplier_id:
        company.cmr_supplier_id = cmr_id
        db.commit()

    return {
        "success": True,
        "message": f"{'Created' if action == 'created' else 'Updated'} CRM supplier with {len(transport_prices)} routes",
        "action": action,
        "cmr_supplier_id": cmr_id,
        "routes_count": len(transport_prices),
    }
