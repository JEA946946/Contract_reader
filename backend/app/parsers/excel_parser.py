from __future__ import annotations

import pandas as pd
from pathlib import Path

from app.parsers.base import BaseParser, ParsedPriceRow, ParsedDateRange
from app.utils import parse_price, parse_date, parse_int, clean_string

# Expected column name patterns (case-insensitive matching)
COLUMN_MAP = {
    "accommodation": ["accommodation", "hotel", "name", "property", "room"],
    "city": ["cities", "city", "location", "destination"],
    "double": ["double", "dbl", "double_price"],
    "single": ["single", "sgl", "single_price"],
    "twin": ["twin", "twn", "twin_price"],
    "triple": ["triple", "trpl", "triple_price"],
    "quadruple": ["quadruple", "quad", "quadruple_price"],
    "stars": ["etoiles", "stars", "star", "rating"],
    "type": ["type", "category"],
    "fit_git": ["fit/git", "fit_git", "fitgit", "fit"],
    "season": ["season", "saison"],
    "baby": ["chd 0", "baby", "infant", "0-2", "baby cut"],
    "child": ["2-11", "child", "chd", "enfant"],
    "min_stay": ["min. stay", "min stay", "minimum stay", "min_stay"],
    "note": ["note", "notes", "remark", "remarks", "mistakes"],
}


def find_column(df_columns: list[str], key: str) -> str | None:
    patterns = COLUMN_MAP.get(key, [])
    for col in df_columns:
        col_lower = str(col).lower().strip()
        for pattern in patterns:
            if pattern in col_lower:
                return col
    return None


def find_date_columns(df_columns: list[str]) -> list[tuple[str, str]]:
    date_cols = []
    from_cols = []
    to_cols = []
    for col in df_columns:
        col_lower = str(col).lower().strip()
        if "dates from" in col_lower or "date from" in col_lower or "from" in col_lower:
            from_cols.append(col)
        elif "dates to" in col_lower or "date to" in col_lower or "to" in col_lower:
            to_cols.append(col)

    for i in range(min(len(from_cols), len(to_cols))):
        date_cols.append((from_cols[i], to_cols[i]))

    return date_cols


class ExcelParser(BaseParser):
    def can_handle(self, file_path: Path) -> bool:
        return file_path.suffix.lower() in (".xlsx", ".xls")

    def parse(self, file_path: Path) -> list[ParsedPriceRow]:
        rows = []
        xls = pd.ExcelFile(file_path)

        for sheet_name in xls.sheet_names:
            df = pd.read_excel(xls, sheet_name=sheet_name)
            if df.empty:
                continue

            rows.extend(self.parse_dataframe(df))

        return rows

    def parse_dataframe(self, df: pd.DataFrame) -> list[ParsedPriceRow]:
        """Parse a pandas DataFrame directly without writing to disk.

        This is the core parsing logic, used both by parse() for Excel files
        and by PdfParser when it extracts tables from PDFs.
        """
        if df.empty:
            return []

        rows = []
        cols = list(df.columns)
        col_acc = find_column(cols, "accommodation")
        col_city = find_column(cols, "city")
        col_dbl = find_column(cols, "double")
        col_sgl = find_column(cols, "single")
        col_twn = find_column(cols, "twin")
        col_trpl = find_column(cols, "triple")
        col_quad = find_column(cols, "quadruple")
        col_stars = find_column(cols, "stars")
        col_type = find_column(cols, "type")
        col_fit = find_column(cols, "fit_git")
        col_season = find_column(cols, "season")
        col_baby = find_column(cols, "baby")
        col_child = find_column(cols, "child")
        col_min = find_column(cols, "min_stay")
        col_note = find_column(cols, "note")
        date_col_pairs = find_date_columns(cols)

        if not col_acc:
            return []

        for _, row in df.iterrows():
            acc = clean_string(row.get(col_acc))
            if not acc:
                continue

            date_ranges = []
            for from_col, to_col in date_col_pairs:
                d_from = parse_date(row.get(from_col))
                d_to = parse_date(row.get(to_col))
                if d_from and d_to:
                    date_ranges.append(ParsedDateRange(date_from=d_from, date_to=d_to))

            parsed = ParsedPriceRow(
                accommodation=acc,
                city=clean_string(row.get(col_city)) or "",
                double_price=parse_price(row.get(col_dbl)) if col_dbl else None,
                single_price=parse_price(row.get(col_sgl)) if col_sgl else None,
                twin_price=parse_price(row.get(col_twn)) if col_twn else None,
                triple_price=parse_price(row.get(col_trpl)) if col_trpl else None,
                quadruple_price=parse_price(row.get(col_quad)) if col_quad else None,
                stars=parse_int(row.get(col_stars)) if col_stars else None,
                hotel_type=clean_string(row.get(col_type)) if col_type else None,
                fit_git=clean_string(row.get(col_fit)) if col_fit else None,
                season_code=clean_string(row.get(col_season)) if col_season else None,
                baby_discount=clean_string(row.get(col_baby)) if col_baby else None,
                child_discount=clean_string(row.get(col_child)) if col_child else None,
                date_ranges=date_ranges,
                min_stay=parse_int(row.get(col_min)) if col_min else None,
                note=clean_string(row.get(col_note)) if col_note else None,
            )
            rows.append(parsed)

        return rows


class CsvParser(BaseParser):
    def can_handle(self, file_path: Path) -> bool:
        return file_path.suffix.lower() == ".csv"

    def parse(self, file_path: Path) -> list[ParsedPriceRow]:
        df = pd.read_csv(file_path)
        temp_xlsx = file_path.with_suffix(".tmp.xlsx")
        df.to_excel(temp_xlsx, index=False)
        try:
            parser = ExcelParser()
            return parser.parse(temp_xlsx)
        finally:
            temp_xlsx.unlink(missing_ok=True)
