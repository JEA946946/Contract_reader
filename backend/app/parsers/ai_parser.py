from __future__ import annotations

import base64
import json
import logging
from pathlib import Path

from app.parsers.base import BaseParser, ParsedPriceRow, ParsedDateRange
from app.config import settings
from app.utils import parse_price, parse_date, parse_int, clean_string

logger = logging.getLogger(__name__)

# ============================================================
#  PASS 1 — Document analysis (think before extracting)
# ============================================================

ANALYSIS_PROMPT = """You are a senior hotel contract analyst for a DMC (Destination Management Company) specialising in Morocco and similar markets.

You have been given a hotel contract document. Before ANY extraction, you must perform a full structural analysis.

YOUR TASK — produce a structured analysis in plain text (NOT JSON). Cover all of these points:

1. DOCUMENT TYPE
   What kind of document is this? (Rate sheet / Allotment contract / Amendment letter / Supplement addendum / Season calendar / Multi-hotel brochure / Other)
   Is this a complete contract or a partial/fragment?

2. HOTELS FOUND
   List every hotel name you can identify. If multiple hotels share this document, name them all.
   Note any hotel codes or reference numbers used internally.

3. PRICE STRUCTURE
   Are rates per room per night, or per person per night? (Critical — affects all calculations)
   IMPORTANT: Look for "½ chambre double", "½ double", "1/2 chambre double", "par personne", "pp/pn" — these all indicate PER-PERSON pricing.
   If per-person: SGL = per_person_rate + single_supplement (NOT double_price + supplement!)
   What room types are present? (SGL, DBL, TWN, TRP, SUITE, etc.)
   What meal basis applies? (BB, HB, FB, AI, RO — and is it stated per room or per section?)
   Is there a single supplement stated? Where? Note the exact amount.
   Is there a meal supplement (demi-pension/HB)? Is it per person or per room?

4. SEASON STRUCTURE
   How are seasons defined? (Named: HS/LS/Peak / Calendar months / Explicit dates / Grid columns / Other)
   Where are the season DATE DEFINITIONS located? (Page X, table header, separate sheet, etc.)
   Are there any seasons defined by name that require cross-referencing to find dates?
   List every season you found and its associated dates if visible.

5. RATE TABLE LOCATIONS
   Which pages or sections contain actual rate tables?
   Describe the column structure of each table.
   Are there any tables that use merged cells or unusual layouts?
   Are any rates written as shorthand (e.g. "120/140/160" or "+30 supplement")?

6. CHILD POLICY
   Where is the child policy? (Same table / Footnote / Separate section / Not present)
   What age brackets are used? (Exact wording from document)
   Are child rates absolute amounts, percentages, or described as FREE?

7. SUPPLEMENTS & MODIFIERS
   List all supplements found (sea view, single supplement, holiday surcharge, peak night surcharge, etc.)
   Note exactly where each supplement is defined and what it applies to.

8. SPECIAL CONDITIONS
   Minimum stay requirements — where stated and for which seasons?
   Release periods / allotment conditions?
   Any "ON REQUEST", "CLSD", or "TBC" entries — for which periods?
   Any promotional rates, early booking discounts, or long-stay offers?

9. LANGUAGE & FORMAT ISSUES
   Is the document multilingual? Which languages?
   Are there any sections where the layout makes extraction ambiguous or difficult?
   Any scanning artefacts, poor formatting, or missing pages suspected?

10. EXTRACTION PLAN
    Before extracting, state your plan: how many JSON rows you expect to produce, which seasons and hotels, and any calculations needed (e.g. per-person → per-room conversion, supplement application).
    Flag anything you are uncertain about.

Be thorough. A good analysis here directly improves extraction accuracy."""

# ============================================================
#  PASS 2 — Extraction (informed by analysis)
# ============================================================

FEW_SHOT_EXAMPLES = """
EXAMPLES OF CORRECT EXTRACTION:

--- EXAMPLE 1: Compact rate shorthand ---
Input text:
  "Hotel Kenzi Tower, Casablanca ****
   BB rates 2026:
   01/01–28/02 (Low):  SGL 850 / DBL 1100 / TWN 1100 MAD
   01/03–31/05 (Shldr): SGL 950 / DBL 1250 / TWN 1250 MAD
   CHD 2-11: 50% of DBL | Baby 0-2: FOC"

Correct output:
[
  {"accommodation":"Kenzi Tower","city":"Casablanca","room_desc":"Std","stars":4,"meal_plan":"BB",
   "season_code":"L","date_ranges":[{"date_from":"2026-01-01","date_to":"2026-02-28"}],
   "single_price":850,"double_price":1100,"twin_price":1100,
   "baby_discount":"FREE","child_discount":"50% of DBL","fit_git":"FIT"},
  {"accommodation":"Kenzi Tower","city":"Casablanca","room_desc":"Std","stars":4,"meal_plan":"BB",
   "season_code":"Shoulder","date_ranges":[{"date_from":"2026-03-01","date_to":"2026-05-31"}],
   "single_price":950,"double_price":1250,"twin_price":1250,
   "baby_discount":"FREE","child_discount":"50% of DBL","fit_git":"FIT"}
]

--- EXAMPLE 2: Per-person rates that must be converted to per-room ---
Input text:
  "Riad Dar Zitoun — HB group rates (min 10 pax)
   High Season (Apr–Jun): 75 EUR pp/pn
   Single supplement: +30 EUR"

Correct output (normalized to per room):
[
  {"accommodation":"Riad Dar Zitoun","city":"","room_desc":"Std","stars":null,"meal_plan":"HB",
   "season_code":"H","date_ranges":[],
   "single_price":105,"double_price":150,"twin_price":150,
   "fit_git":"GIT","min_stay":null,
   "note":"Per-person rate 75 EUR. DBL/TWN=75×2=150. SGL=75+30 supp=105. Min group 10 pax."}
]

--- EXAMPLE 4: Moroccan "½ double" (per-person) pricing with single supplement ---
Input text:
  "HOTEL DIWAN – Rabat ****
   Tarif Individuel en BB:
   Basse Saison: ½ Chambre Double 350 MAD / Supplément Single 250 MAD
   Haute Saison: ½ Chambre Double 450 MAD / Supplément Single 300 MAD
   Supplément Demi-Pension: 130 MAD par personne"

CRITICAL: "½ Chambre Double" means HALF of a double room = per-person rate.
  - DBL/TWN = per_person_rate × 2
  - SGL = per_person_rate + single_supplement (NOT double_price + supplement!)
  - DP/HB supplement is mentioned but NO explicit HB prices → do NOT create HB rows, just note it

Correct output (BB rows only — HB supplement noted but NOT computed as separate rows):
[
  {"accommodation":"Diwan","city":"Rabat","room_desc":"Std","stars":4,"meal_plan":"BB",
   "season_code":"L","date_ranges":[],
   "single_price":600,"double_price":700,"twin_price":700,
   "fit_git":"FIT",
   "note":"½ dbl=350 MAD pp. DBL/TWN=350×2=700. SGL=350+250 supp=600. HB supplement 130 MAD pp available."},
  {"accommodation":"Diwan","city":"Rabat","room_desc":"Std","stars":4,"meal_plan":"BB",
   "season_code":"H","date_ranges":[],
   "single_price":750,"double_price":900,"twin_price":900,
   "fit_git":"FIT",
   "note":"½ dbl=450 MAD pp. DBL/TWN=450×2=900. SGL=450+300 supp=750. HB supplement 130 MAD pp available."}
]

--- EXAMPLE 5: French per-person pricing with MULTIPLE meal plans EXPLICITLY listed ---
Input text:
  "HOTEL AGADIR BEACH CLUB ****
   Prix net par personne en chambre double
   SAISON A: 01.05.2026/30.06.2026, 01.09.2026/31.10.2026
   SAISON C: 01.07.2026/31.08.2026 — SEJOUR MINIMUM 3 NUITS
   Chambre double en BB | 480 | —
   Chambre double en DP | 690 | 860
   All inclusive | 1050 | 1200
   Supplément single/jour | 400 | 400
   Taxe prom. touristique | 8.8 | 8.8
   Taxe communale | 8.8 | 8.8"

CRITICAL: Rates are per-person → convert to per-room. Taxes are separate → note them but do NOT add.
  - DBL = per_person_rate × 2
  - SGL = per_person_rate + single_supplement
  - BB, DP, AI are EACH explicitly listed with their OWN rates → extract each as a separate row
  - Tax listed separately → note in "note" field, do NOT add to prices

Correct output:
[
  {"accommodation":"Agadir Beach Club","city":"Agadir","room_desc":"Std","stars":4,"meal_plan":"BB",
   "season_code":"A","date_ranges":[{"date_from":"2026-05-01","date_to":"2026-06-30"},{"date_from":"2026-09-01","date_to":"2026-10-31"}],
   "single_price":880,"double_price":960,"twin_price":960,
   "fit_git":"FIT","min_stay":null,
   "note":"pp=480, sgl_supp=400. DBL=480×2=960. SGL=480+400=880. Tax 8.8+8.8=17.6 pp/pn not included."},
  {"accommodation":"Agadir Beach Club","city":"Agadir","room_desc":"Std","stars":4,"meal_plan":"HB",
   "season_code":"A","date_ranges":[{"date_from":"2026-05-01","date_to":"2026-06-30"},{"date_from":"2026-09-01","date_to":"2026-10-31"}],
   "single_price":1090,"double_price":1380,"twin_price":1380,
   "fit_git":"FIT","min_stay":null,
   "note":"pp=690, sgl_supp=400. DBL=690×2=1380. SGL=690+400=1090. Tax 8.8+8.8=17.6 pp/pn not included."},
  {"accommodation":"Agadir Beach Club","city":"Agadir","room_desc":"Std","stars":4,"meal_plan":"HB",
   "season_code":"C","date_ranges":[{"date_from":"2026-07-01","date_to":"2026-08-31"}],
   "single_price":1260,"double_price":1720,"twin_price":1720,
   "fit_git":"FIT","min_stay":3,
   "note":"pp=860, sgl_supp=400. DBL=860×2=1720. SGL=860+400=1260. Tax 8.8+8.8=17.6 pp/pn not included."},
  {"accommodation":"Agadir Beach Club","city":"Agadir","room_desc":"Std","stars":4,"meal_plan":"AI",
   "season_code":"A","date_ranges":[{"date_from":"2026-05-01","date_to":"2026-06-30"},{"date_from":"2026-09-01","date_to":"2026-10-31"}],
   "single_price":1450,"double_price":2100,"twin_price":2100,
   "fit_git":"FIT","min_stay":null,
   "note":"pp=1050, sgl_supp=400. DBL=1050×2=2100. SGL=1050+400=1450. Tax 8.8+8.8=17.6 pp/pn not included."},
  {"accommodation":"Agadir Beach Club","city":"Agadir","room_desc":"Std","stars":4,"meal_plan":"AI",
   "season_code":"C","date_ranges":[{"date_from":"2026-07-01","date_to":"2026-08-31"}],
   "single_price":1600,"double_price":2400,"twin_price":2400,
   "fit_git":"FIT","min_stay":3,
   "note":"pp=1200, sgl_supp=400. DBL=1200×2=2400. SGL=1200+400=1600. Tax 8.8+8.8=17.6 pp/pn not included."}
]

--- EXAMPLE 3: Season names defined separately from rates ---
Input text (page 1):
  "Season calendar: A = 01/06–15/07 | B = 16/07–31/08 | C = 01/09–30/09"
Input text (page 3):
  "Season A: DBL 180 EUR | Season B: DBL 220 EUR | Season C: DBL 160 EUR"

Correct output (seasons resolved using page 1 definitions):
[
  {"room_desc":"Std","season_code":"A","date_ranges":[{"date_from":"2026-06-01","date_to":"2026-07-15"}],"double_price":180,
   "note":"Season dates resolved from calendar table"},
  {"room_desc":"Std","season_code":"B","date_ranges":[{"date_from":"2026-07-16","date_to":"2026-08-31"}],"double_price":220,
   "note":"Season dates resolved from calendar table"},
  {"room_desc":"Std","season_code":"C","date_ranges":[{"date_from":"2026-09-01","date_to":"2026-09-30"}],"double_price":160,
   "note":"Season dates resolved from calendar table"}
]
"""

EXTRACTION_PROMPT_TEMPLATE = """You are a hotel contract data extraction engine for a DMC.

You have already performed a structural analysis of this document:
--- BEGIN ANALYSIS ---
{analysis}
--- END ANALYSIS ---

{few_shot}

Now extract ALL rate data using your analysis above as a guide.

EXTRACTION RULES:
1. Use your analysis to navigate the document — do not re-discover structure, use what you found
2. Cross-reference season names to their date definitions (you noted where these are in your analysis)
3. Apply SINGLE SUPPLEMENT inline — if base DBL = 100 and single supplement = +30, output single_price = 130 and note it. But do NOT apply meal supplements or taxes to prices (see rules 13, 14).
4. **PER-PERSON / "½ DOUBLE" CONVERSION** (CRITICAL — get this right):
   - "½ chambre double", "½ double", "1/2 chambre double", "per person per night", "pp/pn", "par personne" all mean PER-PERSON rate
   - The per-person rate is the BASE for ALL calculations:
     • DBL = per_person_rate × 2
     • TWN = per_person_rate × 2
     • SGL = per_person_rate + single_supplement  ← THIS IS THE PER-PERSON RATE + SUPPLEMENT, **NOT** THE DOUBLE PRICE + SUPPLEMENT!
   - Meal supplements (DP/HB/FB/AI) that are "par personne" / "pp":
     • Add to DBL/TWN: base_dbl + (meal_supp × 2)
     • Add to SGL: base_sgl + meal_supp
   - Always note the original per-person rate and calculation in the "note" field
5. If a season spans a date range that crosses a year boundary, include the year
6. For child rates: prefer absolute amounts; if percentage only, output as "50% of DBL" verbatim
7. For ON REQUEST / CLSD periods: still output a row, set the rate fields to null with note "ON REQUEST" or "CLOSED"
8. If you found multiple hotels, output separate rows per hotel per season
9. If a field is genuinely absent from the document, use null — do not invent values
10. Output one row per hotel × room_type × season × meal_plan combination. Set room_desc to the room type (Std, Superior, Deluxe, Suite, Junior Suite, etc.). Use "Std" for standard/default rooms.
    CRITICAL — "Single", "Double", "Triple" and "Quadruple" are OCCUPANCY TYPES, not room types. A "Chambre Single" and "Chambre Double" are the SAME standard room ("Std") with 1 or 2 guests. Merge them into ONE row: single_price from the single rate, double_price from the double rate. "Chambre Triple" is triple occupancy — put its rate in triple_price. "Chambre Quadruple" is quadruple occupancy — put its rate in quadruple_price. NEVER create a room_desc of "Single", "Double", "Triple" or "Quadruple" — these are occupancy, not room names.
11. FIT/GIT: use "FIT" for individual rates, "GIT" for group rates. If both, output separate rows.
12. When the document has BOTH individual/FIT rates AND group/GIT rates, output SEPARATE rows for each.
13. **MEAL PLAN SUPPLEMENTS** (IMPORTANT — do NOT invent rows):
   - Only create a row for a meal plan if the document EXPLICITLY lists a RATE for that meal plan (e.g., a separate table row showing "HB: 690 per person" or "Demi-Pension: 850 per room").
   - If the document only MENTIONS a supplement amount (e.g., "Supplément Demi-Pension: 200 MAD pp" or "DP supplement available"), do NOT create computed HB/DP rows. Instead, note the supplement in the "note" field of the BB row (e.g., "HB supplement 200 MAD pp available").
   - The difference: "HB rate = 690" is an explicit rate → create an HB row. "HB supplement = +200 pp on top of BB" is a supplement → note it, don't compute.
14. **TOURIST TAX / TAXE DE SÉJOUR** (IMPORTANT — do NOT add to prices):
   - NEVER add taxes to prices. Extract prices exactly as written in the document.
   - If the document mentions "taxe de séjour", "tourist tax", "city tax", "taxe de promotion touristique", "taxe communale", etc., note the tax amount in the "note" field.
   - Example: rate = 900 MAD HT, tax = 25 MAD pp/pn → double_price = 900, note = "Tax 25 MAD pp/pn not included"
   - This applies even when converting per-person → per-room: only convert the BASE rate, do NOT add tax.
   - Example: pp=480, sgl_supp=400, tax=17.6 pp → DBL=480×2=960, SGL=480+400=880, note = "Tax 17.6 pp/pn not included"
15. **SUITE / SINGLE-RATE ROOMS** (IMPORTANT):
   - When a room type (Suite, Junior Suite, etc.) has only ONE rate listed in the document (not split by SGL/DBL), this means it is a flat PER-ROOM rate.
   - Set BOTH single_price AND double_price to that same rate (the room costs the same whether 1 or 2 guests).
   - twin_price should also be the same rate.
   - Example: "Suite Junior: 970" → single_price = 970, double_price = 970, twin_price = 970

NORMALISATION:
- Dates must be YYYY-MM-DD format. If only month name given, use first/last day of month.
- Date ranges MUST always have BOTH date_from AND date_to. Never output a single date.
  If only an end date is given (e.g. "until 01/11/2026"), use 01/01 of that year as date_from → "2026-01-01" to "2026-11-01".
  If only a start date is given (e.g. "from 01/03/2026"), use 31/12 of that year as date_to → "2026-03-01" to "2026-12-31".
- Meal plans: "Bed & Breakfast"/"Petit déjeuner"/"B&B"/"PD" → "BB", "Half Board"/"Demi-pension"/"DP" → "HB",
  "Full Board"/"Pension complète"/"PC" → "FB", "All Inclusive"/"Tout compris"/"TI" → "AI", "Room Only"/"Sans repas" → "RO"
- Season codes: use SHORT codes: "Basse Saison"/"Low Season" → "L", "Haute Saison"/"High Season"/"Peak Season" → "H", "Mid Season" → "M".
  If the document defines e.g. "Low Season 1" and "Low Season 2" with the SAME prices, merge them into ONE row with season_code "L" and MULTIPLE date_ranges.
- Stars: "****" / "4 stars" / "4 étoiles" → 4 (integer)
- Strip currency symbols from prices, output clean numbers

SELF-VALIDATION CHECKLIST — before outputting, verify every row against these rules:
□ Dates: date_to >= date_from, format YYYY-MM-DD, year present
□ Rates: SGL should NOT exceed DBL by more than 40% (likely unconverted per-person rate)
□ ½ double check: if per-person rate X with supplement S → DBL = X×2, SGL = X+S (NOT DBL+S)
□ TWN ≈ DBL (usually equal or very close)
□ No zero prices (set to null instead)
□ Suite/premium rooms with only one rate → set single_price = double_price = that rate
□ Taxes NEVER added to prices — note them separately
□ HB/DP rows only if document has EXPLICIT HB rates (not computed from supplement)
□ Meal plan codes normalized (BB/HB/FB/AI/RO)
□ Stars is integer 1-5 or null
□ room_desc is never "Single"/"Double"/"Triple" (those are occupancy, not room types)
□ fit_git is "FIT" or "GIT"

RESPOND ONLY with a valid JSON array. No backticks. No explanation. No preamble.

Schema for each row:
{{
  "accommodation": "Hotel name only (without room type, without stars)",
  "city": "City name",
  "room_desc": "Room type as written in the document (e.g. Chambre Privilège, Suite Junior, Chambre Standard, etc). Use 'Std' only if no room name is given.",
  "stars": integer or null,
  "hotel_type": "Hotel / Riad / Kasbah / etc or null",
  "meal_plan": "BB / HB / FB / AI / RO or null",
  "fit_git": "FIT / GIT or null",
  "season_code": "season label or code",
  "date_ranges": [{{"date_from": "YYYY-MM-DD", "date_to": "YYYY-MM-DD"}}],
  "double_price": number or null,
  "single_price": number or null,
  "twin_price": number or null,
  "triple_price": number or null,
  "quadruple_price": number or null,
  "baby_discount": "string or null",
  "child_discount": "string or null",
  "min_stay": integer or null,
  "note": "conditions, supplements applied, conversion notes",
  "address": "string or null",
  "phone": "string or null",
  "email": "string or null"
}}"""

# ============================================================
#  PASS 3 — Validation (logical cross-check)
# ============================================================

VALIDATION_PROMPT = """You are a hotel rate data quality validator for a DMC.

You have been given extracted rate rows as JSON. Your job is to find logical errors and fix them.

CHECK FOR:
1. DATE INTEGRITY
   - Dates that go backwards (date_to before date_from)
   - Years missing from dates — add the most likely year
   - Invalid date formats — fix to YYYY-MM-DD

2. RATE LOGIC
   - SGL rate higher than DBL by more than 40% (likely per-person not converted) — fix if clear
   - **½ DOUBLE CHECK**: If note mentions "½ double" or "per person" rate X with supplement S:
     • DBL should be X × 2 (not X)
     • SGL should be X + S (not DBL + S = X×2+S — that's WRONG)
     • If SGL = DBL + supplement, this is a per-person conversion error — fix to SGL = (DBL/2) + supplement
   - DBL significantly lower than SGL with no supplement explaining the gap
   - TWN rate very different from DBL (usually should be equal or close)
   - Rates of 0 (likely extraction error, not a real zero rate) — set to null
   - **SUITE / SINGLE-RATE ROOMS**: If a Suite, Junior Suite, or similar premium room type has double_price but single_price is null, set single_price = double_price (suites are per-room rates, same price for 1 or 2 guests)
   - **TAX CHECK**: Taxes should NEVER be added to prices. If you see prices that have tax baked in but the source document shows rates "HT" (hors taxe) or lists tax separately, REMOVE the tax from the prices and note it instead. Prices must match what the document states.
   - **SUPPLEMENT CHECK**: If you see HB/DP rows that were COMPUTED by adding a supplement to BB prices (and the document doesn't list explicit HB rates), REMOVE those rows. Note the supplement in the BB row's note field instead.

3. COMPLETENESS
   - Hotel name missing or generic — keep as-is but add note
   - City missing — try to infer from hotel name if possible
   - Season code present but no dates — keep row, dates may not be in document

4. CONSISTENCY
   - Normalise meal plan codes (BB, HB, FB, AI, RO)
   - Normalise fit_git to "FIT" or "GIT"
   - Ensure stars is an integer 1-5 or null
   - Ensure room_desc is set (use "Std" for standard/default rooms, short names for others: Superior, Deluxe, Suite, Triple, Junior Suite)

FIX issues where you can. Add notes about what you fixed.
RESPOND ONLY with the corrected JSON array (same schema). No backticks."""


# ============================================================
#  PASS 4 — Grounding verification (prevent hallucinations)
# ============================================================

# Keywords that indicate each meal plan is present in the source document
MEAL_PLAN_GROUNDING = {
    "RO": ["room only", "logement seul", "sans repas", "hébergement seul", "hebergement seul"],
    "BB": ["petit déj", "petit dej", "breakfast", "b&b", "pdj", "avec petit", "bed and breakfast"],
    "HB": ["demi-pension", "demi pension", "half board", "½ pension", "1 repas complet",
            "repas complet", "nuit + petit déjeuner + 1 repas", "nuit +petit déjeuner+ 1 repas"],
    "FB": ["pension complète", "pension complete", "full board", "3 repas", "tous les repas"],
    "AI": ["all inclusive", "tout compris", "tout inclus", "all-inclusive"],
}

GROUNDING_VERIFICATION_PROMPT = """You are a hotel contract data quality checker. Your job is to REMOVE hallucinated data.

You have:
1. The ORIGINAL source text from a hotel contract
2. Some extracted rows that are SUSPECTED of being hallucinated (invented data not in the document)

For each suspicious row, check:
- Does the meal_plan actually correspond to something offered in the document?
- Can the price values be traced to numbers in the source (even calculated from per-person rates or supplements)?
- Is ANY critical field invented rather than extracted from the source?

RULES:
- If a meal plan is NOT mentioned or implied anywhere in the source document, the row is hallucinated — REMOVE IT
- If prices cannot be traced to any numbers in the source, the row is hallucinated — REMOVE IT
- If only the meal_plan is wrong but everything else is correct, fix the meal_plan if you can determine the correct one
- Be strict: when in doubt, REMOVE the row. It's better to miss data than to include wrong prices.

RESPOND ONLY with a JSON array of rows that are VERIFIED correct (keep the same schema).
If ALL rows are hallucinated, return an empty array: []
No backticks. No explanation."""


# ============================================================
#  PARSER CLASS
# ============================================================

class AiParser(BaseParser):
    def can_handle(self, file_path: Path) -> bool:
        return True

    def parse(self, file_path: Path) -> list[ParsedPriceRow]:
        text = file_path.read_text(encoding="utf-8", errors="replace")
        return self.parse_text(text)

    def parse_pdf(self, pdf_path: Path) -> list[ParsedPriceRow]:
        """Parse a PDF by sending the actual document to Claude (vision).

        This gives Claude the full visual layout context — tables, merged cells,
        headers, formatting — for much more accurate extraction than text-only.
        """
        if not settings.anthropic_api_key or settings.anthropic_api_key == "your-api-key-here":
            raise RuntimeError("Anthropic API key not configured")

        import anthropic

        client = anthropic.Anthropic(api_key=settings.anthropic_api_key)

        pdf_bytes = pdf_path.read_bytes()
        pdf_b64 = base64.standard_b64encode(pdf_bytes).decode("utf-8")

        pdf_block = {
            "type": "document",
            "source": {
                "type": "base64",
                "media_type": "application/pdf",
                "data": pdf_b64,
            },
        }

        # ── PASS 1: Analysis (with PDF vision) — uses Haiku (cheaper) ──
        logger.info("AI Parser (vision) — Pass 1: Analysing document structure (Haiku)")
        analysis = self._call_claude_with_content(
            client,
            system=ANALYSIS_PROMPT,
            content=[pdf_block, {"type": "text", "text": "Analyse this hotel contract document."}],
            max_tokens=3000,
            model=self.ANALYSIS_MODEL,
        )
        logger.info("AI Parser (vision) — Pass 1 complete (%d chars)", len(analysis))

        # ── PASS 2: Extraction + inline validation (with PDF vision) ──
        logger.info("AI Parser (vision) — Pass 2: Extracting rates (with inline validation)")
        extraction_system = EXTRACTION_PROMPT_TEMPLATE.format(
            analysis=analysis,
            few_shot=FEW_SHOT_EXAMPLES,
        )
        extraction_raw = self._call_claude_with_content(
            client,
            system=extraction_system,
            content=[pdf_block, {"type": "text", "text": "Extract all rate data from this document."}],
            max_tokens=16000,
        )
        data = self._parse_json(extraction_raw)
        logger.info("AI Parser (vision) — Pass 2 complete: %d rows extracted", len(data))

        if not data:
            return []

        # ── Optional Pass 3: Separate validation (disabled by default) ──
        if settings.ai_validation_pass_enabled:
            logger.info("AI Parser (vision) — Pass 3: Validating extracted data (separate pass)")
            validation_input = json.dumps(data, ensure_ascii=False, indent=2)
            validation_raw = self._call_claude(
                client,
                system=VALIDATION_PROMPT,
                user_content=f"Validate and fix these extracted rows:\n{validation_input}",
                max_tokens=16000,
            )
            validated = self._parse_json(validation_raw)
            if validated:
                data = validated
                logger.info("AI Parser (vision) — Pass 3 complete: %d rows after validation", len(data))
            else:
                logger.warning("AI Parser (vision) — Pass 3 returned invalid JSON, keeping pass 2 results")

        rows = self._convert_rows(data)

        # ── Grounding verification ──
        # Extract text from PDF for grounding check
        source_text = self._extract_pdf_text(pdf_path)
        if source_text:
            logger.info("AI Parser (vision) — Grounding: check against source text")
            rows = self._ground_and_verify(client, source_text, rows)

        return rows

    def parse_text(self, text: str) -> list[ParsedPriceRow]:
        if not settings.anthropic_api_key or settings.anthropic_api_key == "your-api-key-here":
            raise RuntimeError("Anthropic API key not configured")

        import anthropic

        client = anthropic.Anthropic(api_key=settings.anthropic_api_key)

        # Truncate very long texts
        if len(text) > 80000:
            text = text[:80000] + "\n... (truncated)"

        # ── PASS 1: Analysis — uses Haiku (cheaper) ──
        logger.info("AI Parser — Pass 1: Analysing document structure (Haiku)")
        analysis = self._call_claude(
            client,
            system=ANALYSIS_PROMPT,
            user_content=text,
            max_tokens=3000,
            model=self.ANALYSIS_MODEL,
        )
        logger.info("AI Parser — Pass 1 complete (%d chars)", len(analysis))

        # ── PASS 2: Extraction + inline validation ──
        logger.info("AI Parser — Pass 2: Extracting rates (with inline validation)")
        extraction_system = EXTRACTION_PROMPT_TEMPLATE.format(
            analysis=analysis,
            few_shot=FEW_SHOT_EXAMPLES,
        )
        extraction_raw = self._call_claude(
            client,
            system=extraction_system,
            user_content=text,
            max_tokens=16000,
        )
        data = self._parse_json(extraction_raw)
        logger.info("AI Parser — Pass 2 complete: %d rows extracted", len(data))

        if not data:
            return []

        # ── Optional Pass 3: Separate validation (disabled by default) ──
        if settings.ai_validation_pass_enabled:
            logger.info("AI Parser — Pass 3: Validating extracted data (separate pass)")
            validation_input = json.dumps(data, ensure_ascii=False, indent=2)
            validation_raw = self._call_claude(
                client,
                system=VALIDATION_PROMPT,
                user_content=f"Validate and fix these extracted rows:\n{validation_input}",
                max_tokens=16000,
            )
            validated = self._parse_json(validation_raw)
            if validated:
                data = validated
                logger.info("AI Parser — Pass 3 complete: %d rows after validation", len(data))
            else:
                logger.warning("AI Parser — Pass 3 returned invalid JSON, keeping pass 2 results")

        rows = self._convert_rows(data)

        # ── Grounding verification ──
        logger.info("AI Parser — Grounding: check against source text")
        rows = self._ground_and_verify(client, text, rows)

        return rows

    # Default models for each pass
    ANALYSIS_MODEL = "claude-haiku-4-5-20251001"  # Pass 1: structural analysis (cheap)
    EXTRACTION_MODEL = "claude-sonnet-4-5-20250929"  # Pass 2: extraction + validation
    GROUNDING_MODEL = "claude-sonnet-4-5-20250929"  # Pass 3: grounding verification

    def _call_claude(
        self,
        client,
        system: str,
        user_content: str,
        max_tokens: int = 4096,
        model: str | None = None,
    ) -> str:
        message = client.messages.create(
            model=model or self.EXTRACTION_MODEL,
            max_tokens=max_tokens,
            system=system,
            messages=[{"role": "user", "content": user_content}],
        )
        return message.content[0].text.strip()

    def _call_claude_with_content(
        self,
        client,
        system: str,
        content: list,
        max_tokens: int = 4096,
        model: str | None = None,
    ) -> str:
        """Call Claude with structured content blocks (supports PDF documents, images)."""
        message = client.messages.create(
            model=model or self.EXTRACTION_MODEL,
            max_tokens=max_tokens,
            system=system,
            messages=[{"role": "user", "content": content}],
        )
        return message.content[0].text.strip()

    @staticmethod
    def _extract_pdf_text(pdf_path: Path) -> str:
        """Extract text from a PDF for grounding checks."""
        try:
            import pdfplumber
            text_parts = []
            with pdfplumber.open(pdf_path) as pdf:
                for page in pdf.pages:
                    page_text = page.extract_text() or ""
                    text_parts.append(page_text)
                    # Also extract table text
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
        """Extract JSON array from response, handling markdown fences and truncation."""
        text = raw.strip()
        if text.startswith("```"):
            lines = text.split("\n")
            end = len(lines) - 1
            while end > 0 and not lines[end].strip().startswith("```"):
                end -= 1
            if end > 0:
                # Found closing fence
                text = "\n".join(lines[1:end])
            else:
                # No closing fence — response was truncated, strip opening fence only
                text = "\n".join(lines[1:])

        try:
            data = json.loads(text)
        except json.JSONDecodeError:
            # Response may be truncated — try to recover complete objects
            # Find the last complete object boundary: "}," or "}\n]"
            last_complete = text.rfind("},")
            if last_complete == -1:
                last_complete = text.rfind("}\n]")
            if last_complete > 0:
                truncated = text[:last_complete + 1] + "\n]"
                try:
                    data = json.loads(truncated)
                    logger.info("Recovered %d rows from truncated JSON", len(data) if isinstance(data, list) else 0)
                except json.JSONDecodeError as e:
                    logger.warning("AI parser returned invalid JSON (even after truncation recovery): %s", e)
                    return []
            else:
                logger.warning("AI parser returned invalid JSON and no recovery possible")
                return []

        if not isinstance(data, list):
            return []
        return [item for item in data if isinstance(item, dict)]

    _KNOWN_SEASON_CODES = {"L", "H", "M"}

    @staticmethod
    def _normalize_season_code(code: str | None) -> str | None:
        """Normalize verbose season codes to short codes (L/H/M/P/Annual)."""
        if not code:
            return code
        import re as _re
        low = code.lower().strip()
        # Year-only codes (e.g. "2026", "2027") → Annual (check BEFORE stripping numbers)
        if _re.match(r'^\d{4}$', low):
            return "Annual"
        # Strip trailing numbers/whitespace: "Low Season 1" → "low season"
        low = _re.sub(r'\s*\d+\s*$', '', low).strip()
        if low in ("l", "low", "low season", "basse saison", "basse", "ls", "bs"):
            return "L"
        if low in ("h", "high", "high season", "haute saison", "haute", "hs",
                    "peak", "peak season", "très haute saison", "ps"):
            return "H"
        if low in ("p",):
            return "P"
        if low in ("m", "mid", "medium", "mid season", "medium season", "moyenne saison", "ms"):
            return "M"
        if low in ("annual", "annuel", "all year", "all seasons", "toute saison",
                    "toutes saisons", "year round", "yearly", "main", "main season",
                    "saison", "season"):
            return "Annual"
        return code

    @staticmethod
    def _auto_label_seasons(rows: list[ParsedPriceRow]) -> list[ParsedPriceRow]:
        """Replace arbitrary season codes (A, B, C, 1, 2...) with L/M/H/P based on price comparison.

        Groups rows by hotel, checks if any season codes are arbitrary (not already L/M/H/P),
        computes average double_price per season code, and relabels cheapest→L, most expensive→H/P.
        """
        from dataclasses import replace
        from collections import defaultdict

        KNOWN = {"L", "H", "M", "P"}

        # Group rows by hotel (accommodation name)
        by_hotel: dict[str, list[int]] = defaultdict(list)
        for i, row in enumerate(rows):
            key = (row.accommodation or "").strip().lower()
            by_hotel[key].append(i)

        result = list(rows)  # copy

        for hotel_key, indices in by_hotel.items():
            # Collect unique season codes for this hotel
            season_codes = set()
            for i in indices:
                sc = (result[i].season_code or "").strip()
                if sc:
                    season_codes.add(sc)

            # Skip if all codes are already known (L/M/H/P) or empty
            if not season_codes or all(sc in KNOWN for sc in season_codes):
                continue

            # Skip if any code is already known — mixed state, don't relabel
            if any(sc in KNOWN for sc in season_codes):
                continue

            # Compute average price per season code (use Std room double_price)
            avg_by_code: dict[str, list[float]] = defaultdict(list)
            for i in indices:
                sc = (result[i].season_code or "").strip()
                rd = (result[i].room_desc or "").strip().lower()
                if sc and rd in ("std", "standard", ""):
                    price = result[i].double_price or result[i].single_price or result[i].twin_price
                    if price and float(price) > 0:
                        avg_by_code[sc].append(float(price))

            if len(avg_by_code) < 2:
                continue

            # Rank by average price ascending
            ranked = sorted(
                avg_by_code.keys(),
                key=lambda sc: sum(avg_by_code[sc]) / len(avg_by_code[sc]),
            )
            n = len(ranked)
            label_map: dict[str, str] = {}
            if n == 2:
                label_map = {ranked[0]: "L", ranked[1]: "H"}
            elif n == 3:
                label_map = {ranked[0]: "L", ranked[1]: "M", ranked[2]: "H"}
            else:  # 4+
                label_map[ranked[0]] = "L"
                label_map[ranked[-1]] = "P"
                label_map[ranked[-2]] = "H"
                for sc in ranked[1:-2]:
                    label_map[sc] = "M"

            # Apply relabeling
            for i in indices:
                sc = (result[i].season_code or "").strip()
                if sc in label_map:
                    result[i] = replace(result[i], season_code=label_map[sc])

        return result

    @staticmethod
    def _merge_rows(rows: list[ParsedPriceRow]) -> list[ParsedPriceRow]:
        """Merge rows that have the same key (hotel, meal, fit_git, season, prices).

        Rows like "Low Season 1" and "Low Season 2" that share the same
        normalized season code and identical prices get combined into one row
        with multiple date_ranges.
        """
        from collections import OrderedDict

        merged: OrderedDict[tuple, ParsedPriceRow] = OrderedDict()
        for row in rows:
            key = (
                (row.accommodation or "").strip(),
                (row.city or "").strip(),
                (row.room_desc or "").strip(),
                row.stars,
                (row.meal_plan or "").strip(),
                (row.fit_git or "").strip(),
                (row.season_code or "").strip(),
                row.double_price,
                row.single_price,
                row.twin_price,
                row.triple_price,
                row.quadruple_price,
            )
            if key in merged:
                # Append date ranges to existing row
                merged[key].date_ranges.extend(row.date_ranges)
            else:
                merged[key] = row
        return list(merged.values())

    def _convert_rows(self, data: list[dict]) -> list[ParsedPriceRow]:
        """Convert raw dicts to ParsedPriceRow objects, normalize seasons, merge duplicates."""
        rows = []
        for item in data:
            date_ranges = []
            for dr in item.get("date_ranges", []) or []:
                d_from = parse_date(dr.get("date_from"))
                d_to = parse_date(dr.get("date_to"))
                # Ensure both dates exist — infer missing one
                if d_from and not d_to:
                    d_to = d_from.replace(month=12, day=31)
                elif d_to and not d_from:
                    d_from = d_to.replace(month=1, day=1)
                if d_from and d_to:
                    date_ranges.append(ParsedDateRange(date_from=d_from, date_to=d_to))

            raw_room = clean_string(item.get("room_desc")) or "Std"
            # Normalize room_desc to title case for consistency
            room_desc = raw_room.title() if raw_room.lower() not in ("std",) else "Std"

            parsed = ParsedPriceRow(
                accommodation=item.get("accommodation", ""),
                city=item.get("city", ""),
                room_desc=room_desc,
                double_price=parse_price(item.get("double_price")),
                single_price=parse_price(item.get("single_price")),
                twin_price=parse_price(item.get("twin_price")),
                triple_price=parse_price(item.get("triple_price")),
                quadruple_price=parse_price(item.get("quadruple_price")),
                stars=parse_int(item.get("stars")),
                hotel_type=clean_string(item.get("hotel_type")),
                meal_plan=clean_string(item.get("meal_plan")),
                fit_git=clean_string(item.get("fit_git")),
                season_code=self._normalize_season_code(clean_string(item.get("season_code"))),
                baby_discount=clean_string(item.get("baby_discount")),
                child_discount=clean_string(item.get("child_discount")),
                date_ranges=date_ranges,
                min_stay=parse_int(item.get("min_stay")),
                note=clean_string(item.get("note")),
                address=clean_string(item.get("address")),
                phone=clean_string(item.get("phone")),
                email=clean_string(item.get("email")),
            )
            rows.append(parsed)

        # Remove rows with all null prices (e.g. "ON REQUEST" placeholders)
        before = len(rows)
        rows = [r for r in rows if any([
            r.double_price, r.single_price, r.twin_price, r.triple_price, r.quadruple_price
        ])]
        if len(rows) < before:
            logger.info("Removed %d rows with no prices", before - len(rows))
        # Merge Single/Double occupancy rows into combined rows
        rows = self._merge_occupancy_rows(rows)
        # Fill single_price for suite/premium rooms where only double_price exists
        rows = self._fill_suite_single_price(rows)
        # Replace arbitrary season codes (A/B/C/1/2) with L/M/H/P by price comparison
        rows = self._auto_label_seasons(rows)
        # Merge rows with identical key (same hotel, meal, season, prices)
        rows = self._merge_rows(rows)
        # Final normalization pass — ensure consistent casing/formatting
        rows = self._final_normalize(rows)
        logger.info("After merge: %d rows", len(rows))
        return rows

    @staticmethod
    def _final_normalize(rows: list[ParsedPriceRow]) -> list[ParsedPriceRow]:
        """Final normalization: consistent room_desc casing, season_code, etc."""
        from dataclasses import replace
        result = []
        for row in rows:
            updates = {}
            # Title-case room_desc for consistency
            rd = (row.room_desc or "").strip()
            if rd and rd.lower() != "std":
                normed = rd.title()
                if normed != rd:
                    updates["room_desc"] = normed
            elif rd.lower() == "std":
                if rd != "Std":
                    updates["room_desc"] = "Std"
            # Title-case accommodation
            acc = (row.accommodation or "").strip()
            if acc and acc != acc.title() and acc == acc.lower():
                updates["accommodation"] = acc.title()
            if updates:
                row = replace(row, **updates)
            result.append(row)
        return result

    @staticmethod
    def _fill_suite_single_price(rows: list[ParsedPriceRow]) -> list[ParsedPriceRow]:
        """For suite/premium rooms with only double_price, set single_price = double_price.

        Suites typically have a flat per-room rate — same price whether 1 or 2 guests.
        This applies to any non-Std room that has double_price but no single_price.
        """
        from dataclasses import replace
        result = []
        for row in rows:
            rd = (row.room_desc or "").strip().lower()
            is_std = rd in ("std", "standard", "")
            if not is_std and row.double_price and not row.single_price:
                row = replace(row, single_price=row.double_price)
            result.append(row)
        return result

    @staticmethod
    def _merge_occupancy_rows(rows: list[ParsedPriceRow]) -> list[ParsedPriceRow]:
        """Merge separate Single/Double/Twin/Triple rows into combined rows.

        Handles two patterns:
        1. Exact names: "Single", "Double", "Triple" → merged into "Std"
        2. Prefixed names: "Superior Double", "Deluxe Twin", "Superior Triple"
           → merged into "Superior", "Deluxe", etc.
        """
        from dataclasses import replace

        SINGLE_WORDS = {"single", "sgl", "sngl"}
        DOUBLE_WORDS = {"double", "dbl"}
        TWIN_WORDS = {"twin", "twn"}
        TRIPLE_WORDS = {"triple", "trp", "trpl", "tpl"}
        QUAD_WORDS = {"quadruple", "quad", "qd"}

        # Also match full exact names
        EXACT_SINGLE = {"single", "chambre single", "sgl", "single room"}
        EXACT_DOUBLE = {"double", "chambre double", "dbl", "double room", "std", "standard"}
        EXACT_TWIN = {"twin", "chambre twin", "twn", "twin room"}
        EXACT_TRIPLE = {"triple", "chambre triple", "trp", "triple room"}
        EXACT_QUAD = {"quadruple", "chambre quadruple", "quad", "quadruple room"}

        def classify_room(desc: str) -> tuple[str, str]:
            """Return (base_category, occupancy_type).

            For "Superior Double" → ("Superior", "double")
            For "Double" → ("Std", "double")
            For "Suite" → ("", "") — not an occupancy-split row
            """
            d = (desc or "").strip()
            dl = d.lower()

            # Check exact match first
            if dl in EXACT_SINGLE:
                return ("Std", "single")
            if dl in EXACT_DOUBLE:
                return ("Std", "double")
            if dl in EXACT_TWIN:
                return ("Std", "twin")
            if dl in EXACT_TRIPLE:
                return ("Std", "triple")
            if dl in EXACT_QUAD:
                return ("Std", "quadruple")

            # Check for "Category OccupancyType" pattern (last word)
            words = dl.split()
            if len(words) >= 2:
                last = words[-1]
                base = " ".join(d.split()[:-1])  # preserve original case
                if last in SINGLE_WORDS:
                    return (base, "single")
                if last in DOUBLE_WORDS:
                    return (base, "double")
                if last in TWIN_WORDS:
                    return (base, "twin")
                if last in TRIPLE_WORDS:
                    return (base, "triple")
                if last in QUAD_WORDS:
                    return (base, "quadruple")

            return ("", "")

        def merge_key(row: ParsedPriceRow, base_cat: str) -> tuple:
            return (
                (row.accommodation or "").strip().lower(),
                (row.city or "").strip().lower(),
                base_cat.lower(),
                (row.meal_plan or "").strip(),
                (row.fit_git or "").strip(),
                (row.season_code or "").strip(),
            )

        # Classify each row — any row with an occupancy suffix is a candidate
        groups: dict[tuple, dict[str, ParsedPriceRow]] = {}
        other: list[ParsedPriceRow] = []

        for row in rows:
            base_cat, occ_type = classify_room(row.room_desc or "")
            if not occ_type:
                other.append(row)
                continue

            # Remap the main price to the correct occupancy column, then strip
            # non-relevant prices. E.g. "SUP TWIN" with double_price=1100 should
            # have twin_price=1100 (not double_price).
            cleaned = row
            main_price = row.double_price or row.single_price or row.twin_price or row.triple_price
            if occ_type == "triple":
                cleaned = replace(row,
                    triple_price=row.triple_price or main_price,
                    double_price=None, single_price=None, twin_price=None)
            elif occ_type == "twin":
                cleaned = replace(row,
                    twin_price=row.twin_price or main_price,
                    double_price=None, single_price=None)
            elif occ_type == "single":
                cleaned = replace(row,
                    single_price=row.single_price or main_price,
                    double_price=None, twin_price=None)
            elif occ_type == "quadruple":
                cleaned = replace(row,
                    quadruple_price=row.quadruple_price or main_price,
                    double_price=None, single_price=None, twin_price=None, triple_price=None)
            elif occ_type == "double":
                cleaned = replace(row,
                    double_price=row.double_price or main_price)

            key = merge_key(row, base_cat)
            if key not in groups:
                groups[key] = {}
            groups[key][occ_type] = cleaned

        # Merge grouped rows
        merged: list[ParsedPriceRow] = []
        for key, occ_rows in groups.items():
            base_cat = key[2]
            # Prioritize: double > twin > single > triple > quad as base row
            base_row = (occ_rows.get("double") or occ_rows.get("twin")
                        or occ_rows.get("single") or occ_rows.get("triple")
                        or next(iter(occ_rows.values())))

            display_cat = base_cat if base_cat.lower() != "std" else "Std"

            if len(occ_rows) == 1:
                merged.append(replace(base_row, room_desc=display_cat))
                continue

            # Multiple occupancy types — merge all prices into one row
            combined = replace(base_row, room_desc=display_cat)

            # Take single_price from single or double row (not triple)
            if not combined.single_price:
                for src in ("single", "double"):
                    if src in occ_rows and occ_rows[src].single_price:
                        combined = replace(combined, single_price=occ_rows[src].single_price)
                        break

            if not combined.double_price:
                for src in ("double", "twin"):
                    if src in occ_rows and occ_rows[src].double_price:
                        combined = replace(combined, double_price=occ_rows[src].double_price)
                        break

            if not combined.twin_price:
                for src in ("twin", "double"):
                    if src in occ_rows and occ_rows[src].twin_price:
                        combined = replace(combined, twin_price=occ_rows[src].twin_price)
                        break

            if not combined.triple_price:
                if "triple" in occ_rows and occ_rows["triple"].triple_price:
                    combined = replace(combined, triple_price=occ_rows["triple"].triple_price)

            if not combined.quadruple_price:
                if "quadruple" in occ_rows and occ_rows["quadruple"].quadruple_price:
                    combined = replace(combined, quadruple_price=occ_rows["quadruple"].quadruple_price)

            merged.append(combined)

        if len(merged) < sum(len(v) for v in groups.values()):
            logger.info("Occupancy merge collapsed %d rows → %d",
                        sum(len(v) for v in groups.values()), len(merged))

        return other + merged

    def _check_grounding(self, source_text: str, rows: list[ParsedPriceRow]) -> tuple[list[ParsedPriceRow], list[ParsedPriceRow]]:
        """Check which rows are grounded in the source text.

        Returns (grounded_rows, suspicious_rows).
        Checks meal plans against known keywords in the source.
        """
        text_lower = source_text.lower()

        # Determine which meal plans are grounded in the source
        grounded_meals: set[str] = set()
        for mp, keywords in MEAL_PLAN_GROUNDING.items():
            if any(kw in text_lower for kw in keywords):
                grounded_meals.add(mp)

        # NOTE: A DP/HB supplement mention does NOT ground HB rows.
        # Only explicitly listed HB rates (e.g. "demi-pension: 850") count.

        logger.info("Grounding check — meal plans found in source: %s", grounded_meals)

        grounded = []
        suspicious = []
        for row in rows:
            mp = (row.meal_plan or "").strip().upper()
            if mp and mp not in grounded_meals:
                suspicious.append(row)
            else:
                grounded.append(row)

        return grounded, suspicious

    def _verify_suspicious_rows(self, client, source_text: str, suspicious: list[ParsedPriceRow]) -> list[ParsedPriceRow]:
        """Send suspicious rows to Claude for verification against the source.

        Returns only the rows that Claude confirms are correct.
        """
        if not suspicious:
            return []

        # Serialize suspicious rows for the prompt
        from app.services.extraction import _row_to_dict
        rows_json = json.dumps([_row_to_dict(r) for r in suspicious], ensure_ascii=False, indent=2)

        user_content = (
            f"ORIGINAL SOURCE TEXT:\n---\n{source_text[:40000]}\n---\n\n"
            f"SUSPICIOUS EXTRACTED ROWS:\n{rows_json}"
        )

        raw = self._call_claude(
            client,
            system=GROUNDING_VERIFICATION_PROMPT,
            user_content=user_content,
            max_tokens=4096,
        )
        verified_data = self._parse_json(raw)
        if verified_data:
            return self._convert_rows(verified_data)
        return []

    def _ground_and_verify(self, client, source_text: str, rows: list[ParsedPriceRow]) -> list[ParsedPriceRow]:
        """Pass 4: Ground-truth check + AI verification of suspicious rows."""
        grounded, suspicious = self._check_grounding(source_text, rows)

        if not suspicious:
            logger.info("Grounding check — all %d rows are grounded", len(grounded))
            return grounded

        logger.warning(
            "Grounding check — %d rows suspicious (ungrounded meal plans: %s)",
            len(suspicious),
            set((r.meal_plan or "").upper() for r in suspicious),
        )

        # Ask Claude to verify the suspicious rows against the source
        verified = self._verify_suspicious_rows(client, source_text, suspicious)
        logger.info("Grounding verification — %d/%d suspicious rows confirmed", len(verified), len(suspicious))

        return grounded + verified
