"""Auto-detect email label from subject and body keywords."""

from __future__ import annotations

import logging

logger = logging.getLogger(__name__)

# Keywords mapped to labels, checked in order. First match wins.
_LABEL_RULES: list[tuple[str, list[str]]] = [
    ("accommodation", [
        "hotel", "hôtel", "riad", "kasbah", "lodge", "resort", "maison d'hôte",
        "guesthouse", "hébergement", "accommodation", "chambre", "room",
    ]),
    ("restaurant", [
        "restaurant", "menu", "repas", "dîner", "déjeuner", "dinner", "lunch",
        "gastronomie", "cuisine", "traiteur", "catering",
    ]),
    ("transportation", [
        "transport", "bus", "transfert", "transfer", "navette", "shuttle",
        "autocar", "coach", "véhicule", "vehicle", "mise à disposition",
    ]),
    ("entrees", [
        "entrée", "entree", "ticket", "billet", "admission", "musée", "museum",
        "excursion", "visite", "visit", "monument", "site", "activité", "activity",
    ]),
    ("packages", [
        "package", "forfait", "circuit", "programme", "séjour", "itinéraire",
        "itinerary", "tour", "voyage",
    ]),
]


def auto_detect_label(subject: str | None, body_text: str | None = None) -> str | None:
    """Return a label string if keywords match, or None if nothing matches."""
    text = ""
    if subject:
        text += subject
    if body_text:
        text += " " + body_text[:2000]  # limit scan to first 2k chars of body

    if not text.strip():
        return None

    text_lower = text.lower()

    for label, keywords in _LABEL_RULES:
        for kw in keywords:
            if kw in text_lower:
                logger.info("Auto-label '%s' matched keyword '%s'", label, kw)
                return label

    return None
