"""AI-powered parser for transportation pricing documents.

Same 4-pass pipeline as restaurant_ai_parser.py but with transportation-specific prompts.
"""
from __future__ import annotations

import base64
import json
import logging
from pathlib import Path

from app.parsers.base import ParsedTransportRow
from app.config import settings
from app.utils import parse_price, parse_int, clean_string

logger = logging.getLogger(__name__)

# ============================================================
#  PASS 1 — Document analysis
# ============================================================

ANALYSIS_PROMPT = """You are a senior transportation pricing analyst for a DMC (Destination Management Company) specialising in Morocco and similar markets.

You have been given a transportation pricing document. Before ANY extraction, perform a full structural analysis.

YOUR TASK — produce a structured analysis in plain text (NOT JSON). Cover all of these points:

1. DOCUMENT TYPE
   What kind of document is this? (Transfer pricing / Bus charter / Excursion pricing / Multi-service brochure / Other)
   Is this a complete pricing document or a partial/fragment?

2. COMPANIES FOUND
   List every transport company name and code you can identify.
   Note any company codes or reference numbers.

3. VEHICLE TYPES FOUND
   What vehicles are listed? (Bus 7-seater, 17-seater, 30-seater, 40-seater, 54-seater, etc.)
   Are there different vehicle categories (minibus, coach, etc.)?

4. SERVICE TYPES FOUND
   What service types are present? (Transfer, Roundtrip, Soirée, Excursion, Mise à Disposition)
   Are there single-letter codes? (T=Transfer, R=Roundtrip, S=Soirée, E=Excursion, M=Mise à Dispo)

5. PRICE STRUCTURE
   Are prices per vehicle or per person?
   What currency?
   Are there different prices for different routes/destinations?

6. ROUTE INFORMATION
   List the routes/destinations mentioned (e.g. Airport - Hotel, City tours, etc.)
   Are there city-specific sections?

7. SPECIAL CONDITIONS
   Number of days for multi-day services?
   Any restrictions, supplements, or notes?

8. EXTRACTION PLAN
   How many JSON rows you expect to produce.
   Flag anything uncertain.

Be thorough. A good analysis here directly improves extraction accuracy."""

# ============================================================
#  PASS 2 — Extraction
# ============================================================

EXTRACTION_PROMPT_TEMPLATE = """You are a transportation pricing extraction engine for a DMC.

You have already performed a structural analysis of this document:
--- BEGIN ANALYSIS ---
{analysis}
--- END ANALYSIS ---

Now extract ALL transportation pricing data using your analysis above as a guide.

EXTRACTION RULES:
1. Use your analysis to navigate the document — do not re-discover structure
2. Output one row per unique combination of: company × product × service_type × route
3. service_type MUST be one of: "transfer", "roundtrip", "soiree", "excursion", "mise_a_dispo"
   - Map: T/Transfer/Transfert → "transfer", R/Round Trip/Roundtrip → "roundtrip", S/Soirée → "soiree", E/Excursion → "excursion", M/Mise à Dispo/Mise a Dispo → "mise_a_dispo"
4. code: the unique identifier code for this service (e.g. AMDK07S1)
5. price: the price for this service (numeric, no currency symbols)
6. company_name: the transport company name
7. company_code: the company code abbreviation
8. product: vehicle description (e.g. "Bus 07 seater")
9. bus_size: integer vehicle capacity (7, 17, 30, 40, 54, etc.)
10. days: number of days for multi-day services (integer)
11. route_description: the route or service description (e.g. "Airport - Hotel / Marrakech")
12. city: the city this service operates in
13. If a field is genuinely absent from the document, use null — do not invent values

NORMALISATION:
- European price format (1.695,00) should be converted to standard decimal (1695.00)
- Strip currency symbols from prices, output clean numbers
- Bus sizes should be integers only

RESPOND ONLY with a valid JSON array. No backticks. No explanation.

Schema for each row:
{{
  "code": "string or null",
  "price": number or null,
  "company_name": "Company name",
  "company_code": "Company code",
  "product": "Vehicle description",
  "bus_size": integer or null,
  "service_type": "transfer | roundtrip | soiree | excursion | mise_a_dispo",
  "days": integer or null,
  "route_description": "Route/service description",
  "note": "conditions, supplements, special notes or null",
  "city": "City name"
}}"""

# ============================================================
#  PASS 3 — Validation
# ============================================================

VALIDATION_PROMPT = """You are a transportation data quality validator for a DMC.

You have been given extracted transportation pricing rows as JSON. Your job is to find logical errors and fix them.

CHECK FOR:
1. PRICE REASONABLENESS
   - Per-vehicle prices that seem too low (< 100 MAD) or unreasonably high (> 100000 MAD)
   - Prices of 0 — set to null

2. SERVICE TYPE NORMALISATION
   - service_type must be exactly one of: transfer, roundtrip, soiree, excursion, mise_a_dispo
   - Fix any variations (e.g. "Transfer" → "transfer", "Mise a Dispo" → "mise_a_dispo")

3. BUS SIZE VALIDATION
   - bus_size must be a positive integer
   - Common sizes: 7, 17, 30, 40, 54
   - Extract from product description if missing

4. COMPLETENESS
   - Company name/code missing — keep as-is but add note
   - City missing — try to infer from route_description if possible

5. CONSISTENCY
   - Normalise company codes to uppercase
   - Ensure days is a positive integer

FIX issues where you can. Add notes about what you fixed.
RESPOND ONLY with the corrected JSON array (same schema). No backticks."""

# ============================================================
#  PASS 4 — Grounding verification
# ============================================================

GROUNDING_PROMPT = """You are a transportation data quality checker. Your job is to REMOVE hallucinated data.

You have:
1. The ORIGINAL source text from a transportation document
2. Some extracted rows

For each row, check:
- Does the company name/code appear in the source?
- Can the price values be traced to numbers in the source?
- Does the service type correspond to something mentioned in the document?
- Is the route description consistent with what the document describes?

RULES:
- If a price cannot be traced to any number in the source, REMOVE the row
- If the company name is clearly invented, REMOVE the row
- Be strict: when in doubt, REMOVE the row

RESPOND ONLY with a JSON array of rows that are VERIFIED correct.
If ALL rows are hallucinated, return an empty array: []
No backticks. No explanation."""


# ============================================================
#  PARSER CLASS
# ============================================================

class TransportationAiParser:
    def parse_pdf(self, pdf_path: Path) -> list[ParsedTransportRow]:
        """Parse a transportation PDF using vision-based Claude."""
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
        logger.info("Transport Parser (vision) — Pass 1: Analysing document structure")
        analysis = self._call_claude_with_content(
            client, system=ANALYSIS_PROMPT,
            content=[pdf_block, {"type": "text", "text": "Analyse this transportation pricing document."}],
            max_tokens=3000,
        )
        logger.info("Transport Parser (vision) — Pass 1 complete (%d chars)", len(analysis))

        # Pass 2: Extraction
        logger.info("Transport Parser (vision) — Pass 2: Extracting transport prices")
        extraction_system = EXTRACTION_PROMPT_TEMPLATE.format(analysis=analysis)
        extraction_raw = self._call_claude_with_content(
            client, system=extraction_system,
            content=[pdf_block, {"type": "text", "text": "Extract all transportation pricing data from this document."}],
            max_tokens=16000,
        )
        data = self._parse_json(extraction_raw)
        logger.info("Transport Parser (vision) — Pass 2 complete: %d rows extracted", len(data))

        if not data:
            return []

        # Pass 3: Validation
        logger.info("Transport Parser (vision) — Pass 3: Validating extracted data")
        validation_input = json.dumps(data, ensure_ascii=False, indent=2)
        validation_raw = self._call_claude(
            client, system=VALIDATION_PROMPT,
            user_content=f"Validate and fix these extracted rows:\n{validation_input}",
            max_tokens=16000,
        )
        validated = self._parse_json(validation_raw)
        if validated:
            data = validated
            logger.info("Transport Parser (vision) — Pass 3 complete: %d rows", len(data))
        else:
            logger.warning("Transport Parser (vision) — Pass 3 returned invalid JSON, keeping pass 2 results")

        rows = self._convert_rows(data)

        # Pass 4: Grounding
        source_text = self._extract_pdf_text(pdf_path)
        if source_text:
            logger.info("Transport Parser (vision) — Pass 4: Grounding check")
            rows = self._ground_and_verify(client, source_text, rows)

        return rows

    def parse_text(self, text: str) -> list[ParsedTransportRow]:
        """Parse transportation text content."""
        if not settings.anthropic_api_key or settings.anthropic_api_key == "your-api-key-here":
            raise RuntimeError("Anthropic API key not configured")

        import anthropic
        client = anthropic.Anthropic(api_key=settings.anthropic_api_key)

        if len(text) > 80000:
            text = text[:80000] + "\n... (truncated)"

        # Pass 1
        logger.info("Transport Parser — Pass 1: Analysing document structure")
        analysis = self._call_claude(client, system=ANALYSIS_PROMPT, user_content=text, max_tokens=3000)
        logger.info("Transport Parser — Pass 1 complete (%d chars)", len(analysis))

        # Pass 2
        logger.info("Transport Parser — Pass 2: Extracting transport prices")
        extraction_system = EXTRACTION_PROMPT_TEMPLATE.format(analysis=analysis)
        extraction_raw = self._call_claude(client, system=extraction_system, user_content=text, max_tokens=16000)
        data = self._parse_json(extraction_raw)
        logger.info("Transport Parser — Pass 2 complete: %d rows extracted", len(data))

        if not data:
            return []

        # Pass 3
        logger.info("Transport Parser — Pass 3: Validating extracted data")
        validation_input = json.dumps(data, ensure_ascii=False, indent=2)
        validation_raw = self._call_claude(
            client, system=VALIDATION_PROMPT,
            user_content=f"Validate and fix these extracted rows:\n{validation_input}",
            max_tokens=16000,
        )
        validated = self._parse_json(validation_raw)
        if validated:
            data = validated
            logger.info("Transport Parser — Pass 3 complete: %d rows", len(data))
        else:
            logger.warning("Transport Parser — Pass 3 returned invalid JSON, keeping pass 2 results")

        rows = self._convert_rows(data)

        # Pass 4
        logger.info("Transport Parser — Pass 4: Grounding check")
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
                    logger.warning("Transport parser returned invalid JSON: %s", e)
                    return []
            else:
                logger.warning("Transport parser returned invalid JSON and no recovery possible")
                return []

        if not isinstance(data, list):
            return []
        return [item for item in data if isinstance(item, dict)]

    @staticmethod
    def _normalize_service_type(stype: str | None) -> str:
        """Normalize service type to one of the standard values."""
        if not stype:
            return "transfer"
        low = stype.lower().strip()
        if low in ("t", "transfer", "transfert"):
            return "transfer"
        if low in ("r", "roundtrip", "round trip", "round-trip", "aller-retour"):
            return "roundtrip"
        if low in ("s", "soiree", "soirée"):
            return "soiree"
        if low in ("e", "excursion", "excurtion"):
            return "excursion"
        if low in ("m", "mise_a_dispo", "mise a dispo", "mise à dispo", "mise à disposition", "mise a disposition"):
            return "mise_a_dispo"
        return low if low in ("transfer", "roundtrip", "soiree", "excursion", "mise_a_dispo") else "transfer"

    def _convert_rows(self, data: list[dict]) -> list[ParsedTransportRow]:
        rows = []
        for item in data:
            parsed = ParsedTransportRow(
                code=clean_string(item.get("code")) or "",
                price=parse_price(item.get("price")),
                company_name=item.get("company_name", ""),
                company_code=(clean_string(item.get("company_code")) or "").upper(),
                product=clean_string(item.get("product")) or "",
                bus_size=parse_int(item.get("bus_size")),
                service_type=self._normalize_service_type(item.get("service_type")),
                days=parse_int(item.get("days")),
                route_description=clean_string(item.get("route_description")) or "",
                note=clean_string(item.get("note")) or "",
                city=item.get("city", ""),
            )
            rows.append(parsed)
        return rows

    def _ground_and_verify(self, client, source_text: str, rows: list[ParsedTransportRow]) -> list[ParsedTransportRow]:
        """Pass 4: Verify rows against source text."""
        if not rows:
            return rows

        rows_json = json.dumps([self._transport_row_to_dict(r) for r in rows], ensure_ascii=False, indent=2)
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
    def _transport_row_to_dict(row: ParsedTransportRow) -> dict:
        return {
            "code": row.code or "",
            "price": float(row.price) if row.price is not None else None,
            "company_name": row.company_name or "",
            "company_code": row.company_code or "",
            "product": row.product or "",
            "bus_size": row.bus_size,
            "service_type": row.service_type,
            "days": row.days,
            "route_description": row.route_description or "",
            "note": row.note or "",
            "city": row.city or "",
        }
