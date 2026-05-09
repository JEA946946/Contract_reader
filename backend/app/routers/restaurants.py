"""REST API endpoints for restaurant menu prices."""
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import select, or_

from app.database import get_db
from app.models import Restaurant, MenuPrice
from app.schemas import MenuPriceOut, MenuPriceListResponse

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
