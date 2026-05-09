"""Confidence scoring for document extractions.

Produces a 0.0-1.0 score based on:
- Price consistency (SGL vs DBL relationships, no zero prices)
- Field completeness (hotel name, city, dates, meal plan)
- Grounding ratio (what fraction of rows survived grounding checks)
"""
from __future__ import annotations

import logging
from app.parsers.base import ParsedPriceRow

logger = logging.getLogger(__name__)


def score_extraction(
    rows: list[ParsedPriceRow],
    total_before_grounding: int | None = None,
) -> float:
    """Compute a confidence score for an extraction result.

    Args:
        rows: Final extraction rows (after all passes).
        total_before_grounding: Number of rows before grounding check (if available).

    Returns:
        Score between 0.0 and 1.0.
    """
    if not rows:
        return 0.0

    n = len(rows)
    scores: list[float] = []

    # --- 1. Price consistency (weight: 0.35) ---
    price_issues = 0
    for r in rows:
        sgl = float(r.single_price) if r.single_price else None
        dbl = float(r.double_price) if r.double_price else None

        # SGL should not exceed DBL by more than 40%
        if sgl and dbl and sgl > dbl * 1.4:
            price_issues += 1

        # At least one price should exist
        if not any([r.double_price, r.single_price, r.twin_price,
                     r.triple_price, r.quadruple_price]):
            price_issues += 1

    price_score = max(0.0, 1.0 - (price_issues / n))
    scores.append(0.35 * price_score)

    # --- 2. Field completeness (weight: 0.35) ---
    completeness_total = 0
    for r in rows:
        fields_present = 0
        fields_possible = 5  # name, city, dates, meal_plan, room_desc

        if (r.accommodation or "").strip():
            fields_present += 1
        if (r.city or "").strip():
            fields_present += 1
        if r.date_ranges:
            fields_present += 1
        if (r.meal_plan or "").strip():
            fields_present += 1
        if (r.room_desc or "").strip():
            fields_present += 1

        completeness_total += fields_present / fields_possible

    completeness_score = completeness_total / n
    scores.append(0.35 * completeness_score)

    # --- 3. Grounding ratio (weight: 0.30) ---
    if total_before_grounding and total_before_grounding > 0:
        grounding_ratio = n / total_before_grounding
    else:
        # No grounding info — assume good
        grounding_ratio = 1.0
    scores.append(0.30 * grounding_ratio)

    final_score = round(sum(scores), 2)
    logger.info("Confidence score: %.2f (price=%.2f, complete=%.2f, grounding=%.2f)",
                final_score, price_score, completeness_score, grounding_ratio)
    return min(1.0, max(0.0, final_score))
