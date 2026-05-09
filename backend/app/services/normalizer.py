from __future__ import annotations

import re
from sqlalchemy.orm import Session
from sqlalchemy import select

from app.parsers.base import ParsedPriceRow
from app.models import Document, Hotel, Price, SeasonDate


def extract_stars_from_name(name: str) -> tuple:
    """Extract star count from hotel name and return (cleaned_name, stars).

    Handles multiple formats:
    - "Hotel TADDART ****"          -> ("Hotel TADDART", 4)
    - "Hotel TADDART 4*"            -> ("Hotel TADDART", 4)
    - "Hotel TADDART 4 étoiles"     -> ("Hotel TADDART", 4)
    - "Hotel TADDART 4 etoiles"     -> ("Hotel TADDART", 4)
    - "Hotel TADDART 4 stars"       -> ("Hotel TADDART", 4)
    - "Hotel TADDART ★★★★"         -> ("Hotel TADDART", 4)
    - "Hotel Amadil"                -> ("Hotel Amadil", None)
    """
    # Pattern 1: "4*" or "4 *" at end (check before bare asterisks)
    match = re.search(r'\s+([1-5])\s*\*\s*$', name)
    if match:
        return name[:match.start()].strip(), int(match.group(1))

    # Pattern 2: "4 étoiles" / "4 etoiles" / "4 stars" at end
    match = re.search(r'\s+([1-5])\s*(?:[ée]toiles?|stars?)\s*$', name, re.IGNORECASE)
    if match:
        return name[:match.start()].strip(), int(match.group(1))

    # Pattern 3: star icons ★ (Unicode)
    match = re.search(r'\s*([★]{1,5})\s*$', name)
    if match:
        return name[:match.start()].strip(), len(match.group(1))

    # Pattern 4: asterisks **** at end
    match = re.search(r'\s*(\*{1,5})\s*$', name)
    if match:
        return name[:match.start()].strip(), len(match.group(1))

    return name, None


def extract_hotel_and_room(accommodation: str) -> tuple:
    """Extract hotel name and room description from accommodation string.

    Handles two formats:
    1. Explicit separator: "Hotel TADDART **** - Suite Royale" -> ("Hotel TADDART", "Suite Royale")
    2. Concatenated: "Hotel Amadil Vue Jardin All In" -> ("Hotel Amadil", "Vue Jardin All In")
    """
    name = accommodation.strip()

    # Format 1: explicit " - " separator (from Word parser and similar)
    if " - " in name:
        parts = name.split(" - ", 1)
        hotel = parts[0].strip()
        room = parts[1].strip() if len(parts) > 1 else name
        return hotel, room

    # Format 2: try to split on room/meal keywords
    split_patterns = [
        r"\s+Std\s+",
        r"\s+Vue\s+",
        r"\s+Vu\s+",
        r"\s+All\s+In",
        r"\s+BB\b",
        r"\s+DP\b",
        r"\s+D\.P\b",
        r"\s+HB\b",
        r"\s+FB\b",
        r"\s+AI\b",
        r"\s+RO\b",
        r"\s+Sup[\s\-]",
        r"\s+Superior\s+",
        r"\s+Deluxe\s+",
        r"\s+Suite\s+",
        r"\s+Chambre\s+",
        r"\s+Room\s+",
    ]

    for pattern in split_patterns:
        match = re.search(pattern, name, re.IGNORECASE)
        if match:
            hotel = name[:match.start()].strip()
            room = name[match.start():].strip()
            if len(hotel) > 5:
                return hotel, room

    # No split found — whole string is hotel name, no room desc
    return name, ""


MEAL_PLAN_PATTERNS = [
    (re.compile(r'\bAll\s*In\b', re.IGNORECASE), 'AI'),
    (re.compile(r'\bA\.?I\.?\b'), 'AI'),
    (re.compile(r'\bF\.?B\.?\b'), 'FB'),
    (re.compile(r'\bFull\s*Board\b', re.IGNORECASE), 'FB'),
    (re.compile(r'\bPension\s+Compl[eè]te\b', re.IGNORECASE), 'FB'),
    (re.compile(r'\bH\.?B\.?\b'), 'HB'),
    (re.compile(r'\bHalf\s*Board\b', re.IGNORECASE), 'HB'),
    (re.compile(r'\bD\.?P\.?\b'), 'HB'),
    (re.compile(r'\bDemi\s*Pension\b', re.IGNORECASE), 'HB'),
    (re.compile(r'\bB\.?B\.?\b'), 'BB'),
    (re.compile(r'\bBed\s*(?:&|and)\s*Breakfast\b', re.IGNORECASE), 'BB'),
    (re.compile(r'\bR\.?O\.?\b'), 'RO'),
    (re.compile(r'\bRoom\s*Only\b', re.IGNORECASE), 'RO'),
]


def extract_meal_plan(room_desc: str) -> tuple:
    """Extract meal plan code from room description and return (meal_plan, cleaned_desc).

    Returns two-letter code: BB, HB, FB, AI, RO or None.
    Also strips the meal plan from the room description.
    """
    for pattern, code in MEAL_PLAN_PATTERNS:
        match = pattern.search(room_desc)
        if match:
            # Remove the meal plan text from room desc
            cleaned = room_desc[:match.start()] + room_desc[match.end():]
            # Clean up leftover "en" preposition before meal plan
            cleaned = re.sub(r'\s+en\s*$', '', cleaned, flags=re.IGNORECASE)
            cleaned = re.sub(r'\s+', ' ', cleaned).strip()
            return code, cleaned
    return None, room_desc


SEASON_NORMALIZE: list[tuple[re.Pattern, str]] = [
    # Single-letter codes
    (re.compile(r'^L$', re.IGNORECASE), 'Low'),
    (re.compile(r'^M$', re.IGNORECASE), 'Medium'),
    (re.compile(r'^H$', re.IGNORECASE), 'High'),
    (re.compile(r'^P$', re.IGNORECASE), 'Peak'),
    # French labels
    (re.compile(r'(?:saison\s+)?basse|basse\s+saison|saison\s+baisse', re.IGNORECASE), 'Low'),
    (re.compile(r'(?:saison\s+)?moyenne|moyenne\s+saison', re.IGNORECASE), 'Medium'),
    (re.compile(r'tr[eè]s\s+haute|peak', re.IGNORECASE), 'Peak'),
    (re.compile(r'(?:saison\s+)?haute|haute\s+saison', re.IGNORECASE), 'High'),
    # English labels (strip embedded dates)
    (re.compile(r'low\s+season', re.IGNORECASE), 'Low'),
    (re.compile(r'medium\s+season|mid\s+season', re.IGNORECASE), 'Medium'),
    (re.compile(r'high\s+season', re.IGNORECASE), 'High'),
    (re.compile(r'peak\s+season', re.IGNORECASE), 'Peak'),
    # Whole-year
    (re.compile(r'^all$|^all\s+year|^year[- ]round', re.IGNORECASE), 'All Year'),
]


def normalize_season_code(code: str | None) -> str | None:
    """Normalize season_code to a standard English label.

    Returns one of: Low, Medium, High, Peak, All Year, or None.
    Date-only codes (no text label) are left as-is for auto-detection.
    """
    if not code or not code.strip():
        return None

    code = code.strip()

    for pattern, label in SEASON_NORMALIZE:
        if pattern.search(code):
            return label

    # Year range like "2025-2026" → All Year
    if re.match(r'^\d{4}\s*[-–]\s*\d{4}$', code):
        return 'All Year'

    # Pure date strings (e.g. "01/03/2026-30/06/2026") — leave as-is
    # The frontend auto-detection will label these based on price comparison
    return code


def get_or_create_hotel(
    db: Session, name: str, city: str, stars: int | None, hotel_type: str | None,
    address: str | None = None, phone: str | None = None, email: str | None = None,
    cmr_supplier_id: str | None = None,
) -> Hotel:
    stmt = select(Hotel).where(Hotel.name == name, Hotel.city == city)
    hotel = db.execute(stmt).scalar_one_or_none()
    if hotel:
        if stars and not hotel.stars:
            hotel.stars = stars
        if hotel_type and not hotel.type:
            hotel.type = hotel_type
        if address and not hotel.address:
            hotel.address = address
        if phone and not hotel.phone:
            hotel.phone = phone
        if email and not hotel.email:
            hotel.email = email
        if cmr_supplier_id and not hotel.cmr_supplier_id:
            hotel.cmr_supplier_id = cmr_supplier_id
        return hotel

    hotel = Hotel(
        name=name, city=city, stars=stars, type=hotel_type,
        address=address, phone=phone, email=email,
        cmr_supplier_id=cmr_supplier_id,
    )
    db.add(hotel)
    db.flush()
    return hotel


def save_parsed_rows(rows: list[ParsedPriceRow], document: Document, db: Session) -> int:
    count = 0
    for row in rows:
        # Use room_desc from parser if available, otherwise extract from accommodation
        if row.room_desc:
            hotel_name = row.accommodation.strip()
            room_desc = row.room_desc.strip()
        else:
            hotel_name, room_desc = extract_hotel_and_room(row.accommodation)

        # Extract stars from hotel name (e.g. "Hotel TADDART ****" -> 4 stars)
        hotel_name, name_stars = extract_stars_from_name(hotel_name)
        stars = row.stars or name_stars

        # Extract meal plan from room desc or from parser
        meal_plan = row.meal_plan
        if not meal_plan:
            meal_plan, room_desc = extract_meal_plan(room_desc)

        hotel = get_or_create_hotel(
            db, hotel_name, row.city, stars, row.hotel_type,
            address=row.address, phone=row.phone, email=row.email,
        )
        if not hotel.source_document_id:
            hotel.source_document_id = document.id

        price = Price(
            document_id=document.id,
            hotel_id=hotel.id,
            room_desc=room_desc,
            meal_plan=meal_plan,
            double_price=row.double_price,
            single_price=row.single_price,
            twin_price=row.twin_price,
            triple_price=row.triple_price,
            quadruple_price=row.quadruple_price,
            fit_git=row.fit_git,
            season_code=normalize_season_code(row.season_code),
            baby_discount=row.baby_discount,
            child_discount=row.child_discount,
            min_stay=row.min_stay,
            note=row.note,
        )
        db.add(price)
        db.flush()

        for dr in row.date_ranges:
            season_date = SeasonDate(
                price_id=price.id,
                date_from=dr.date_from,
                date_to=dr.date_to,
            )
            db.add(season_date)

        count += 1

    db.commit()
    return count
