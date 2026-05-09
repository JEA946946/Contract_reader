from __future__ import annotations

import re
from pathlib import Path

from app.parsers.base import BaseParser, ParsedPriceRow, ParsedDateRange
from app.utils import parse_price, parse_date, parse_int, clean_string


class TextParser(BaseParser):
    def can_handle(self, file_path: Path) -> bool:
        return file_path.suffix.lower() in (".txt", ".text")

    def parse(self, file_path: Path) -> list[ParsedPriceRow]:
        text = file_path.read_text(encoding="utf-8", errors="replace")
        lines = text.strip().split("\n")

        if not lines:
            return []

        # Try tab-separated format first (most common for this data)
        if "\t" in lines[0]:
            return self._parse_tsv(lines)

        # Try to detect if it's a structured table with consistent delimiters
        for delimiter in ["|", ";", ","]:
            if delimiter in lines[0]:
                return self._parse_delimited(lines, delimiter)

        return []

    def _parse_tsv(self, lines: list[str]) -> list[ParsedPriceRow]:
        return self._parse_delimited(lines, "\t")

    def _parse_delimited(self, lines: list[str], delimiter: str) -> list[ParsedPriceRow]:
        rows = []
        header = [h.strip().lower() for h in lines[0].split(delimiter)]

        col_indices = {}
        for i, h in enumerate(header):
            if any(k in h for k in ["accommodation", "hotel", "name"]):
                col_indices["accommodation"] = i
            elif any(k in h for k in ["cities", "city"]):
                col_indices["city"] = i
            elif h == "double" or h == "dbl":
                col_indices["double"] = i
            elif h == "single" or h == "sgl":
                col_indices["single"] = i
            elif h == "twin" or h == "twn":
                col_indices["twin"] = i
            elif any(k in h for k in ["etoiles", "stars"]):
                col_indices["stars"] = i
            elif h == "type":
                col_indices["type"] = i
            elif any(k in h for k in ["fit/git", "fit_git"]):
                col_indices["fit_git"] = i
            elif h == "season":
                col_indices["season"] = i
            elif any(k in h for k in ["min. stay", "min stay"]):
                col_indices["min_stay"] = i
            elif h in ("note", "notes"):
                col_indices["note"] = i

        if "accommodation" not in col_indices:
            return []

        for line in lines[1:]:
            fields = line.split(delimiter)
            if len(fields) <= col_indices["accommodation"]:
                continue

            acc = clean_string(fields[col_indices["accommodation"]])
            if not acc:
                continue

            parsed = ParsedPriceRow(
                accommodation=acc,
                city=clean_string(fields[col_indices["city"]]) if "city" in col_indices and len(fields) > col_indices["city"] else "",
                double_price=parse_price(fields[col_indices["double"]]) if "double" in col_indices and len(fields) > col_indices["double"] else None,
                single_price=parse_price(fields[col_indices["single"]]) if "single" in col_indices and len(fields) > col_indices["single"] else None,
                twin_price=parse_price(fields[col_indices["twin"]]) if "twin" in col_indices and len(fields) > col_indices["twin"] else None,
                stars=parse_int(fields[col_indices["stars"]]) if "stars" in col_indices and len(fields) > col_indices["stars"] else None,
                hotel_type=clean_string(fields[col_indices["type"]]) if "type" in col_indices and len(fields) > col_indices["type"] else None,
                fit_git=clean_string(fields[col_indices["fit_git"]]) if "fit_git" in col_indices and len(fields) > col_indices["fit_git"] else None,
                season_code=clean_string(fields[col_indices["season"]]) if "season" in col_indices and len(fields) > col_indices["season"] else None,
                min_stay=parse_int(fields[col_indices["min_stay"]]) if "min_stay" in col_indices and len(fields) > col_indices["min_stay"] else None,
                note=clean_string(fields[col_indices["note"]]) if "note" in col_indices and len(fields) > col_indices["note"] else None,
            )
            rows.append(parsed)

        return rows
