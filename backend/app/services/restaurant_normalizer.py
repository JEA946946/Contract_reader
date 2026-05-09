"""Normalize and save parsed restaurant menu rows to the database."""
from __future__ import annotations

from sqlalchemy.orm import Session
from sqlalchemy import select

from app.parsers.base import ParsedMenuRow
from app.models import Document, Restaurant, MenuPrice, MenuSeasonDate


def get_or_create_restaurant(
    db: Session,
    name: str,
    city: str,
    address: str | None = None,
    phone: str | None = None,
    email: str | None = None,
    cmr_supplier_id: str | None = None,
) -> Restaurant:
    """Find existing restaurant by name+city or create a new one."""
    stmt = select(Restaurant).where(Restaurant.name == name, Restaurant.city == city)
    restaurant = db.execute(stmt).scalar_one_or_none()
    if restaurant:
        if address and not restaurant.address:
            restaurant.address = address
        if phone and not restaurant.phone:
            restaurant.phone = phone
        if email and not restaurant.email:
            restaurant.email = email
        if cmr_supplier_id and not restaurant.cmr_supplier_id:
            restaurant.cmr_supplier_id = cmr_supplier_id
        return restaurant

    restaurant = Restaurant(
        name=name, city=city, address=address, phone=phone, email=email,
        cmr_supplier_id=cmr_supplier_id,
    )
    db.add(restaurant)
    db.flush()
    return restaurant


def save_parsed_menu_rows(rows: list[ParsedMenuRow], document: Document, db: Session) -> int:
    """Save parsed menu rows to Restaurant + MenuPrice + MenuSeasonDate tables."""
    count = 0
    for row in rows:
        restaurant_name = (row.restaurant_name or "").strip()
        if not restaurant_name:
            continue

        restaurant = get_or_create_restaurant(
            db, restaurant_name, row.city or "",
            address=row.address, phone=row.phone, email=row.email,
        )
        if not restaurant.source_document_id:
            restaurant.source_document_id = document.id

        menu_price = MenuPrice(
            document_id=document.id,
            restaurant_id=restaurant.id,
            menu_name=row.menu_name,
            description=row.description,
            lunch_price=row.lunch_price,
            dinner_price=row.dinner_price,
            lunch_child_price=row.lunch_child_price,
            dinner_child_price=row.dinner_child_price,
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
        db.add(menu_price)
        db.flush()

        for dr in row.date_ranges:
            if dr.date_from and dr.date_to:
                season_date = MenuSeasonDate(
                    menu_price_id=menu_price.id,
                    date_from=dr.date_from,
                    date_to=dr.date_to,
                )
                db.add(season_date)

        count += 1

    db.commit()
    return count
