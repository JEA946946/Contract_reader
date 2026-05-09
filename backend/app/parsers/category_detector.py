"""Detect whether a document is a hotel contract or restaurant menu."""
from __future__ import annotations

import logging
from pathlib import Path

logger = logging.getLogger(__name__)

RESTAURANT_KEYWORDS = [
    "menu", "repas", "diner", "dîner", "dejeuner", "déjeuner",
    "gala", "farewell", "couvert", "plat", "entree", "entrée",
    "dessert", "boisson", "restaurant", "traiteur", "banquet",
    "par personne", "per person", "menu du jour", "soirée",
    "cocktail", "buffet dînatoire",
]

HOTEL_KEYWORDS = [
    "chambre", "room", "nuit", "night", "check-in", "check-out",
    "single supplement", "supplément single", "dbl", "sgl",
    "half board", "bed and breakfast", "petit déjeuner inclus",
    "hôtel", "hotel", "riad", "kasbah", "hébergement",
    "twin", "triple", "quadruple", "suite", "logement",
]

TRANSPORTATION_KEYWORDS = [
    "transport", "bus", "seater", "transfer", "roundtrip",
    "soirée", "excursion", "mise a dispo", "mise à dispo",
    "airport", "vehicle", "coach", "navette", "autocar",
    "minibus", "shuttle", "round trip", "transfert",
]


def detect_category_from_text(text: str) -> str:
    """Score restaurant vs hotel vs transportation keywords and return the best match."""
    text_lower = text.lower()

    restaurant_score = sum(1 for kw in RESTAURANT_KEYWORDS if kw in text_lower)
    hotel_score = sum(1 for kw in HOTEL_KEYWORDS if kw in text_lower)
    transport_score = sum(1 for kw in TRANSPORTATION_KEYWORDS if kw in text_lower)

    logger.info(
        "Category detection — hotel_score=%d, restaurant_score=%d, transport_score=%d",
        hotel_score, restaurant_score, transport_score,
    )

    scores = {"hotel": hotel_score, "restaurant": restaurant_score, "transportation": transport_score}
    best = max(scores, key=scores.get)
    best_score = scores[best]

    if best == "transportation" and transport_score >= 3 and transport_score > hotel_score and transport_score > restaurant_score:
        return "transportation"
    if best == "restaurant" and restaurant_score >= 3 and restaurant_score > hotel_score:
        return "restaurant"
    if hotel_score > restaurant_score and hotel_score > transport_score:
        return "hotel"

    # Ambiguous — use Claude for a quick classification
    return _classify_with_claude(text)


def detect_category_from_pdf(pdf_path: Path) -> str:
    """Extract text from PDF and detect category."""
    try:
        import pdfplumber
        text_parts = []
        with pdfplumber.open(pdf_path) as pdf:
            for page in pdf.pages[:5]:  # First 5 pages is enough
                page_text = page.extract_text() or ""
                text_parts.append(page_text)
        text = "\n".join(text_parts)
        if text.strip():
            return detect_category_from_text(text)
    except Exception as e:
        logger.warning("Could not extract PDF text for category detection: %s", e)

    return "hotel"  # Default fallback


def _classify_with_claude(text: str) -> str:
    """Use a short Claude call to classify ambiguous documents."""
    try:
        from app.config import settings
        if not settings.anthropic_api_key or settings.anthropic_api_key == "your-api-key-here":
            return "hotel"

        import anthropic
        client = anthropic.Anthropic(api_key=settings.anthropic_api_key)

        snippet = text[:3000]
        response = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=10,
            system="Classify this document as either 'hotel', 'restaurant', or 'transportation'. Respond with ONLY one word.",
            messages=[{"role": "user", "content": snippet}],
        )
        result = response.content[0].text.strip().lower()
        if "restaurant" in result:
            return "restaurant"
        if "transport" in result:
            return "transportation"
        return "hotel"
    except Exception as e:
        logger.warning("Claude classification failed: %s", e)
        return "hotel"
