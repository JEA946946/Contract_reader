"""AI-powered parser for restaurant menu pricing documents.

Same 4-pass pipeline as ai_parser.py but with restaurant-specific prompts.
"""
from __future__ import annotations

import base64
import json
import logging
from pathlib import Path

from app.parsers.base import ParsedMenuRow, ParsedDateRange
from app.config import settings
from app.utils import parse_price, parse_date, parse_int, clean_string

logger = logging.getLogger(__name__)

# ============================================================
#  PASS 1 — Document analysis
# ============================================================

ANALYSIS_PROMPT = """You are a senior restaurant menu pricing analyst for a DMC (Destination Management Company) specialising in Morocco and similar markets.

You have been given a restaurant menu/pricing document. Before ANY extraction, perform a full structural analysis.

YOUR TASK — produce a structured analysis in plain text (NOT JSON). Cover all of these points:

1. DOCUMENT TYPE
   What kind of document is this? (Menu card / Group dining contract / Event pricing / Catering proposal / Multi-restaurant brochure / Other)
   Is this a complete pricing document or a partial/fragment?

2. RESTAURANTS FOUND
   List every restaurant name you can identify.
   Note any restaurant codes or reference numbers.

3. MENU TYPES FOUND
   What meal types are present? (Lunch / Dinner / Gala Dinner / Farewell Dinner / Cocktail / Brunch / Other)
   Are there named menus (Menu A, Menu Prestige, etc.)?

4. PRICE STRUCTURE
   Are prices per person?
   Is there a minimum number of persons (pax)?
   Are drinks included or separate?
   What currency?

5. SEASON STRUCTURE
   Are there different prices for different seasons/periods?
   List every season you found and its associated dates if visible.

6. MENU DESCRIPTIONS
   Are there detailed menu descriptions (starter, main, dessert)?
   Are there multiple menu options per meal type?

7. SPECIAL CONDITIONS
   Minimum group sizes?
   Supplement for specific items (wine, live music, etc.)?
   Any restrictions or notes?

8. EXTRACTION PLAN
   How many JSON rows you expect to produce.
   Flag anything uncertain.

Be thorough. A good analysis here directly improves extraction accuracy."""

# ============================================================
#  PASS 2 — Extraction
# ============================================================

EXTRACTION_PROMPT_TEMPLATE = """You are a restaurant menu pricing extraction engine for a DMC.

You have already performed a structural analysis of this document:
--- BEGIN ANALYSIS ---
{analysis}
--- END ANALYSIS ---

Now extract ALL menu pricing data using your analysis above as a guide.

EXTRACTION RULES:
1. Use your analysis to navigate the document — do not re-discover structure
2. Output one row per menu option (e.g. "Menu Tradition 1", "Menu Prestige", "Menu Gala")
   - If the same menu has both lunch and dinner prices, put them on the SAME row
   - Do NOT create separate rows for lunch vs dinner of the same menu
3. lunch_price: price per person for lunch (déjeuner/midi), numeric or null
4. dinner_price: price per person for dinner (dîner/soir), numeric or null
5. lunch_child_price: child (CHD/enfant) price for lunch, numeric or null
6. dinner_child_price: child (CHD/enfant) price for dinner, numeric or null
7. course_1 through course_5: individual courses in the menu (e.g. "Salade marocaine", "Tajine d'agneau", "Pastilla", "Couscous", "Pâtisseries marocaines"). Use null for unused slots.
8. min_pax: minimum number of persons required (integer or null)
9. drink_included: "yes", "no", "wine_included", "soft_drinks_only", or null
10. menu_name: the specific menu name if given (e.g. "Menu Prestige", "Menu A")
    - For beverage/drink packages, use "Beverage" as the menu_name, and put the specific beverage or wine name in course_1 (e.g. course_1: "La ferme rouge", "Médaillon", "Volubilia")
11. description: brief description of what's included if not captured by courses
12. season_code: season label if applicable
13. date_ranges: season dates in YYYY-MM-DD format
14. If a field is genuinely absent from the document, use null — do not invent values

NORMALISATION:
- Dates must be YYYY-MM-DD format
- Season codes: "Basse Saison"/"Low Season" → "L", "Haute Saison"/"High Season" → "H", "Mid Season" → "M"
- Strip currency symbols from prices, output clean numbers

RESPOND ONLY with a valid JSON array. No backticks. No explanation.

Schema for each row:
{{
  "restaurant_name": "Restaurant name",
  "city": "City name",
  "menu_name": "Named menu or null",
  "description": "Brief description or null",
  "lunch_price": number or null,
  "dinner_price": number or null,
  "lunch_child_price": number or null,
  "dinner_child_price": number or null,
  "course_1": "string or null",
  "course_2": "string or null",
  "course_3": "string or null",
  "course_4": "string or null",
  "course_5": "string or null",
  "min_pax": integer or null,
  "drink_included": "yes | no | wine_included | soft_drinks_only | null",
  "season_code": "season label or null",
  "date_ranges": [{{"date_from": "YYYY-MM-DD", "date_to": "YYYY-MM-DD"}}],
  "note": "conditions, supplements, special notes",
  "address": "string or null",
  "phone": "string or null",
  "email": "string or null"
}}"""

# ============================================================
#  PASS 3 — Validation
# ============================================================

VALIDATION_PROMPT = """You are a restaurant menu data quality validator for a DMC.

You have been given extracted menu pricing rows as JSON. Your job is to find logical errors and fix them.

CHECK FOR:
1. PRICE REASONABLENESS
   - Per-person prices that seem too low (< 50 MAD) or too high (> 5000 MAD) for the market
   - Prices of 0 — set to null
   - Check lunch_price, dinner_price, lunch_child_price, dinner_child_price

2. DATE INTEGRITY
   - Dates that go backwards (date_to before date_from)
   - Invalid date formats — fix to YYYY-MM-DD

3. COMPLETENESS
   - Restaurant name missing — keep as-is but add note
   - City missing — try to infer from restaurant name if possible

4. CONSISTENCY
   - Normalise season codes
   - Ensure drink_included is one of: yes, no, wine_included, soft_drinks_only, or null
   - course_1 through course_5 should contain individual course descriptions or null

5. ROW STRUCTURE
   - Each row should represent one menu option
   - If lunch and dinner prices exist for the same menu, they should be on the SAME row

FIX issues where you can. Add notes about what you fixed.
RESPOND ONLY with the corrected JSON array (same schema). No backticks."""

# ============================================================
#  PASS 4 — Grounding verification
# ============================================================

GROUNDING_PROMPT = """You are a restaurant menu data quality checker. Your job is to REMOVE hallucinated data.

You have:
1. The ORIGINAL source text from a restaurant document
2. Some extracted rows

For each row, check:
- Does the restaurant name appear in the source?
- Can the price values be traced to numbers in the source?
- Do the menu name and course descriptions correspond to something mentioned in the document?
- Is the description consistent with what the document describes?

RULES:
- If a price cannot be traced to any number in the source, REMOVE the row
- If the restaurant name is clearly invented, REMOVE the row
- Be strict: when in doubt, REMOVE the row

RESPOND ONLY with a JSON array of rows that are VERIFIED correct.
If ALL rows are hallucinated, return an empty array: []
No backticks. No explanation."""


# ============================================================
#  PARSER CLASS
# ============================================================

class RestaurantAiParser:
    def parse_pdf(self, pdf_path: Path) -> list[ParsedMenuRow]:
        """Parse a restaurant PDF using vision-based Claude."""
        if not settings.anthropic_api_key or settings.anthropic_api_key == "your-api-key-here":
            raise RuntimeError("Anthropic API key not configured")

        import anthropic
        client = anthropic.Anthropic(api_key=settings.anthropic_api_key)

        pdf_bytes = pdf_path.read_bytes()
        pdf_b64 = base64.standard_b64encode(pdf_bytes).decode("utf-8")
        pdf_block = {
            "type": "document",
            "source": {"type": "base64", "media_type": "application/pdf", "data": pdf_b64},
        }

        # Pass 1: Analysis
        logger.info("Restaurant Parser (vision) — Pass 1: Analysing document structure")
        analysis = self._call_claude_with_content(
            client, system=ANALYSIS_PROMPT,
            content=[pdf_block, {"type": "text", "text": "Analyse this restaurant menu document."}],
            max_tokens=3000,
        )
        logger.info("Restaurant Parser (vision) — Pass 1 complete (%d chars)", len(analysis))

        # Pass 2: Extraction
        logger.info("Restaurant Parser (vision) — Pass 2: Extracting menu prices")
        extraction_system = EXTRACTION_PROMPT_TEMPLATE.format(analysis=analysis)
        extraction_raw = self._call_claude_with_content(
            client, system=extraction_system,
            content=[pdf_block, {"type": "text", "text": "Extract all menu pricing data from this document."}],
            max_tokens=16000,
        )
        data = self._parse_json(extraction_raw)
        logger.info("Restaurant Parser (vision) — Pass 2 complete: %d rows extracted", len(data))

        if not data:
            return []

        # Pass 3: Validation
        logger.info("Restaurant Parser (vision) — Pass 3: Validating extracted data")
        validation_input = json.dumps(data, ensure_ascii=False, indent=2)
        validation_raw = self._call_claude(
            client, system=VALIDATION_PROMPT,
            user_content=f"Validate and fix these extracted rows:\n{validation_input}",
            max_tokens=16000,
        )
        validated = self._parse_json(validation_raw)
        if validated:
            data = validated
            logger.info("Restaurant Parser (vision) — Pass 3 complete: %d rows", len(data))
        else:
            logger.warning("Restaurant Parser (vision) — Pass 3 returned invalid JSON, keeping pass 2 results")

        rows = self._convert_rows(data)

        # Pass 4: Grounding
        source_text = self._extract_pdf_text(pdf_path)
        if source_text:
            logger.info("Restaurant Parser (vision) — Pass 4: Grounding check")
            rows = self._ground_and_verify(client, source_text, rows)

        return rows

    def parse_text(self, text: str) -> list[ParsedMenuRow]:
        """Parse restaurant text content."""
        if not settings.anthropic_api_key or settings.anthropic_api_key == "your-api-key-here":
            raise RuntimeError("Anthropic API key not configured")

        import anthropic
        client = anthropic.Anthropic(api_key=settings.anthropic_api_key)

        if len(text) > 80000:
            text = text[:80000] + "\n... (truncated)"

        # Pass 1
        logger.info("Restaurant Parser — Pass 1: Analysing document structure")
        analysis = self._call_claude(client, system=ANALYSIS_PROMPT, user_content=text, max_tokens=3000)
        logger.info("Restaurant Parser — Pass 1 complete (%d chars)", len(analysis))

        # Pass 2
        logger.info("Restaurant Parser — Pass 2: Extracting menu prices")
        extraction_system = EXTRACTION_PROMPT_TEMPLATE.format(analysis=analysis)
        extraction_raw = self._call_claude(client, system=extraction_system, user_content=text, max_tokens=16000)
        data = self._parse_json(extraction_raw)
        logger.info("Restaurant Parser — Pass 2 complete: %d rows extracted", len(data))

        if not data:
            return []

        # Pass 3
        logger.info("Restaurant Parser — Pass 3: Validating extracted data")
        validation_input = json.dumps(data, ensure_ascii=False, indent=2)
        validation_raw = self._call_claude(
            client, system=VALIDATION_PROMPT,
            user_content=f"Validate and fix these extracted rows:\n{validation_input}",
            max_tokens=16000,
        )
        validated = self._parse_json(validation_raw)
        if validated:
            data = validated
            logger.info("Restaurant Parser — Pass 3 complete: %d rows", len(data))
        else:
            logger.warning("Restaurant Parser — Pass 3 returned invalid JSON, keeping pass 2 results")

        rows = self._convert_rows(data)

        # Pass 4
        logger.info("Restaurant Parser — Pass 4: Grounding check")
        rows = self._ground_and_verify(client, text, rows)

        return rows

    def _call_claude(self, client, system: str, user_content: str, max_tokens: int = 4096) -> str:
        message = client.messages.create(
            model="claude-sonnet-4-5-20250929",
            max_tokens=max_tokens,
            system=system,
            messages=[{"role": "user", "content": user_content}],
        )
        return message.content[0].text.strip()

    def _call_claude_with_content(self, client, system: str, content: list, max_tokens: int = 4096) -> str:
        message = client.messages.create(
            model="claude-sonnet-4-5-20250929",
            max_tokens=max_tokens,
            system=system,
            messages=[{"role": "user", "content": content}],
        )
        return message.content[0].text.strip()

    @staticmethod
    def _extract_pdf_text(pdf_path: Path) -> str:
        try:
            import pdfplumber
            text_parts = []
            with pdfplumber.open(pdf_path) as pdf:
                for page in pdf.pages:
                    page_text = page.extract_text() or ""
                    text_parts.append(page_text)
                    for table in page.extract_tables() or []:
                        for row in table:
                            if row:
                                cells = [str(c) for c in row if c]
                                if cells:
                                    text_parts.append(" | ".join(cells))
            return "\n".join(text_parts)
        except Exception as e:
            logger.warning("Could not extract PDF text for grounding: %s", e)
            return ""

    def _parse_json(self, raw: str) -> list[dict]:
        text = raw.strip()
        if text.startswith("```"):
            lines = text.split("\n")
            end = len(lines) - 1
            while end > 0 and not lines[end].strip().startswith("```"):
                end -= 1
            if end > 0:
                text = "\n".join(lines[1:end])
            else:
                text = "\n".join(lines[1:])

        try:
            data = json.loads(text)
        except json.JSONDecodeError:
            last_complete = text.rfind("},")
            if last_complete == -1:
                last_complete = text.rfind("}\n]")
            if last_complete > 0:
                truncated = text[:last_complete + 1] + "\n]"
                try:
                    data = json.loads(truncated)
                    logger.info("Recovered %d rows from truncated JSON", len(data) if isinstance(data, list) else 0)
                except json.JSONDecodeError as e:
                    logger.warning("Restaurant parser returned invalid JSON: %s", e)
                    return []
            else:
                logger.warning("Restaurant parser returned invalid JSON and no recovery possible")
                return []

        if not isinstance(data, list):
            return []
        return [item for item in data if isinstance(item, dict)]

    def _convert_rows(self, data: list[dict]) -> list[ParsedMenuRow]:
        rows = []
        for item in data:
            date_ranges = []
            for dr in item.get("date_ranges", []) or []:
                d_from = parse_date(dr.get("date_from"))
                d_to = parse_date(dr.get("date_to"))
                if d_from and d_to:
                    date_ranges.append(ParsedDateRange(date_from=d_from, date_to=d_to))

            parsed = ParsedMenuRow(
                restaurant_name=item.get("restaurant_name", ""),
                city=item.get("city", ""),
                menu_name=clean_string(item.get("menu_name")),
                description=clean_string(item.get("description")),
                lunch_price=parse_price(item.get("lunch_price")),
                dinner_price=parse_price(item.get("dinner_price")),
                lunch_child_price=parse_price(item.get("lunch_child_price")),
                dinner_child_price=parse_price(item.get("dinner_child_price")),
                course_1=clean_string(item.get("course_1")),
                course_2=clean_string(item.get("course_2")),
                course_3=clean_string(item.get("course_3")),
                course_4=clean_string(item.get("course_4")),
                course_5=clean_string(item.get("course_5")),
                min_pax=parse_int(item.get("min_pax")),
                drink_included=clean_string(item.get("drink_included")),
                season_code=clean_string(item.get("season_code")),
                date_ranges=date_ranges,
                note=clean_string(item.get("note")),
                address=clean_string(item.get("address")),
                phone=clean_string(item.get("phone")),
                email=clean_string(item.get("email")),
            )
            rows.append(parsed)
        return rows

    def _ground_and_verify(self, client, source_text: str, rows: list[ParsedMenuRow]) -> list[ParsedMenuRow]:
        """Pass 4: Verify rows against source text."""
        if not rows:
            return rows

        rows_json = json.dumps([self._menu_row_to_dict(r) for r in rows], ensure_ascii=False, indent=2)
        user_content = (
            f"ORIGINAL SOURCE TEXT:\n---\n{source_text[:40000]}\n---\n\n"
            f"EXTRACTED ROWS:\n{rows_json}"
        )

        raw = self._call_claude(client, system=GROUNDING_PROMPT, user_content=user_content, max_tokens=8000)
        verified_data = self._parse_json(raw)
        if verified_data:
            verified_rows = self._convert_rows(verified_data)
            logger.info("Grounding verification — %d/%d rows confirmed", len(verified_rows), len(rows))
            return verified_rows

        logger.info("Grounding check — keeping all %d rows (verification returned no data)", len(rows))
        return rows

    @staticmethod
    def _menu_row_to_dict(row: ParsedMenuRow) -> dict:
        return {
            "restaurant_name": row.restaurant_name or "",
            "city": row.city or "",
            "menu_name": row.menu_name,
            "description": row.description,
            "lunch_price": float(row.lunch_price) if row.lunch_price is not None else None,
            "dinner_price": float(row.dinner_price) if row.dinner_price is not None else None,
            "lunch_child_price": float(row.lunch_child_price) if row.lunch_child_price is not None else None,
            "dinner_child_price": float(row.dinner_child_price) if row.dinner_child_price is not None else None,
            "course_1": row.course_1,
            "course_2": row.course_2,
            "course_3": row.course_3,
            "course_4": row.course_4,
            "course_5": row.course_5,
            "min_pax": row.min_pax,
            "drink_included": row.drink_included,
            "season_code": row.season_code,
            "date_ranges": [
                {
                    "date_from": dr.date_from.isoformat() if dr.date_from else None,
                    "date_to": dr.date_to.isoformat() if dr.date_to else None,
                }
                for dr in row.date_ranges
            ],
            "note": row.note,
            "address": row.address,
            "phone": row.phone,
            "email": row.email,
        }
