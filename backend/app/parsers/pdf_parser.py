from __future__ import annotations

import re
import pdfplumber
import pandas as pd
from pathlib import Path
from datetime import date

from app.parsers.base import BaseParser, ParsedPriceRow, ParsedDateRange
from app.parsers.excel_parser import ExcelParser
from app.utils import parse_price

# French month names -> month numbers
FRENCH_MONTHS = {
    'janvier': 1, 'février': 2, 'fevrier': 2, 'mars': 3, 'avril': 4,
    'mai': 5, 'juin': 6, 'juillet': 7, 'août': 8, 'aout': 8,
    'septembre': 9, 'octobre': 10, 'novembre': 11, 'décembre': 12, 'decembre': 12,
}

# English month abbreviations -> month numbers
ENGLISH_MONTHS = {
    'jan': 1, 'feb': 2, 'mar': 3, 'apr': 4, 'may': 5, 'jun': 6,
    'jul': 7, 'aug': 8, 'sep': 9, 'oct': 10, 'nov': 11, 'dec': 12,
    'january': 1, 'february': 2, 'march': 3, 'april': 4, 'june': 6,
    'july': 7, 'august': 8, 'september': 9, 'october': 10, 'november': 11, 'december': 12,
}

# French → English season label translations
SEASON_TRANSLATIONS = {
    'basse saison': 'Low Season',
    'haute saison': 'High Season',
    'moyenne saison': 'Medium Season',
    'très haute saison': 'Peak Season',
    'tres haute saison': 'Peak Season',
    'saison basse': 'Low Season',
    'saison haute': 'High Season',
    'saison moyenne': 'Medium Season',
    'week-end': 'Weekend',
    'week end': 'Weekend',
    'week-day': 'Weekday',
    'week day': 'Weekday',
}


def _normalize_season_label(label: str) -> str:
    """Translate French season labels to English."""
    lower = label.strip().lower()
    # Direct match
    if lower in SEASON_TRANSLATIONS:
        return SEASON_TRANSLATIONS[lower]
    # Check if label starts with a French season name (e.g. "Basse Saison: ...")
    for fr, en in SEASON_TRANSLATIONS.items():
        if lower.startswith(fr):
            rest = label[len(fr):].strip().lstrip(':').strip()
            return f"{en}: {rest}" if rest else en
    return label


# Price pattern: number followed by MAD/Dhs/DHS
PRICE_RE = re.compile(r'([\d\s.,]+)\s*(?:MAD|Dhs|DHS)', re.IGNORECASE)

# Lines to skip (taxes, demi-pension supplements, non-room items)
SKIP_PATTERNS = [
    re.compile(r'taxe', re.IGNORECASE),
    re.compile(r't\.?p\.?t', re.IGNORECASE),
    re.compile(r'suppl[ée]ment\s+demi', re.IGNORECASE),
    re.compile(r'demi[\s-]*pension', re.IGNORECASE),
    re.compile(r'pension\s+soft', re.IGNORECASE),
    re.compile(r'soft[s]?\s+inclus', re.IGNORECASE),
    re.compile(r'petit[\s-]*d[ée]jeuner', re.IGNORECASE),
    re.compile(r'nos\s+prix\s+s', re.IGNORECASE),
    re.compile(r'hors\s+boissons', re.IGNORECASE),
    re.compile(r'boissons\s+soft', re.IGNORECASE),
    re.compile(r'navette', re.IGNORECASE),
    re.compile(r'promotion\s+touristique', re.IGNORECASE),
    re.compile(r'capital\s+de', re.IGNORECASE),
    re.compile(r'eau\s+plate', re.IGNORECASE),
]

# Known Moroccan cities for detection
CITIES_RE = re.compile(
    r'(?:casablanca|rabat|marrakech|agadir|tanger|tangier|fes|fez|meknes|meknès|'
    r'ouarzazate|essaouira|tetouan|chefchaouen|dakhla|kenitra|mohammedia|'
    r'safi|el\s*jadida|nador|oujda|ifrane|midelt|errachidia|beni\s*mellal|'
    r'nouaceur|sidi\s*maarouf|airport|erfoud|tinghir|zagora|merzouga|taroudant|'
    r'oualidia|azrou|taza|guelmim|tan[\s-]*tan|laayoune|fnideq|asilah|larache)',
    re.IGNORECASE
)


def parse_french_date(text: str):
    """Parse French date like '1er Novembre 2025' or '31 Octobre 2026'."""
    m = re.search(
        r'(\d{1,2})(?:er)?\s+(\w+)\s+(\d{4})', text, re.IGNORECASE
    )
    if m:
        day = int(m.group(1))
        month_name = m.group(2).lower()
        year = int(m.group(3))
        month = FRENCH_MONTHS.get(month_name)
        if month:
            try:
                return date(year, month, day)
            except ValueError:
                pass
    return None


def parse_date_dd_mm_yyyy(text: str):
    """Parse date like '15/12/2025' or '01/11/2025'."""
    m = re.search(r'(\d{2})/(\d{2})/(\d{4})', text)
    if m:
        try:
            return date(int(m.group(3)), int(m.group(2)), int(m.group(1)))
        except ValueError:
            pass
    return None


def extract_contract_dates(lines: list[str]) -> list[ParsedDateRange]:
    """Extract date ranges like 'Du 1er Novembre 2025 au 31 Octobre 2026'."""
    ranges = []
    full_text = ' '.join(lines)

    # French format with month names: Du 1er Novembre 2025 au 31 Octobre 2026
    for m in re.finditer(
        r'[Dd]u\s+(\d{1,2}(?:er)?\s+\w+\s+\d{4})\s+au\s+(\d{1,2}(?:er)?\s+\w+\s+\d{4})',
        full_text
    ):
        d_from = parse_french_date(m.group(1))
        d_to = parse_french_date(m.group(2))
        if d_from and d_to:
            ranges.append(ParsedDateRange(date_from=d_from, date_to=d_to))
            break  # Use first contract-level date range

    # Numeric format: DU 01/11/2026 AU 31/10/2027
    if not ranges:
        for m in re.finditer(
            r'[Dd][Uu]\s+(\d{2}/\d{2}/\d{4})\s+[Aa][Uu]\s+(\d{2}/\d{2}/\d{4})',
            full_text
        ):
            d_from = parse_date_dd_mm_yyyy(m.group(1))
            d_to = parse_date_dd_mm_yyyy(m.group(2))
            if d_from and d_to:
                ranges.append(ParsedDateRange(date_from=d_from, date_to=d_to))
                break

    return ranges


def extract_season_dates(lines: list[str]) -> dict:
    """Extract season-specific date ranges from text.

    Returns dict like {'L': [ParsedDateRange, ...], 'H': [ParsedDateRange, ...]}
    """
    seasons = {}
    full_text = ' '.join(lines)

    # Look for structured season date blocks
    # "Basse Saison" / "Haute Saison" followed by date ranges
    for label, code in [('basse', 'L'), ('haute', 'H'), ('week.?end', 'L'), ('week.?day', 'H')]:
        pattern = re.compile(
            label + r's?\s*[:\*]?\s*((?:\d{2}/\d{2}/\d{4}.*?)+)',
            re.IGNORECASE | re.DOTALL
        )
        m = pattern.search(full_text)
        if m:
            date_text = m.group(1)
            date_ranges = []
            for dm in re.finditer(r'[Dd]u\s+(\d{2}/\d{2}/\d{4})\s+au\s+(\d{2}/\d{2}/\d{4})', date_text):
                d_from = parse_date_dd_mm_yyyy(dm.group(1))
                d_to = parse_date_dd_mm_yyyy(dm.group(2))
                if d_from and d_to:
                    date_ranges.append(ParsedDateRange(date_from=d_from, date_to=d_to))
            if date_ranges:
                seasons[code] = date_ranges

    return seasons


def detect_hotel_from_page(lines: list[str]):
    """Detect hotel name, stars, and city from the first lines of a page.

    Returns (hotel_name, stars, city) or (None, None, None).
    """
    for line in lines[:8]:
        line = line.strip()
        if not line or len(line) < 5:
            continue

        # Skip known non-hotel lines
        if any(skip in line.upper() for skip in [
            'ANNEXE', 'TARIFS PREFERENTIELS', 'HORS PERIODE',
            'CONTRAT', 'ARTICLE', 'GRILLES', 'AGENCE', 'ENTRE',
            'SOCIETE', 'SOCIÉTÉ', 'REPRESENTEE', 'REPRÉSENTÉE',
            'FIT 20', 'VOYAGISTE',
        ]):
            continue

        # Look for hotel name pattern: text followed by stars
        # E.g. "LE SQUARE BY ONOMO COLLECTION 5*" or "ONOMO CASABLANCA CITY CENTER 4*"
        # Or without stars: "ONOMO RABAT TERMINUS"
        hotel_match = re.match(
            r'^([A-ZÀ-Ü][A-ZÀ-Ü\s\'\-]+?)(?:\s+(\d)\s*\*|(?:\s+(\*{1,5})))\s*$',
            line
        )
        if hotel_match:
            name = hotel_match.group(1).strip()
            stars = int(hotel_match.group(2)) if hotel_match.group(2) else len(hotel_match.group(3))
            city = extract_city_from_name(name)
            return name, stars, city

        # Hotel name without stars (all caps, substantial length)
        if re.match(r'^[A-ZÀ-Ü][A-ZÀ-Ü\s\'\-]{10,}$', line):
            # Check it's not a section header
            if not any(kw in line.upper() for kw in ['TARIF', 'CONDITION', 'COMMISSION', 'ARTICLE']):
                name = line.strip()
                city = extract_city_from_name(name)
                return name, None, city

    return None, None, None


def extract_city_from_name(hotel_name: str) -> str:
    """Extract city from hotel name like 'ONOMO CASABLANCA CITY CENTER'."""
    m = CITIES_RE.search(hotel_name)
    if m:
        city = m.group(0).strip()
        # Normalize city names
        city_map = {
            'airport': 'Casablanca',
            'nouaceur': 'Casablanca',
            'sidi maarouf': 'Casablanca',
            'tanger med': 'Tanger',
        }
        for key, val in city_map.items():
            if key in city.lower():
                return val
        return city.title()
    return ""


def extract_city_from_page_text(lines: list[str]) -> str:
    """Try to find city from full page text (e.g. in contact info or addresses)."""
    full = ' '.join(lines)
    m = CITIES_RE.search(full)
    if m:
        city = m.group(0).strip()
        city_map = {
            'airport': 'Casablanca',
            'nouaceur': 'Casablanca',
            'sidi maarouf': 'Casablanca',
            'tanger med': 'Tanger',
        }
        for key, val in city_map.items():
            if key in city.lower():
                return val
        return city.title()
    return ""


def detect_season_type(lines: list[str]) -> str:
    """Detect pricing structure: 'flat', 'low_high', or 'weekend_weekday'.

    Returns the type and the season labels found.
    """
    text = ' '.join(lines[:15]).upper()

    if 'BASSE SAISON' in text and 'HAUTE SAISON' in text:
        return 'low_high'
    if 'WEEK END' in text or 'WEEK-END' in text:
        if 'WEEK DAY' in text or 'WEEK-DAY' in text:
            return 'weekend_weekday'
    if '*FLAT*' in text or 'FLAT' in text:
        return 'flat'

    return 'flat'


def should_skip_line(line: str) -> bool:
    """Check if a line should be skipped (taxes, supplements for demi-pension, etc.)."""
    for pat in SKIP_PATTERNS:
        if pat.search(line):
            return True
    return False


def parse_moroccan_price(raw: str):
    """Parse a price in Moroccan format where period is thousands separator.

    "1.100" = 1100, "3.000" = 3000, "19,80" = 19.80, "880" = 880
    """
    from decimal import Decimal, InvalidOperation
    s = raw.strip()
    s = re.sub(r'\s+', '', s)  # Remove spaces within number

    # If period followed by exactly 3 digits → thousands separator
    if re.match(r'^\d{1,3}(\.\d{3})+$', s):
        s = s.replace('.', '')  # Remove thousands separator
    elif ',' in s:
        # Comma is decimal separator in French
        s = s.replace('.', '')  # Remove thousands separator
        s = s.replace(',', '.')  # Convert decimal

    try:
        return Decimal(s)
    except (InvalidOperation, ValueError):
        return None


def extract_prices_from_line(line: str) -> list:
    """Extract all MAD/Dhs prices from a line.

    Returns list of Decimal values.
    """
    prices = []
    for m in PRICE_RE.finditer(line):
        p = parse_moroccan_price(m.group(1))
        if p:
            prices.append(p)
    return prices


def extract_contact_from_lines(lines: list[str]):
    """Extract phone and email from page text."""
    phone = ""
    email = ""
    full = ' '.join(lines)

    # Email
    em = re.search(r'reservation[\w.]*@[\w.]+\.\w+', full, re.IGNORECASE)
    if em:
        email = em.group(0)
    elif not email:
        em = re.search(r'[\w.+-]+@[\w.-]+\.\w+', full)
        if em:
            email = em.group(0)

    # Phone
    ph = re.search(r'[Tt][ée]l[ée]?(?:phone)?\s*:\s*([+\d\s()/\-]+)', full)
    if ph:
        phone = ph.group(1).strip().rstrip('/')

    return phone, email


def clean_room_desc(desc: str) -> str:
    """Clean up a room description extracted from text."""
    # Remove leading labels
    desc = re.sub(r'(?:Votre\s+Tarif\s+Corporate\s*)', '', desc, flags=re.IGNORECASE)
    desc = re.sub(r'^(?:Tarifs?\s+individuels?\s*)', '', desc, flags=re.IGNORECASE)
    # Remove "en BB/DP" from description (meal plan is extracted separately)
    desc = re.sub(r'\s+en\s+(?:BB|DP|HB|FB|AI)\b', '', desc, flags=re.IGNORECASE)
    # Remove trailing whitespace and punctuation
    desc = desc.strip().rstrip(':').strip()
    # Collapse multiple spaces
    desc = re.sub(r'\s+', ' ', desc)
    return desc


def parse_chain_contract_pages(pdf) -> list[ParsedPriceRow]:
    """Parse a multi-hotel chain contract PDF by reading page text."""
    all_rows = []

    # First pass: find global contract date range
    global_dates = []
    for page in pdf.pages[:6]:
        text = page.extract_text()
        if text:
            dates = extract_contract_dates(text.split('\n'))
            if dates:
                global_dates = dates
                break

    for page in pdf.pages:
        text = page.extract_text()
        if not text:
            continue

        lines = text.split('\n')

        # Detect hotel on this page
        hotel_name, stars, city = detect_hotel_from_page(lines)
        if not hotel_name:
            continue

        # Fallback city detection from full page text
        if not city:
            city = extract_city_from_page_text(lines)

        # Detect season type
        season_type = detect_season_type(lines)

        # Extract season-specific dates from season date tables
        season_date_map = extract_season_dates(lines)

        # Page-level date ranges (if present)
        page_dates = extract_contract_dates(lines)
        if not page_dates:
            page_dates = global_dates

        # Extract contact info
        phone, email = extract_contact_from_lines(lines)

        # Parse price lines
        current_room = ""
        pending_label = ""  # For multi-line room descriptions
        in_contact_section = False

        for line in lines:
            stripped = line.strip()
            if not stripped:
                continue

            # Stop parsing prices once we hit contact section
            if re.search(r'contact\s+r[ée]servation', stripped, re.IGNORECASE):
                in_contact_section = True
                continue
            if in_contact_section:
                continue

            # Skip irrelevant lines
            if should_skip_line(stripped):
                pending_label = ""
                continue

            # Skip header/title lines
            if stripped.upper() == hotel_name or 'TARIFS PREFERENTIELS' in stripped.upper():
                continue
            if 'HORS PERIODE' in stripped.upper() or 'CAN 25' in stripped.upper():
                continue
            if re.match(r'^ANNEXE\s', stripped, re.IGNORECASE):
                continue
            if 'Chambre Single en BB' in stripped:
                continue
            if re.match(r'^Du\s+\d', stripped):
                continue
            if re.match(r'^\(\*\)', stripped):
                continue
            if 'BASSE SAISON' in stripped.upper() or 'HAUTE SAISON' in stripped.upper():
                continue
            if 'WEEK END' in stripped.upper() or 'WEEK DAY' in stripped.upper():
                continue
            if re.match(r'^\*?FLAT\*?$', stripped, re.IGNORECASE):
                continue
            # Skip lines that look like corporate label text
            if re.match(r'^(?:avec\s+petit|buffet$)', stripped, re.IGNORECASE):
                continue

            # Extract prices from this line
            prices = extract_prices_from_line(stripped)

            if prices:
                # Get room description: text before the first price
                desc_part = PRICE_RE.split(stripped)[0].strip()

                if desc_part:
                    # If there was a pending multi-line label, merge
                    if pending_label:
                        current_room = f"{pending_label} {desc_part}"
                        pending_label = ""
                    else:
                        current_room = desc_part
                elif pending_label:
                    # Price-only line, use pending label
                    current_room = pending_label
                    pending_label = ""

                room = clean_room_desc(current_room)

                if not room:
                    room = "Chambre Standard"

                # Determine if this is a supplement
                is_supplement = bool(re.search(
                    r'suppl[ée]ment.*(?:double|2[èe]me|2nde|personne)',
                    room, re.IGNORECASE
                ))
                is_room_supplement = bool(re.search(
                    r'suppl[ée]ment.*(?:chambre|sup[ée]rieur)',
                    room, re.IGNORECASE
                ))

                # Build rows based on season type
                if season_type == 'flat':
                    price_val = prices[0]
                    row = ParsedPriceRow(
                        accommodation=f"{hotel_name} - {room}",
                        city=city,
                        single_price=None if is_supplement else price_val,
                        double_price=price_val if is_supplement else None,
                        stars=stars,
                        meal_plan='BB',
                        fit_git='I',
                        season_code=None,
                        date_ranges=page_dates[:],
                        note='Double supplement' if is_supplement else (
                            'Superior room supplement' if is_room_supplement else None
                        ),
                        phone=phone,
                        email=email,
                    )
                    all_rows.append(row)

                elif season_type in ('low_high', 'weekend_weekday'):
                    season_codes = ['L', 'H']
                    for idx, code in enumerate(season_codes):
                        if idx < len(prices):
                            price_val = prices[idx]
                        else:
                            price_val = prices[0]  # Flat for this line

                        # Get season-specific dates
                        date_ranges = season_date_map.get(code, page_dates[:])

                        row = ParsedPriceRow(
                            accommodation=f"{hotel_name} - {room}",
                            city=city,
                            single_price=None if is_supplement else price_val,
                            double_price=price_val if is_supplement else None,
                            stars=stars,
                            meal_plan='BB',
                            fit_git='I',
                            season_code=code,
                            date_ranges=date_ranges[:] if date_ranges else page_dates[:],
                            note='Double supplement' if is_supplement else (
                                'Superior room supplement' if is_room_supplement else None
                            ),
                            phone=phone,
                            email=email,
                        )
                        all_rows.append(row)

            else:
                # No price on this line — might be a room label or continuation
                desc = stripped.strip()
                if desc and not re.match(r'^[\(\*]', desc) and len(desc) > 2:
                    is_room_label = any(kw in desc.lower() for kw in [
                        'chambre', 'suite', 'supérieur', 'superieur', 'confort',
                        'deluxe', 'luxe', 'standard', 'tarif', 'individuel',
                        'supplément', 'supplement', 'junior', 'familiale',
                    ])
                    if is_room_label:
                        if pending_label:
                            # Merge continuation into existing pending label
                            pending_label = f"{pending_label} {desc}"
                        elif desc[0].isupper():
                            # Only start a new pending label from uppercase lines
                            # (avoids stray lowercase fragments from pdfplumber)
                            pending_label = desc
                    elif pending_label and desc[0].isupper():
                        # Uppercase continuation of a pending label
                        pending_label = f"{pending_label} {desc}"

    # Post-process: calculate double prices from supplements
    all_rows = apply_double_supplements(all_rows)

    return all_rows


def apply_double_supplements(rows: list[ParsedPriceRow]) -> list[ParsedPriceRow]:
    """Calculate double_price = single_price + supplement for each hotel.

    Finds 'Supplément double' rows per hotel+season, applies the supplement
    to all room rows, and removes the supplement rows.
    """
    from collections import defaultdict

    # Group rows by hotel name
    hotel_groups = defaultdict(list)
    for r in rows:
        hotel_name = r.accommodation.split(' - ')[0] if ' - ' in r.accommodation else r.accommodation
        hotel_groups[hotel_name].append(r)

    result = []
    for hotel_name, hotel_rows in hotel_groups.items():
        # Find double supplement amounts per season code
        supplements = {}  # season_code -> supplement amount
        supplement_rows = []
        room_rows = []

        for r in hotel_rows:
            if r.note and 'supplément double' in r.note.lower():
                # This is a double supplement row
                supplement_amount = r.double_price
                supplements[r.season_code] = supplement_amount
                supplement_rows.append(r)
            else:
                room_rows.append(r)

        # Apply supplements to room rows
        for r in room_rows:
            if r.single_price and r.single_price > 0:
                supp = supplements.get(r.season_code)
                if supp is None:
                    # Try flat supplement (season_code=None)
                    supp = supplements.get(None)
                if supp:
                    r.double_price = r.single_price + supp

        result.extend(room_rows)

    return result


def _find_header_row_index(table: list[list]) -> int:
    """Find the actual header row, skipping title/super-header rows with mostly empty cells."""
    for i, row in enumerate(table):
        non_empty = sum(1 for cell in row if cell and str(cell).strip())
        if non_empty >= len(row) * 0.5:
            return i
    return 0


def _parse_dd_mm(dd_mm: str, year: int) -> date | None:
    """Parse a DD/MM string into a date using the given year."""
    m = re.match(r'(\d{1,2})/(\d{1,2})', dd_mm.strip())
    if not m:
        return None
    day, month = int(m.group(1)), int(m.group(2))
    try:
        return date(year, month, day)
    except ValueError:
        return None


def _extract_date_ranges_from_header(header_text: str, year: int) -> list[ParsedDateRange]:
    """Parse date ranges from a column header like '07/01- 28/02\\n01/07-30/09'.

    All dates use the current/latest year.  Cross-year ranges (e.g. Dec 24 –
    Jan 6) push the end date into year+1.
    """
    ranges = []
    for m in re.finditer(r'(\d{1,2}/\d{1,2})\s*-\s*(\d{1,2}/\d{1,2})', header_text):
        d_from = _parse_dd_mm(m.group(1), year)
        d_to = _parse_dd_mm(m.group(2), year)
        if d_from and d_to:
            if d_from > d_to:
                d_to = d_to.replace(year=year + 1)
            ranges.append(ParsedDateRange(date_from=d_from, date_to=d_to))
    ranges.sort(key=lambda r: r.date_from)
    return ranges


def _parse_english_season_dates(date_text: str) -> list[ParsedDateRange]:
    """Parse English date ranges like '05 to 31 Jan 2026 ● 01 Jun to 31 Aug 2026'.

    Handles:
    - Same-month: "05 to 31 Jan [2026]"
    - Cross-month: "01 Jun [2026] to 31 Aug [2026]"
    - Cross-year: "21 Dec to 05 Jan 2027"
    - Inline years override the base year.
    - Two-pass: first determines the base operating year from explicit years
      (e.g. "21 Dec to 05 Jan 2027" → base year is 2026), then applies it
      to ranges without inline years.
    """
    # Regex patterns used in both passes
    PAT_A = re.compile(
        r'\b(\d{1,2})\s+([A-Za-z]+)\s+(?:(\d{4})\s+)?to\s+(\d{1,2})\s+([A-Za-z]+)(?:\s+(\d{4}))?'
    )
    PAT_B = re.compile(
        r'\b(\d{1,2})\s+to\s+(\d{1,2})\s+([A-Za-z]+)(?:\s+(\d{4}))?'
    )

    segments = [s.strip() for s in re.split(r'[●•]', date_text) if s.strip()]

    # --- Pass 1: determine base_year from segments with explicit years ---
    # A cross-year range like "21 Dec to 05 Jan 2027" tells us the base
    # operating year is 2026 (= end_year - 1).  A same-year range like
    # "01 Jun to 31 Aug 2026" tells us the base year is 2026 directly.
    base_year = None
    for seg in segments:
        m = PAT_A.search(seg)
        if m:
            mf = ENGLISH_MONTHS.get(m.group(2).lower()[:3])
            mt = ENGLISH_MONTHS.get(m.group(5).lower()[:3])
            yt = int(m.group(6)) if m.group(6) else None
            yf = int(m.group(3)) if m.group(3) else None
            if yt and mf and mt and mt < mf:
                # Cross-year with explicit end year → base = end - 1
                base_year = yt - 1
                break
            if yt and base_year is None:
                base_year = yt
            if yf and base_year is None:
                base_year = yf
            continue
        m = PAT_B.search(seg)
        if m and m.group(4) and base_year is None:
            base_year = int(m.group(4))

    if base_year is None:
        base_year = date.today().year

    # --- Pass 2: build date ranges ---
    ranges: list[ParsedDateRange] = []

    for seg in segments:
        # Pattern A: "DD Mon [YYYY] to DD Mon [YYYY]" (cross-month / cross-year)
        m = PAT_A.search(seg)
        if m:
            mf = ENGLISH_MONTHS.get(m.group(2).lower()[:3])
            mt = ENGLISH_MONTHS.get(m.group(5).lower()[:3])
            if mf and mt:
                yf_inline = int(m.group(3)) if m.group(3) else None
                yt_inline = int(m.group(6)) if m.group(6) else None

                if yf_inline and yt_inline:
                    yf, yt = yf_inline, yt_inline
                elif yt_inline:
                    yf = yt_inline - 1 if mt < mf else yt_inline
                    yt = yt_inline
                elif yf_inline:
                    yt = yf_inline + 1 if mt < mf else yf_inline
                    yf = yf_inline
                else:
                    yf = base_year
                    yt = base_year + 1 if mt < mf else base_year

                try:
                    ranges.append(ParsedDateRange(
                        date_from=date(yf, mf, int(m.group(1))),
                        date_to=date(yt, mt, int(m.group(4))),
                    ))
                except ValueError:
                    pass
            continue

        # Pattern B: "DD to DD Mon [YYYY]" (same-month)
        m = PAT_B.search(seg)
        if m:
            mon = ENGLISH_MONTHS.get(m.group(3).lower()[:3])
            if mon:
                y = int(m.group(4)) if m.group(4) else base_year
                try:
                    ranges.append(ParsedDateRange(
                        date_from=date(y, mon, int(m.group(1))),
                        date_to=date(y, mon, int(m.group(2))),
                    ))
                except ValueError:
                    pass

    ranges.sort(key=lambda r: r.date_from)
    return ranges


def _extract_hotel_info_from_page_text(lines: list[str]) -> tuple[str, str | None, str, str | None]:
    """Extract (hotel_name, stars, city, meal_plan) from page text.

    Looks for hotel-name-style lines, skipping agency/company names (containing
    SARL, SA, SAS, etc.), and finds city and meal-plan mentions.
    """
    hotel_name = ""
    stars = None
    city = ""
    meal_plan = None
    company_re = re.compile(r'\b(?:SARL|SA\b|SAS\b|EURL|LLC|S\.?A\.?R\.?L)', re.IGNORECASE)

    skip_words_upper = [
        'SPECIAL NET', 'PRICES', 'DESCRIPTION', 'COMPOSITION',
        'NIGHTLY', 'SUPPLEMENT', 'CONDITION', 'PAYMENT', 'NOTE',
        'INCLUD', 'TOURIST', 'ALL RATE', 'CHILD',
    ]

    # Find hotel name from first ~10 lines
    for line in lines[:10]:
        stripped = line.strip()
        if not stripped or len(stripped) < 4:
            continue
        # Skip company names
        if company_re.search(stripped):
            continue
        # Skip email/phone/ICE lines
        if re.match(r'^(mail:|tel\b|N\.\s*ICE|http)', stripped, re.IGNORECASE):
            continue
        # Skip section headers
        if any(kw in stripped.upper() for kw in skip_words_upper):
            continue

        # Pattern: "Hotel Name (Agent) Rates 20XX" or "Hotel Name Tarifs 20XX"
        rates_match = re.match(
            r'^(.+?)\s+(?:\(.*?\)\s+)?(?:Rates|RATES|Tarifs?|TARIFS?)\s+\d{4}',
            stripped, re.IGNORECASE,
        )
        if rates_match and not hotel_name:
            candidate = rates_match.group(1).strip()
            # Remove agency markers like "STO", "(Agent)"
            candidate = re.sub(r'\s*\(.*?\)\s*', ' ', candidate)
            candidate = re.sub(r'\s+(?:STO|LTD|INC)\b', '', candidate, flags=re.IGNORECASE)
            candidate = candidate.strip()
            if len(candidate) >= 4 and not company_re.search(candidate):
                hotel_name = candidate
            continue

        # Candidate hotel name: prominent text, mostly uppercase
        if re.match(r'^[A-ZÀ-Ü][A-ZÀ-Ü\s\'\-]+$', stripped) and len(stripped) >= 4:
            # Check for star rating
            star_match = re.search(r'(\d)\s*\*', stripped)
            if star_match:
                stars = int(star_match.group(1))
                stripped = re.sub(r'\s*\d\s*\*\s*', '', stripped).strip()
            if not hotel_name:
                hotel_name = stripped
            continue

    # Find city from full page text — prefer real city names over proxy words
    full = ' '.join(lines)
    proxy_words = {'airport', 'nouaceur', 'sidi maarouf'}
    city_map = {
        'airport': 'Casablanca', 'nouaceur': 'Casablanca',
        'sidi maarouf': 'Casablanca', 'tanger med': 'Tanger',
    }
    all_city_matches = CITIES_RE.findall(full)
    real_cities = [m for m in all_city_matches if m.strip().lower() not in proxy_words]
    if real_cities:
        city = real_cities[0].strip().title()
    elif all_city_matches:
        raw = all_city_matches[0].strip().lower()
        city = city_map.get(raw, raw.title())

    # Find meal plan
    if re.search(r'\binclude.*\bbreakfast\b', full, re.IGNORECASE):
        meal_plan = 'BB'
    elif re.search(r'\bincludes?\s+BB\b', full, re.IGNORECASE):
        meal_plan = 'BB'
    elif re.search(r'\bBB\b', full) and re.search(r'rate.*includes|includes.*BB', full, re.IGNORECASE):
        meal_plan = 'BB'
    elif re.search(r'\bHB\b', full):
        meal_plan = 'HB'

    return hotel_name, stars, city, meal_plan


def _extract_current_year(lines: list[str]) -> int:
    """Extract the latest season year from text like '2025 / 2026 SEASON'.

    Returns the highest year found, since seasonal dates repeat each year
    and we only need the current/latest year.
    """
    full = ' '.join(lines[:10])
    years = [int(m.group()) for m in re.finditer(r'20\d{2}', full)]
    return max(years) if years else date.today().year


def _extract_supplements_from_tables(pdf) -> dict[str, str]:
    """Scan all tables across all pages for supplement/surcharge info.

    Detects small tables like:
        [['1/2 Board', '250'], ['Full Board', '400'], ['City Tax', '30']]
    """
    supplements: dict[str, str] = {}
    for page in pdf.pages:
        for table in page.extract_tables():
            for row in table:
                if not row or len(row) < 2:
                    continue
                label = str(row[0] or '').strip().lower()
                value = str(row[1] or '').strip()
                if not value or not re.search(r'\d', value):
                    continue
                if '1/2 board' in label or 'half board' in label or 'demi.pension' in label:
                    supplements['hb'] = value
                elif 'full board' in label or 'pension compl' in label:
                    supplements['fb'] = value
                elif 'city tax' in label or 'taxe de s' in label or 'taxe tourist' in label:
                    supplements['tax'] = value
    return supplements


def _extract_supplements_from_text(lines: list[str]) -> dict[str, str]:
    """Extract supplement info from page text (not tables).

    Looks for patterns like:
    - "Tourist Bed Taxes: 41 MAD per person per night"
    - "Half Board: 320 MAD RSP (256 Nett) per adult"
    - "Full Board: 540 MAD RSP (432 Nett) per adult"

    When both RSP and Nett values are given, always uses the Nett value.
    """
    supplements: dict[str, str] = {}
    full = ' '.join(lines)

    # Tax: any per-person/per-night tax with a fixed amount.
    # First strip "sales tax" / "% tax" lines (already included in price).
    tax_text = re.sub(r'[\d.]+\s*%\s*(?:sales\s+)?tax[^.]*', '', full, flags=re.IGNORECASE)
    # Match "tax[es]:" or "taxe [de séjour / touristique / ...]:" with up to 4 words
    m = re.search(r'taxe?s?(?:\s+\w+){0,4}\s*[:\-]\s*(\d+)', tax_text, re.IGNORECASE)
    if m:
        supplements['tax'] = m.group(1)

    # Half Board — prefer Nett value if RSP/Nett pattern present
    m = re.search(
        r'half\s+board\s*(?:supplement)?[^.]*?\((\d+)\s*Nett\)',
        full, re.IGNORECASE,
    )
    if m:
        supplements['hb'] = m.group(1)
    else:
        m = re.search(
            r'half\s+board\s*(?:supplement)?\s*[:\-]?\s*(\d+)',
            full, re.IGNORECASE,
        )
        if m:
            supplements['hb'] = m.group(1)

    # Full Board — prefer Nett value if RSP/Nett pattern present
    m = re.search(
        r'full\s+board\s*(?:supplement)?[^.]*?\((\d+)\s*Nett\)',
        full, re.IGNORECASE,
    )
    if m:
        supplements['fb'] = m.group(1)
    else:
        m = re.search(
            r'full\s+board\s*(?:supplement)?\s*[:\-]?\s*(\d+)',
            full, re.IGNORECASE,
        )
        if m:
            supplements['fb'] = m.group(1)

    return supplements


def _extract_extra_bed_rules(pdf) -> dict[str, tuple[int, Decimal]]:
    """Extract extra bed rules from tables and text.

    Parses lines like:
        'EXTRA BED FOR JUNIOR SUITE - 1 - DH 200 FOR EACH BED MORE'
    Returns dict mapping lowercase room keyword -> (max_extra_beds, price_per_bed).
    """
    rules: dict[str, tuple[int, Decimal]] = {}
    pattern = re.compile(
        r'EXTRA\s+BED\s+(?:FOR\s*)?(.+?)\s*-\s*(\d+)\s*-\s*'
        r'(?:DH|DHS|MAD)\s*(\d[\d\s.,]*)',
        re.IGNORECASE,
    )
    for page in pdf.pages:
        for table in page.extract_tables():
            for row in table:
                for cell in row:
                    if not cell:
                        continue
                    m = pattern.search(str(cell))
                    if m:
                        room_key = m.group(1).strip().lower()
                        max_beds = int(m.group(2))
                        price = parse_moroccan_price(m.group(3))
                        if price:
                            rules[room_key] = (max_beds, price)
        # Also check page text
        text = page.extract_text() or ""
        for m in pattern.finditer(text):
            room_key = m.group(1).strip().lower()
            max_beds = int(m.group(2))
            price = parse_moroccan_price(m.group(3))
            if price and room_key not in rules:
                rules[room_key] = (max_beds, price)
    return rules


def _build_tax_note(supplements: dict[str, str]) -> str:
    """Build a note string for taxes and other non-meal supplements."""
    parts = []
    if 'tax' in supplements:
        parts.append(f"City Tax: {supplements['tax']} MAD/pers")
    return " | ".join(parts)


def _match_extra_bed_rule(
    room_name: str, rules: dict[str, tuple[int, 'Decimal']]
) -> tuple[int, 'Decimal'] | None:
    """Find an extra-bed rule that matches this room name."""
    room_lower = room_name.lower()
    for key, val in rules.items():
        # Match if the rule keyword appears in the room name
        # e.g. key="junior suite" matches room_name="JUNIOR SUITE 1"
        # Also handle typos like "suitee"
        key_clean = re.sub(r'e{2,}', 'e', key)  # "suitee" -> "suite"
        if key_clean in room_lower or key in room_lower:
            return val
    return None


def _parse_season_price_table(
    table: list[list],
    header_idx: int,
    page_lines: list[str],
    supplements: dict[str, str] | None = None,
    extra_bed_rules: dict[str, tuple[int, 'Decimal']] | None = None,
) -> list[ParsedPriceRow]:
    """Directly parse a multi-season price table when ExcelParser can't map columns.

    Handles tables where column headers contain date ranges (e.g. '07/01-28/02')
    and data cells are numeric prices.
    """
    from decimal import Decimal as D

    header = table[header_idx]
    data = table[header_idx + 1:]
    if not data:
        return []

    # Find room column
    room_col = None
    for i, cell in enumerate(header):
        if cell and re.search(r'room|chambre|type|categ', str(cell), re.IGNORECASE):
            room_col = i
            break
    if room_col is None:
        return []

    # Find columns to skip (PAX etc.)
    skip_cols = {room_col}
    for i, cell in enumerate(header):
        if cell and re.search(r'^pax$|^nb$|^pers', str(cell), re.IGNORECASE):
            skip_cols.add(i)

    # Find price/season columns: headers with date ranges (DD/MM patterns)
    year = _extract_current_year(page_lines)
    season_cols: list[tuple[int, list[ParsedDateRange], str]] = []
    for i, cell in enumerate(header):
        if i in skip_cols or not cell:
            continue
        cell_str = str(cell)
        if re.search(r'\d{1,2}/\d{1,2}', cell_str):
            date_ranges = _extract_date_ranges_from_header(cell_str, year)
            # Extract season text (e.g. "Basse Saison") from before the dates
            text_part = re.sub(
                r'\d{1,2}/\d{1,2}(?:/\d{2,4})?', '', cell_str
            ).replace('-', ' ').replace('–', ' ').strip(' ,:\n\t')
            text_part = re.sub(r'\s+', ' ', text_part).strip()
            en_text = _normalize_season_label(text_part) if text_part else ''
            # Build season label: "Low Season: DD/MM/YYYY-DD/MM/YYYY"
            date_str = ", ".join(
                f"{dr.date_from.strftime('%d/%m/%Y')}-{dr.date_to.strftime('%d/%m/%Y')}"
                for dr in date_ranges
            )
            season_label = f"{en_text}: {date_str}" if en_text else date_str
            season_cols.append((i, date_ranges, season_label))

    # Auto-detect season labels by comparing prices when headers lack text
    needs_auto = any(
        not re.sub(r'[\d/,:\-–\s]+', '', season_label).strip()
        for _, _, season_label in season_cols
    )
    if needs_auto:
        if len(season_cols) >= 2:
            # Compute average price per season column
            avg_prices = []
            for col_idx, _, _ in season_cols:
                prices = []
                for data_row in data:
                    raw = str(data_row[col_idx] or "").strip()
                    if raw:
                        p = parse_moroccan_price(raw)
                        if p and p > 0:
                            prices.append(p)
                avg_prices.append(sum(prices) / len(prices) if prices else D(0))

            # Rank columns by average price (ascending = cheapest first)
            ranked = sorted(range(len(season_cols)), key=lambda i: avg_prices[i])
            n = len(ranked)
            label_map: dict[int, str] = {}
            if n == 2:
                label_map = {ranked[0]: "Low Season", ranked[1]: "High Season"}
            elif n == 3:
                label_map = {ranked[0]: "Low Season", ranked[1]: "Medium Season", ranked[2]: "High Season"}
            else:  # 4+
                label_map[ranked[0]] = "Low Season"
                label_map[ranked[-1]] = "Peak Season"
                label_map[ranked[-2]] = "High Season"
                for idx in ranked[1:-2]:
                    label_map[idx] = "Medium Season"
        else:
            # Single season column — use generic label
            label_map = {0: "Season"}

        # Rebuild season_cols with auto-detected labels
        new_season_cols = []
        for i, (col_idx, date_ranges, old_label) in enumerate(season_cols):
            # Check if this column already has a text label
            text_only = re.sub(r'[\d/,:\-–\s]+', '', old_label).strip()
            if text_only:
                new_season_cols.append((col_idx, date_ranges, old_label))  # keep existing
            else:
                date_str = ", ".join(
                    f"{dr.date_from.strftime('%d/%m/%Y')}-{dr.date_to.strftime('%d/%m/%Y')}"
                    for dr in date_ranges
                )
                new_label = f"{label_map.get(i, 'Season')}: {date_str}"
                new_season_cols.append((col_idx, date_ranges, new_label))
        season_cols = new_season_cols

    if not season_cols:
        return []

    # Extract hotel info from page text
    hotel_name, stars, city, meal_plan = _extract_hotel_info_from_page_text(page_lines)
    if not hotel_name:
        hotel_name = "Unknown Hotel"

    # Extract contact info
    phone, email = extract_contact_from_lines(page_lines)

    # Prepare supplement values
    supps = supplements or {}
    hb_pp = parse_moroccan_price(supps['hb']) if 'hb' in supps else None
    fb_pp = parse_moroccan_price(supps['fb']) if 'fb' in supps else None
    tax_pp = parse_moroccan_price(supps['tax']) if 'tax' in supps else None

    # Keywords indicating whole-property pricing, not per-room
    WHOLE_PROPERTY_RE = re.compile(
        r'^(?:exclusivit|privatisation|entire|whole|riad entier)',
        re.IGNORECASE,
    )

    rows = []
    for data_row in data:
        room_name = str(data_row[room_col] or "").strip()
        if not room_name:
            continue

        # Skip whole-property rows (not per-room pricing)
        if WHOLE_PROPERTY_RE.search(room_name):
            continue

        # Look up extra bed rule for this room type
        bed_rule = _match_extra_bed_rule(room_name, extra_bed_rules or {})

        for col_idx, date_ranges, season_label in season_cols:
            raw_price = str(data_row[col_idx] or "").strip()
            if not raw_price:
                continue
            price_val = parse_moroccan_price(raw_price)
            if not price_val or price_val <= 0:
                continue

            # Room rate: single = double = twin when only one price is given
            triple = None
            quadruple = None
            if bed_rule:
                max_beds, bed_price = bed_rule
                triple = price_val + bed_price
                if max_beds >= 2:
                    quadruple = price_val + bed_price * 2

            # Helper: add per-person cost to a base room price
            def _add_pp(base: 'D | None', pax: int, pp: 'D') -> 'D | None':
                return base + pp * pax if base is not None else None

            # Add city tax per person to base prices
            if tax_pp:
                bb_sgl = price_val + tax_pp
                bb_dbl = price_val + tax_pp * 2
                bb_twn = price_val + tax_pp * 2
                bb_trp = triple + tax_pp * 3 if triple else None
                bb_quad = quadruple + tax_pp * 4 if quadruple else None
            else:
                bb_sgl = price_val
                bb_dbl = price_val
                bb_twn = price_val
                bb_trp = triple
                bb_quad = quadruple

            # --- BB row ---
            rows.append(ParsedPriceRow(
                accommodation=hotel_name,
                room_desc=room_name,
                city=city,
                single_price=bb_sgl,
                double_price=bb_dbl,
                twin_price=bb_twn,
                triple_price=bb_trp,
                quadruple_price=bb_quad,
                stars=stars,
                meal_plan=meal_plan or 'BB',
                fit_git='I',
                season_code=season_label,
                date_ranges=list(date_ranges),
                phone=phone,
                email=email,
            ))

            # --- HB row (meal supplement + tax, both per person) ---
            if hb_pp:
                meal_and_tax = hb_pp + (tax_pp or D(0))
                rows.append(ParsedPriceRow(
                    accommodation=hotel_name,
                    room_desc=room_name,
                    city=city,
                    single_price=price_val + meal_and_tax,
                    double_price=price_val + meal_and_tax * 2,
                    twin_price=price_val + meal_and_tax * 2,
                    triple_price=_add_pp(triple, 3, meal_and_tax) if triple else None,
                    quadruple_price=_add_pp(quadruple, 4, meal_and_tax) if quadruple else None,
                    stars=stars,
                    meal_plan='HB',
                    fit_git='I',
                    season_code=season_label,
                    date_ranges=list(date_ranges),
                    phone=phone,
                    email=email,
                ))

            # --- FB row (meal supplement + tax, both per person) ---
            if fb_pp:
                meal_and_tax = fb_pp + (tax_pp or D(0))
                rows.append(ParsedPriceRow(
                    accommodation=hotel_name,
                    room_desc=room_name,
                    city=city,
                    single_price=price_val + meal_and_tax,
                    double_price=price_val + meal_and_tax * 2,
                    twin_price=price_val + meal_and_tax * 2,
                    triple_price=_add_pp(triple, 3, meal_and_tax) if triple else None,
                    quadruple_price=_add_pp(quadruple, 4, meal_and_tax) if quadruple else None,
                    stars=stars,
                    meal_plan='FB',
                    fit_git='I',
                    season_code=season_label,
                    date_ranges=list(date_ranges),
                    phone=phone,
                    email=email,
                ))

    return rows


def _parse_rsp_nett_table(
    table: list[list],
    page_lines: list[str],
    supplements: dict[str, str] | None = None,
) -> list[ParsedPriceRow]:
    """Parse a table with alternating RSP (public) / Nett (agent) columns.

    Only Nett prices are extracted.  Handles tables like Palace Africa where:
    - Row 0: Season headers (Low Season, High Season)
    - Row 1: Date ranges in English
    - Row 2: Occupancy headers (Single, Double or Twin, Triple, Family of 4)
    - Row 3: RSP / Nett alternating
    - Row 4+: Room data with prices
    """
    from decimal import Decimal as D

    if len(table) < 5:
        return []

    # ---- detect RSP/Nett header row ----
    rsp_nett_idx = None
    for i, row in enumerate(table):
        cells = [str(c or '').strip().lower() for c in row]
        if cells.count('rsp') >= 2 and cells.count('nett') >= 2:
            rsp_nett_idx = i
            break

    if rsp_nett_idx is None:
        return []

    rsp_nett_row = table[rsp_nett_idx]

    # ---- find occupancy row (Single / Double or Twin / …) ----
    occupancy_row = None
    for i in range(rsp_nett_idx - 1, -1, -1):
        row_text = ' '.join(str(c or '') for c in table[i]).lower()
        if 'single' in row_text or 'double' in row_text:
            occupancy_row = table[i]
            break
    if occupancy_row is None:
        return []

    # ---- identify season blocks from the first row ----
    season_blocks: list[tuple[str, int, int]] = []  # (label, start_col, end_col)
    season_row = table[0]
    current_label = None
    current_start = None
    for col_idx, cell in enumerate(season_row):
        cell_str = str(cell or '').strip()
        if cell_str and col_idx > 0:
            if current_label is not None:
                season_blocks.append((current_label, current_start, col_idx - 1))
            current_label = cell_str
            current_start = col_idx
    if current_label is not None:
        season_blocks.append((current_label, current_start, len(season_row) - 1))

    if not season_blocks:
        return []

    # ---- build per-season data (dates, Nett column → occupancy map) ----
    season_data: list[tuple[str, list[ParsedDateRange], dict[str, int]]] = []

    for label, start, end in season_blocks:
        # collect date text from header rows within this column range
        date_text = ''
        for i in range(1, rsp_nett_idx):
            for col_idx in range(start, min(end + 1, len(table[i]))):
                cell = str(table[i][col_idx] or '').strip()
                if cell and re.search(r'\d', cell):
                    date_text += ' ' + cell

        date_ranges = _parse_english_season_dates(date_text.strip()) if date_text.strip() else []

        # season label in DD/MM/YYYY format (translate French → English)
        en_label = _normalize_season_label(label)
        if date_ranges:
            season_label = en_label + ": " + ", ".join(
                f"{dr.date_from.strftime('%d/%m/%Y')}-{dr.date_to.strftime('%d/%m/%Y')}"
                for dr in date_ranges
            )
        else:
            season_label = en_label

        # map each Nett column to its occupancy type
        nett_map: dict[str, int] = {}
        for col_idx in range(start, min(end + 1, len(rsp_nett_row))):
            if str(rsp_nett_row[col_idx] or '').strip().lower() != 'nett':
                continue
            occ_type = None
            for check_col in [col_idx - 1, col_idx, col_idx - 2]:
                if 0 <= check_col < len(occupancy_row):
                    occ_text = str(occupancy_row[check_col] or '').strip().lower()
                    if 'single' in occ_text:
                        occ_type = 'single'
                    elif 'double' in occ_text or 'twin' in occ_text:
                        occ_type = 'double_twin'
                    elif 'triple' in occ_text:
                        occ_type = 'triple'
                    elif 'family' in occ_text or 'quad' in occ_text:
                        occ_type = 'family'
                    if occ_type:
                        break
            if occ_type:
                nett_map[occ_type] = col_idx

        season_data.append((season_label, date_ranges, nett_map))

    if not season_data:
        return []

    # ---- hotel info ----
    hotel_name, stars, city, meal_plan = _extract_hotel_info_from_page_text(page_lines)
    if not hotel_name:
        hotel_name = "Unknown Hotel"
    phone, email_addr = extract_contact_from_lines(page_lines)

    # ---- supplements ----
    supps = supplements or {}
    hb_pp = parse_moroccan_price(supps['hb']) if 'hb' in supps else None
    fb_pp = parse_moroccan_price(supps['fb']) if 'fb' in supps else None
    tax_pp = parse_moroccan_price(supps['tax']) if 'tax' in supps else None

    def _add_tax(base: 'D | None', pax: int) -> 'D | None':
        if base is None:
            return None
        return base + tax_pp * pax if tax_pp else base

    def _add_meal(base: 'D | None', pax: int, supp_pp: 'D') -> 'D | None':
        if base is None:
            return None
        return base + (supp_pp + (tax_pp or D(0))) * pax

    # ---- parse data rows ----
    rows: list[ParsedPriceRow] = []
    for data_row in table[rsp_nett_idx + 1:]:
        room_name = str(data_row[0] or '').strip()
        if not room_name:
            continue
        # strip room count like "(1)" from "Standard Room (1)"
        room_name = re.sub(r'\s*\(\d+\)\s*$', '', room_name).strip()

        for season_label, date_ranges, nett_map in season_data:
            prices: dict[str, D] = {}
            for occ_type, col_idx in nett_map.items():
                if col_idx < len(data_row):
                    raw = str(data_row[col_idx] or '').strip()
                    if raw:
                        price = parse_moroccan_price(raw)
                        if price and price > 0:
                            prices[occ_type] = price

            if not prices:
                continue

            sgl = prices.get('single')
            dbl = prices.get('double_twin')
            trp = prices.get('triple')
            quad = prices.get('family')

            # --- BB row (base already includes breakfast; add tax) ---
            rows.append(ParsedPriceRow(
                accommodation=hotel_name,
                room_desc=room_name,
                city=city,
                single_price=_add_tax(sgl, 1),
                double_price=_add_tax(dbl, 2),
                twin_price=_add_tax(dbl, 2),
                triple_price=_add_tax(trp, 3),
                quadruple_price=_add_tax(quad, 4),
                stars=stars,
                meal_plan=meal_plan or 'BB',
                fit_git='I',
                season_code=season_label,
                date_ranges=list(date_ranges),
                phone=phone,
                email=email_addr,
            ))

            # --- HB row ---
            if hb_pp:
                rows.append(ParsedPriceRow(
                    accommodation=hotel_name,
                    room_desc=room_name,
                    city=city,
                    single_price=_add_meal(sgl, 1, hb_pp),
                    double_price=_add_meal(dbl, 2, hb_pp),
                    twin_price=_add_meal(dbl, 2, hb_pp),
                    triple_price=_add_meal(trp, 3, hb_pp),
                    quadruple_price=_add_meal(quad, 4, hb_pp),
                    stars=stars,
                    meal_plan='HB',
                    fit_git='I',
                    season_code=season_label,
                    date_ranges=list(date_ranges),
                    phone=phone,
                    email=email_addr,
                ))

            # --- FB row ---
            if fb_pp:
                rows.append(ParsedPriceRow(
                    accommodation=hotel_name,
                    room_desc=room_name,
                    city=city,
                    single_price=_add_meal(sgl, 1, fb_pp),
                    double_price=_add_meal(dbl, 2, fb_pp),
                    twin_price=_add_meal(dbl, 2, fb_pp),
                    triple_price=_add_meal(trp, 3, fb_pp),
                    quadruple_price=_add_meal(quad, 4, fb_pp),
                    stars=stars,
                    meal_plan='FB',
                    fit_git='I',
                    season_code=season_label,
                    date_ranges=list(date_ranges),
                    phone=phone,
                    email=email_addr,
                ))

    return rows


def _parse_fit_git_contract_table(
    table: list[list],
    page_lines: list[str],
    all_text_lines: list[str] | None = None,
) -> list[ParsedPriceRow]:
    """Parse a French chain contract table with separate FIT and GIT columns.

    Handles tables like:
        Row 0: ['', 'TARIF GROUPE/SERIE à partir de 10 pax', 'TARIF FIT Moins 10 pax']
        Row 1: ['½ double avec petit déjeuner', '-', '460,00']
        Row 2: ['½ double en demi-pension', '480,00', '550,00']
        Row 3: ['Supplément single', '320,00', '350,00']
        Row 4: ['Taxes par personne par jour', '16,50', '16.50']

    Prices are per person (½ double).  Converted to per-room prices:
        double = ½ double × 2 + tax × 2
        single = ½ double + supplement + tax
        twin   = double
    """
    from decimal import Decimal as D

    if len(table) < 3:
        return []

    # --- detect FIT / GIT columns from header row ---
    header = table[0]
    fit_col = None
    git_col = None
    for i, cell in enumerate(header):
        cell_str = str(cell or '').upper()
        if 'FIT' in cell_str:
            fit_col = i
        if 'GROUPE' in cell_str or 'GIT' in cell_str or 'SERIE' in cell_str:
            git_col = i

    if fit_col is None and git_col is None:
        return []

    price_cols = [c for c in [git_col, fit_col] if c is not None]

    # --- scan rows for pricing components ---
    half_dbl_bb: dict[int, D] = {}
    half_dbl_hb: dict[int, D] = {}
    half_dbl_fb: dict[int, D] = {}
    single_supp: dict[int, D] = {}
    tax_pp: dict[int, D] = {}
    third_person_pct: dict[int, int] = {}  # col -> percentage

    for row in table[1:]:
        label = str(row[0] or '').strip().lower()
        if not label:
            continue

        for col in price_cols:
            if col >= len(row):
                continue
            raw = str(row[col] or '').strip()
            if not raw or raw == '-':
                continue

            is_half_dbl = '½' in label or '1/2' in label or 'double' in label
            is_bb = any(w in label for w in ['petit', 'déjeuner', 'dejeuner', 'breakfast'])
            is_hb = any(w in label for w in ['demi', 'half board'])
            is_fb = any(w in label for w in ['pension complète', 'pension complete', 'full board'])
            is_supp_single = 'suppl' in label and 'single' in label
            is_tax = 'taxe' in label or ('tax' in label and '%' not in raw)
            is_third = 'reduction' in label and ('3' in label or 'troisième' in label)

            if is_half_dbl and is_bb:
                p = parse_moroccan_price(raw)
                if p:
                    half_dbl_bb[col] = p
            elif is_half_dbl and is_hb:
                p = parse_moroccan_price(raw)
                if p:
                    half_dbl_hb[col] = p
            elif is_half_dbl and is_fb:
                p = parse_moroccan_price(raw)
                if p:
                    half_dbl_fb[col] = p
            elif is_supp_single:
                p = parse_moroccan_price(raw)
                if p:
                    single_supp[col] = p
            elif is_tax:
                p = parse_moroccan_price(raw)
                if p:
                    tax_pp[col] = p
            elif is_third:
                pct_m = re.search(r'(\d+)\s*%', raw)
                if pct_m:
                    third_person_pct[col] = int(pct_m.group(1))

    if not half_dbl_bb and not half_dbl_hb and not half_dbl_fb:
        return []

    # --- extract hotel info from page text ---
    full_text = ' '.join(page_lines)
    # For child discount, use all pages if available
    all_text = ' '.join(all_text_lines) if all_text_lines else full_text

    hotel_name = ""
    # Pattern: "L'hôtel : Hôtel ERFOUD PALACE" — stop at next label
    # Use \u2018\u2019 for smart quotes that PDFs often use
    APOS = "[\u0027\u2018\u2019\u0060\u00B4]"
    m = re.search(
        r"l" + APOS + r"h[ôo]tel\s*:\s*(?:H[ôo]tel\s+)?(.+?)(?=\s+Repr[ée]sent|\s+Adresse|\s+T[ée]l|\s+E[\s-]*mail|\s+VALID|\s+Site\b)",
        full_text, re.IGNORECASE,
    )
    if m:
        hotel_name = m.group(1).strip()

    if not hotel_name:
        hotel_name, _, _, _ = _extract_hotel_info_from_page_text(page_lines)
        hotel_name = hotel_name or "Unknown Hotel"

    # City: prefer city from hotel name, then from hotel address section
    city = extract_city_from_name(hotel_name)
    if not city:
        # Look for city after "L'hôtel" section (not agency section)
        hotel_section = re.search(
            r"l" + APOS + r"h[ôo]tel\s*:(.+?)(?:VALID|TARIF|Prix\s+net)",
            full_text, re.IGNORECASE | re.DOTALL,
        )
        if hotel_section:
            hotel_text = hotel_section.group(1)
            m = CITIES_RE.search(hotel_text)
            if m:
                city = m.group(0).strip().title()
        if not city:
            city = extract_city_from_page_text(page_lines)
    # Extract hotel-specific contact info (after "L'hôtel" section)
    phone = ""
    email_addr = ""
    hotel_section_m = re.search(
        r"l" + APOS + r"h[ôo]tel\s*:(.+?)(?:VALID|TARIF|Prix\s+net|POUR\s)",
        full_text, re.IGNORECASE | re.DOTALL,
    )
    if hotel_section_m:
        hotel_section_text = hotel_section_m.group(1)
        em = re.search(r'[\w.+-]+@[\w.-]+\.\w+', hotel_section_text)
        if em:
            email_addr = em.group(0)
        ph = re.search(r'[Tt][ée]l[ée]?(?:phone)?\s*:\s*([+\d\s()/\-]+)', hotel_section_text)
        if ph:
            phone = ph.group(1).strip().rstrip('/')
    if not phone or not email_addr:
        p2, e2 = extract_contact_from_lines(page_lines)
        if not phone:
            phone = p2
        if not email_addr:
            email_addr = e2

    date_ranges = extract_contract_dates(page_lines)

    # Season code from date range
    season_code = None
    if date_ranges:
        date_str = ", ".join(
            f"{dr.date_from.strftime('%d/%m/%Y')}-{dr.date_to.strftime('%d/%m/%Y')}"
            for dr in date_ranges
        )
        season_code = f"Season: {date_str}"

    # Child discount from article text (search all pages)
    baby_discount = None
    child_discount = None
    m = re.search(
        r'enfant.*?(\d+[\.,]\d+)\s*ans.*?(\d+)\s*(?:à|a)\s*(\d+)\s*ans\s*[-–]?\s*(\d+)\s*%',
        all_text, re.IGNORECASE | re.DOTALL,
    )
    if m:
        baby_discount = f"Free 0-{m.group(1)} yrs"
        child_discount = f"-{m.group(4)}% ({m.group(2)}-{m.group(3)} yrs)"

    # Exclusion note (e.g. "Hors période salon des dattes")
    exclusion_note = None
    m = re.search(
        r'[Hh]ors\s+p[ée]riode\s+(.+?)(?=\s+Prix|\s+TARIF|\s+Les\s+soussign|\s+POUR\s)',
        full_text,
    )
    if m:
        exclusion_note = f"Excludes: {m.group(1).strip()}"

    # --- build rows for each FIT/GIT column and meal plan ---
    rows: list[ParsedPriceRow] = []

    for col in price_cols:
        fit_git_label = 'I' if col == fit_col else 'G'

        meal_plans = [
            ('BB', half_dbl_bb),
            ('HB', half_dbl_hb),
            ('FB', half_dbl_fb),
        ]
        for meal_code, half_dbl_map in meal_plans:
            half_dbl = half_dbl_map.get(col)
            if half_dbl is None:
                continue

            supp = single_supp.get(col, D(0))
            tax = tax_pp.get(col, D(0))

            # Per-room prices from per-person ½ double
            dbl_price = half_dbl * 2 + tax * 2
            sgl_price = half_dbl + supp + tax
            twn_price = dbl_price

            # Triple with 3rd person discount
            trp_price = None
            pct = third_person_pct.get(col)
            if pct is not None:
                third_pp = half_dbl * D(str(1 - pct / 100))
                trp_price = half_dbl * 2 + third_pp + tax * 3

            # Build note
            note_parts = []
            if tax:
                note_parts.append(f"Tax: {tax} MAD/pers")
            if pct is not None:
                note_parts.append(f"3rd pers: -{pct}%")
            if exclusion_note:
                note_parts.append(exclusion_note)

            rows.append(ParsedPriceRow(
                accommodation=hotel_name,
                city=city,
                double_price=dbl_price,
                single_price=sgl_price,
                twin_price=twn_price,
                triple_price=trp_price,
                meal_plan=meal_code,
                fit_git=fit_git_label,
                season_code=season_code,
                date_ranges=list(date_ranges),
                baby_discount=baby_discount,
                child_discount=child_discount,
                note=' | '.join(note_parts) if note_parts else None,
                phone=phone,
                email=email_addr,
            ))

    return rows


class PdfParser(BaseParser):
    # Minimum extracted text length to consider a PDF as text-based.
    # Below this threshold, the PDF is likely scanned/image-only and
    # should be routed to AI vision pipeline instead.
    MIN_TEXT_LENGTH = 50

    def can_handle(self, file_path: Path) -> bool:
        return file_path.suffix.lower() == ".pdf"

    def parse(self, file_path: Path) -> list[ParsedPriceRow]:
        all_rows = []

        with pdfplumber.open(file_path) as pdf:
            # Phase 4.1: Detect scanned/image-only PDFs
            total_text = ""
            for page in pdf.pages[:3]:  # Check first 3 pages
                total_text += (page.extract_text() or "")
                if len(total_text) >= self.MIN_TEXT_LENGTH:
                    break

            if len(total_text.strip()) < self.MIN_TEXT_LENGTH:
                # Scanned PDF — return empty so AI vision fallback triggers
                import logging
                logging.getLogger(__name__).info(
                    "PDF has < %d chars of text (%d found) — flagging as scanned for AI vision fallback",
                    self.MIN_TEXT_LENGTH, len(total_text.strip()),
                )
                return []
            # Pre-scan all pages for supplement tables and extra bed rules
            supplements = _extract_supplements_from_tables(pdf)

            # Also check page text for supplements (merge, table wins)
            all_text_lines: list[str] = []
            for page in pdf.pages:
                text = page.extract_text() or ""
                all_text_lines.extend(text.split('\n'))
            text_supps = _extract_supplements_from_text(all_text_lines)
            for k, v in text_supps.items():
                if k not in supplements:
                    supplements[k] = v

            extra_bed_rules = _extract_extra_bed_rules(pdf)

            # Try table-based parsing (structured PDFs)
            for page in pdf.pages:
                tables = page.extract_tables()
                page_text = page.extract_text() or ""
                page_lines = page_text.split('\n')

                for table in tables:
                    if not table or len(table) < 2:
                        continue

                    # Find actual header row (skip title/super-header rows)
                    header_idx = _find_header_row_index(table)
                    header = [
                        str(cell).strip() if cell else f"col_{i}"
                        for i, cell in enumerate(table[header_idx])
                    ]
                    data_rows = table[header_idx + 1:]

                    if not data_rows:
                        continue

                    # Try ExcelParser directly on DataFrame (no temp file)
                    df = pd.DataFrame(data_rows, columns=header)
                    parser = ExcelParser()
                    rows = parser.parse_dataframe(df)
                    all_rows.extend(rows)

                    # If ExcelParser returned nothing useful, try specialised parsers
                    has_prices = any(
                        r.double_price or r.single_price or r.twin_price
                        for r in rows
                    )
                    if not has_prices:
                        # Remove the empty rows ExcelParser may have returned
                        if rows:
                            all_rows = [r for r in all_rows if r not in rows]

                        # Try DD/MM season-table parser (RIAD ALIYA style)
                        direct_rows = _parse_season_price_table(
                            table, header_idx, page_lines,
                            supplements, extra_bed_rules,
                        )
                        if direct_rows:
                            all_rows.extend(direct_rows)
                        else:
                            # Try RSP/Nett table parser (Palace Africa style)
                            rsp_nett_rows = _parse_rsp_nett_table(
                                table, page_lines, supplements,
                            )
                            if rsp_nett_rows:
                                all_rows.extend(rsp_nett_rows)
                            else:
                                # Try FIT/GIT contract table parser
                                fit_git_rows = _parse_fit_git_contract_table(
                                    table, page_lines, all_text_lines,
                                )
                                all_rows.extend(fit_git_rows)

            # If table-based parsing found nothing, try text-based chain contract parsing
            if not all_rows:
                all_rows = parse_chain_contract_pages(pdf)

        return all_rows
