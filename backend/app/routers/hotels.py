from datetime import date
from decimal import Decimal
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.models import Hotel, Price, SeasonDate
from app.schemas import (
    CreateHotelWithPricesRequest,
    CreateHotelWithPricesResponse,
    HotelDetailOut,
    HotelOut,
    ManualPriceRowSchema,
)
from app.services.normalizer import get_or_create_hotel

router = APIRouter(prefix="/api/hotels", tags=["hotels"])


def _save_price_rows(rows: list[ManualPriceRowSchema], hotel_id: int, db: Session, document_id: Optional[int] = None) -> int:
    count = 0
    for row in rows:
        price = Price(
            document_id=document_id,
            hotel_id=hotel_id,
            room_desc=row.room_desc,
            meal_plan=row.meal_plan,
            double_price=Decimal(str(row.double_price)) if row.double_price is not None else None,
            single_price=Decimal(str(row.single_price)) if row.single_price is not None else None,
            twin_price=Decimal(str(row.twin_price)) if row.twin_price is not None else None,
            triple_price=Decimal(str(row.triple_price)) if row.triple_price is not None else None,
            quadruple_price=Decimal(str(row.quadruple_price)) if row.quadruple_price is not None else None,
            fit_git=row.fit_git,
            season_code=row.season_code,
            note=row.note,
        )
        db.add(price)
        db.flush()

        for dr in row.date_ranges:
            if dr.date_from and dr.date_to:
                season_date = SeasonDate(
                    price_id=price.id,
                    date_from=date.fromisoformat(dr.date_from),
                    date_to=date.fromisoformat(dr.date_to),
                )
                db.add(season_date)

        count += 1
    return count


@router.get("", response_model=List[HotelOut])
def list_hotels(db: Session = Depends(get_db)):
    hotels = db.query(Hotel).order_by(Hotel.name).all()
    return hotels


@router.get("/{hotel_id}", response_model=HotelDetailOut)
def get_hotel(hotel_id: int, db: Session = Depends(get_db)):
    hotel = (
        db.query(Hotel)
        .options(
            joinedload(Hotel.prices).joinedload(Price.season_dates),
        )
        .filter(Hotel.id == hotel_id)
        .first()
    )
    if not hotel:
        raise HTTPException(status_code=404, detail="Hotel not found")
    return hotel


@router.post("", response_model=CreateHotelWithPricesResponse)
def create_hotel_with_prices(body: CreateHotelWithPricesRequest, db: Session = Depends(get_db)):
    if not body.name or not body.city:
        raise HTTPException(status_code=400, detail="Hotel name and city are required")

    hotel = get_or_create_hotel(
        db,
        name=body.name,
        city=body.city,
        stars=body.stars,
        hotel_type=body.type,
        address=body.address,
        phone=body.phone,
        email=body.email,
        country=body.country,
        postal_code=body.postal_code,
        state=body.state,
    )

    count = _save_price_rows(body.prices, hotel.id, db)
    db.commit()

    return CreateHotelWithPricesResponse(
        hotel_id=hotel.id,
        hotel_name=hotel.name,
        price_count=count,
        message=f"Created hotel '{hotel.name}' with {count} price rows",
    )


@router.put("/{hotel_id}", response_model=CreateHotelWithPricesResponse)
def update_hotel_with_prices(hotel_id: int, body: CreateHotelWithPricesRequest, db: Session = Depends(get_db)):
    hotel = db.query(Hotel).filter(Hotel.id == hotel_id).first()
    if not hotel:
        raise HTTPException(status_code=404, detail="Hotel not found")

    # Update hotel info
    hotel.name = body.name
    hotel.city = body.city
    hotel.stars = body.stars
    hotel.type = body.type
    hotel.address = body.address
    hotel.phone = body.phone
    hotel.email = body.email
    hotel.country = body.country
    hotel.postal_code = body.postal_code
    hotel.state = body.state

    # Preserve the document_id from old prices so the "View contract" link survives edits
    old_prices = (
        db.query(Price)
        .filter(Price.hotel_id == hotel_id)
        .all()
    )
    preserved_doc_id = next(
        (p.document_id for p in old_prices if p.document_id is not None),
        None,
    )
    for p in old_prices:
        db.delete(p)
    db.flush()

    count = _save_price_rows(body.prices, hotel.id, db, document_id=preserved_doc_id)
    db.commit()

    return CreateHotelWithPricesResponse(
        hotel_id=hotel.id,
        hotel_name=hotel.name,
        price_count=count,
        message=f"Updated hotel '{hotel.name}' with {count} price rows",
    )


@router.post("/from-cmr")
def create_hotel_from_cmr(payload: dict, db: Session = Depends(get_db)):
    """Create a hotel from CMR supplier data format.
    If a hotel with the given cmr_supplier_id already exists, return it.
    """
    cmr_supplier_id = payload.get("cmr_supplier_id")
    if not cmr_supplier_id:
        raise HTTPException(status_code=400, detail="cmr_supplier_id is required")

    # Check if hotel already exists by cmr_supplier_id
    existing = db.query(Hotel).filter(Hotel.cmr_supplier_id == cmr_supplier_id).first()
    if existing:
        return {"id": existing.id, "name": existing.name, "created": False}

    company_name = payload.get("company_name", "").strip()
    city = payload.get("city", "").strip()
    if not company_name:
        raise HTTPException(status_code=400, detail="company_name is required")

    # Parse stars from accommodation_data.etoiles (e.g. "4*" -> 4)
    accom = payload.get("accommodation_data") or {}
    etoiles = accom.get("etoiles", "")
    stars = None
    if etoiles:
        digits = "".join(c for c in str(etoiles) if c.isdigit())
        if digits:
            stars = int(digits)

    hotel_type = accom.get("type") or None

    hotel = get_or_create_hotel(
        db,
        name=company_name,
        city=city or "Unknown",
        stars=stars,
        hotel_type=hotel_type,
        address=payload.get("address"),
        phone=payload.get("phone"),
        email=payload.get("email"),
        cmr_supplier_id=cmr_supplier_id,
    )

    # Convert CMR rates to Reader prices
    rates = accom.get("rates") or []
    count = 0
    for rate in rates:
        double_rate = rate.get("double_rate")
        single_rate = rate.get("single_rate")
        twin_rate = rate.get("twin_rate")
        triple_rate = rate.get("triple_rate")

        price = Price(
            hotel_id=hotel.id,
            room_desc=rate.get("room_type"),
            meal_plan=rate.get("meal_plan"),
            double_price=Decimal(str(double_rate)) if double_rate is not None else None,
            single_price=Decimal(str(single_rate)) if single_rate is not None else None,
            twin_price=Decimal(str(twin_rate)) if twin_rate is not None else None,
            triple_price=Decimal(str(triple_rate)) if triple_rate is not None else None,
            fit_git=rate.get("fit_git"),
            season_code=rate.get("season"),
            note=rate.get("note"),
        )
        db.add(price)
        db.flush()

        # Save date ranges as SeasonDate records
        date_ranges = rate.get("date_ranges") or []
        for dr in date_ranges:
            date_from = dr.get("from") or dr.get("date_from")
            date_to = dr.get("to") or dr.get("date_to")
            if date_from and date_to:
                try:
                    season_date = SeasonDate(
                        price_id=price.id,
                        date_from=date.fromisoformat(date_from),
                        date_to=date.fromisoformat(date_to),
                    )
                    db.add(season_date)
                except (ValueError, TypeError):
                    pass  # Skip invalid dates

        count += 1

    db.commit()
    return {"id": hotel.id, "name": hotel.name, "created": True, "price_count": count}


@router.delete("/{hotel_id}")
def delete_hotel(hotel_id: int, db: Session = Depends(get_db)):
    hotel = db.query(Hotel).filter(Hotel.id == hotel_id).first()
    if not hotel:
        raise HTTPException(status_code=404, detail="Hotel not found")

    # Delete season_dates first (FK to prices), then prices, then hotel
    price_ids = [p.id for p in db.query(Price.id).filter(Price.hotel_id == hotel_id).all()]
    if price_ids:
        db.query(SeasonDate).filter(SeasonDate.price_id.in_(price_ids)).delete(synchronize_session=False)
        db.query(Price).filter(Price.hotel_id == hotel_id).delete(synchronize_session=False)
    db.delete(hotel)
    db.commit()
    return {"message": f"Hotel '{hotel.name}' deleted"}
