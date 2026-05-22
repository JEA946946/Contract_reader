from collections import defaultdict
from typing import Optional, List
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import select, func

from app.database import get_db
from app.models import Price, Hotel, SeasonDate
from app.schemas import PriceOut, PriceListResponse

router = APIRouter(prefix="/api/prices", tags=["prices"])


def _apply_filters(stmt, *, city, hotel_name, season_code, fit_git, hotel_type, price_min, price_max, search, exclude_pushed=False, needs_join=False):
    """Apply common WHERE filters to a query statement."""
    if city:
        stmt = stmt.where(Hotel.city.ilike(f"%{city}%"))
    if hotel_name:
        stmt = stmt.where(Hotel.name.ilike(f"%{hotel_name}%"))
    if season_code:
        stmt = stmt.where(Price.season_code == season_code)
    if fit_git:
        stmt = stmt.where(Price.fit_git == fit_git)
    if hotel_type:
        stmt = stmt.where(Hotel.type == hotel_type)
    if price_min is not None:
        stmt = stmt.where(Price.double_price >= price_min)
    if price_max is not None:
        stmt = stmt.where(Price.double_price <= price_max)
    if search:
        stmt = stmt.where(
            Hotel.name.ilike(f"%{search}%")
            | Hotel.city.ilike(f"%{search}%")
            | Price.room_desc.ilike(f"%{search}%")
        )
    if exclude_pushed:
        stmt = stmt.where(Hotel.cmr_supplier_id.is_(None))
    return stmt


@router.get("", response_model=PriceListResponse)
def list_prices(
    city: Optional[str] = Query(None),
    hotel_name: Optional[str] = Query(None),
    season_code: Optional[str] = Query(None),
    fit_git: Optional[str] = Query(None),
    hotel_type: Optional[str] = Query(None),
    price_min: Optional[float] = Query(None, ge=0),
    price_max: Optional[float] = Query(None, ge=0),
    search: Optional[str] = Query(None),
    exclude_pushed: Optional[bool] = Query(None),
    max_room_types: Optional[int] = Query(None, ge=1, le=10),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=500),
    db: Session = Depends(get_db),
):
    filter_kwargs = dict(city=city, hotel_name=hotel_name, season_code=season_code, fit_git=fit_git, hotel_type=hotel_type, price_min=price_min, price_max=price_max, search=search, exclude_pushed=bool(exclude_pushed))
    needs_join = bool(city or hotel_name or hotel_type or search or exclude_pushed)

    stmt = select(Price).options(joinedload(Price.hotel), joinedload(Price.season_dates))
    if needs_join:
        stmt = stmt.join(Price.hotel)
    stmt = _apply_filters(stmt, **filter_kwargs, needs_join=needs_join)

    if max_room_types:
        # Fetch all matching rows, then limit room types per hotel in Python
        all_prices = db.execute(stmt.order_by(Price.id)).unique().scalars().all()

        # For each hotel, keep the first N distinct room_desc values (by earliest id)
        hotel_allowed_rooms: dict[int, set[str | None]] = defaultdict(set)
        for p in all_prices:
            descs = hotel_allowed_rooms[p.hotel_id]
            if len(descs) < max_room_types:
                descs.add(p.room_desc)

        filtered = [
            p for p in all_prices
            if p.room_desc in hotel_allowed_rooms[p.hotel_id]
        ]
        total = len(filtered)
        offset = (page - 1) * page_size
        prices = filtered[offset:offset + page_size]
    else:
        # Standard path: SQL count + paginate
        count_stmt = select(func.count()).select_from(Price)
        if needs_join:
            count_stmt = count_stmt.join(Price.hotel)
        count_stmt = _apply_filters(count_stmt, **filter_kwargs, needs_join=needs_join)
        total = db.execute(count_stmt).scalar() or 0

        offset = (page - 1) * page_size
        stmt = stmt.offset(offset).limit(page_size)
        prices = db.execute(stmt).unique().scalars().all()

    return PriceListResponse(
        items=prices,
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/cities", response_model=List[str])
def list_cities(db: Session = Depends(get_db)):
    cities = db.execute(select(Hotel.city).distinct().order_by(Hotel.city)).scalars().all()
    return cities


@router.get("/types", response_model=List[str])
def list_types(db: Session = Depends(get_db)):
    types = (
        db.execute(
            select(Hotel.type)
            .where(Hotel.type.isnot(None), Hotel.type != "")
            .distinct()
            .order_by(Hotel.type)
        )
        .scalars()
        .all()
    )
    return types


@router.get("/seasons", response_model=List[str])
def list_seasons(db: Session = Depends(get_db)):
    seasons = (
        db.execute(
            select(Price.season_code)
            .where(Price.season_code.isnot(None))
            .distinct()
            .order_by(Price.season_code)
        )
        .scalars()
        .all()
    )
    return seasons
