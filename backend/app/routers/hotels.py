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
