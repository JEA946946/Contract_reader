from __future__ import annotations

import io
import pandas as pd
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import select

from app.models import Price, Hotel, SeasonDate


def get_prices_dataframe(
    db: Session,
    city: str | None = None,
    hotel_name: str | None = None,
    season_code: str | None = None,
) -> pd.DataFrame:
    stmt = (
        select(Price)
        .options(joinedload(Price.hotel), joinedload(Price.season_dates))
    )

    if city:
        stmt = stmt.join(Price.hotel).where(Hotel.city.ilike(f"%{city}%"))
    if hotel_name:
        if not city:
            stmt = stmt.join(Price.hotel)
        stmt = stmt.where(Hotel.name.ilike(f"%{hotel_name}%"))
    if season_code:
        stmt = stmt.where(Price.season_code == season_code)

    prices = db.execute(stmt).unique().scalars().all()

    rows = []
    for p in prices:
        date_ranges_str = "; ".join(
            f"{sd.date_from.strftime('%d-%m-%Y')} to {sd.date_to.strftime('%d-%m-%Y')}"
            for sd in p.season_dates
        )
        rows.append({
            "Hotel": p.hotel.name,
            "City": p.hotel.city,
            "Address": p.hotel.address,
            "Phone": p.hotel.phone,
            "Email": p.hotel.email,
            "Stars": p.hotel.stars,
            "Room Description": p.room_desc,
            "Meal Plan": p.meal_plan,
            "Double Price": float(p.double_price) if p.double_price else None,
            "Single Price": float(p.single_price) if p.single_price else None,
            "Twin Price": float(p.twin_price) if p.twin_price else None,
            "Triple Price": float(p.triple_price) if p.triple_price else None,
            "Quadruple Price": float(p.quadruple_price) if p.quadruple_price else None,
            "FIT/GIT": p.fit_git,
            "Season": p.season_code,
            "Date Ranges": date_ranges_str,
            "Baby Discount": p.baby_discount,
            "Child Discount": p.child_discount,
            "Min Stay": p.min_stay,
            "Note": p.note,
        })

    return pd.DataFrame(rows)


def export_csv(db: Session, **filters) -> io.BytesIO:
    df = get_prices_dataframe(db, **filters)
    buffer = io.BytesIO()
    df.to_csv(buffer, index=False, encoding="utf-8")
    buffer.seek(0)
    return buffer


def export_excel(db: Session, **filters) -> io.BytesIO:
    df = get_prices_dataframe(db, **filters)
    buffer = io.BytesIO()
    with pd.ExcelWriter(buffer, engine="openpyxl") as writer:
        df.to_excel(writer, index=False, sheet_name="Hotel Prices")
    buffer.seek(0)
    return buffer
