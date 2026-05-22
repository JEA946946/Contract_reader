"""REST API endpoints for restaurant menu prices."""
from datetime import date
from decimal import Decimal
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import select, or_

from app.database import get_db
from app.models import Restaurant, MenuPrice, MenuSeasonDate
from app.schemas import (
    MenuPriceOut,
    MenuPriceListResponse,
    ManualMenuRowSchema,
    CreateRestaurantRequest,
    CreateRestaurantResponse,
    RestaurantDetailOut,
)

router = APIRouter(prefix="/api/restaurants", tags=["restaurants"])


@router.get("", response_model=MenuPriceListResponse)
def list_menu_prices(
    city: Optional[str] = None,
    restaurant_name: Optional[str] = None,
    season_code: Optional[str] = None,
    search: Optional[str] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
):
    query = (
        db.query(MenuPrice)
        .join(Restaurant)
        .options(joinedload(MenuPrice.restaurant), joinedload(MenuPrice.season_dates))
    )

    if city:
        query = query.filter(Restaurant.city == city)
    if restaurant_name:
        query = query.filter(Restaurant.name == restaurant_name)
    if season_code:
        query = query.filter(MenuPrice.season_code == season_code)
    if search:
        pattern = f"%{search}%"
        query = query.filter(
            or_(
                Restaurant.name.ilike(pattern),
                Restaurant.city.ilike(pattern),
                MenuPrice.menu_name.ilike(pattern),
                MenuPrice.description.ilike(pattern),
            )
        )

    total = query.count()
    items = (
        query.order_by(Restaurant.name, MenuPrice.menu_name)
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )

    return MenuPriceListResponse(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/cities", response_model=List[str])
def get_restaurant_cities(db: Session = Depends(get_db)):
    result = db.execute(
        select(Restaurant.city).distinct().order_by(Restaurant.city)
    ).scalars().all()
    return list(result)


@router.get("/seasons", response_model=List[str])
def get_restaurant_seasons(db: Session = Depends(get_db)):
    result = db.execute(
        select(MenuPrice.season_code).distinct().order_by(MenuPrice.season_code)
    ).scalars().all()
    return [s for s in result if s]


def _save_menu_rows(rows: list[ManualMenuRowSchema], restaurant_id: int, db: Session, document_id: Optional[int] = None) -> int:
    count = 0
    for row in rows:
        mp = MenuPrice(
            document_id=document_id,
            restaurant_id=restaurant_id,
            menu_name=row.menu_name,
            description=row.description,
            lunch_price=Decimal(str(row.lunch_price)) if row.lunch_price is not None else None,
            dinner_price=Decimal(str(row.dinner_price)) if row.dinner_price is not None else None,
            lunch_child_price=Decimal(str(row.lunch_child_price)) if row.lunch_child_price is not None else None,
            dinner_child_price=Decimal(str(row.dinner_child_price)) if row.dinner_child_price is not None else None,
            course_1=row.course_1,
            course_2=row.course_2,
            course_3=row.course_3,
            course_4=row.course_4,
            course_5=row.course_5,
            min_pax=row.min_pax,
            drink_included=row.drink_included,
            season_code=row.season_code,
            note=row.note,
        )
        db.add(mp)
        db.flush()

        for dr in row.date_ranges:
            if dr.date_from and dr.date_to:
                sd = MenuSeasonDate(
                    menu_price_id=mp.id,
                    date_from=date.fromisoformat(dr.date_from),
                    date_to=date.fromisoformat(dr.date_to),
                )
                db.add(sd)

        count += 1
    return count


@router.get("/{restaurant_id}", response_model=RestaurantDetailOut)
def get_restaurant(restaurant_id: int, db: Session = Depends(get_db)):
    restaurant = (
        db.query(Restaurant)
        .options(
            joinedload(Restaurant.menu_prices).joinedload(MenuPrice.season_dates),
        )
        .filter(Restaurant.id == restaurant_id)
        .first()
    )
    if not restaurant:
        raise HTTPException(status_code=404, detail="Restaurant not found")
    return restaurant


@router.post("", response_model=CreateRestaurantResponse)
def create_restaurant(body: CreateRestaurantRequest, db: Session = Depends(get_db)):
    if not body.name or not body.city:
        raise HTTPException(status_code=400, detail="Restaurant name and city are required")

    restaurant = Restaurant(
        name=body.name,
        city=body.city,
        address=body.address,
        phone=body.phone,
        email=body.email,
    )
    db.add(restaurant)
    db.flush()

    count = _save_menu_rows(body.menu_prices, restaurant.id, db)
    db.commit()

    return CreateRestaurantResponse(
        restaurant_id=restaurant.id,
        restaurant_name=restaurant.name,
        price_count=count,
        message=f"Created restaurant '{restaurant.name}' with {count} menu price rows",
    )


@router.put("/{restaurant_id}", response_model=CreateRestaurantResponse)
def update_restaurant(restaurant_id: int, body: CreateRestaurantRequest, db: Session = Depends(get_db)):
    restaurant = db.query(Restaurant).filter(Restaurant.id == restaurant_id).first()
    if not restaurant:
        raise HTTPException(status_code=404, detail="Restaurant not found")

    restaurant.name = body.name
    restaurant.city = body.city
    restaurant.address = body.address
    restaurant.phone = body.phone
    restaurant.email = body.email

    # Preserve document_id from old prices
    old_prices = db.query(MenuPrice).filter(MenuPrice.restaurant_id == restaurant_id).all()
    preserved_doc_id = next(
        (p.document_id for p in old_prices if p.document_id is not None),
        None,
    )
    for p in old_prices:
        db.delete(p)
    db.flush()

    count = _save_menu_rows(body.menu_prices, restaurant.id, db, document_id=preserved_doc_id)
    db.commit()

    return CreateRestaurantResponse(
        restaurant_id=restaurant.id,
        restaurant_name=restaurant.name,
        price_count=count,
        message=f"Updated restaurant '{restaurant.name}' with {count} menu price rows",
    )


@router.delete("/{restaurant_id}")
def delete_restaurant(restaurant_id: int, db: Session = Depends(get_db)):
    restaurant = db.query(Restaurant).filter(Restaurant.id == restaurant_id).first()
    if not restaurant:
        raise HTTPException(status_code=404, detail="Restaurant not found")

    # Delete menu prices (cascades to season dates)
    db.query(MenuPrice).filter(MenuPrice.restaurant_id == restaurant_id).delete()
    db.delete(restaurant)
    db.commit()
    return {"message": "Restaurant deleted"}
