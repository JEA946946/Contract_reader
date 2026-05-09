from __future__ import annotations

from datetime import date
from decimal import Decimal, InvalidOperation
import re


def parse_price(value) -> Decimal | None:
    if value is None:
        return None
    s = str(value).strip()
    if s in ("", "_", "-", "--", "N/A", "n/a"):
        return None
    s = re.sub(r"[^\d.,]", "", s)
    s = s.replace(",", ".")
    try:
        return Decimal(s)
    except (InvalidOperation, ValueError):
        return None


def parse_date(value) -> date | None:
    if value is None:
        return None
    if isinstance(value, date):
        return value
    s = str(value).strip()
    if not s or s == "--":
        return None
    for fmt in ("%d-%m-%Y", "%d/%m/%Y", "%Y-%m-%d", "%d.%m.%Y", "%d-%m-%y", "%d/%m/%y"):
        try:
            from datetime import datetime
            return datetime.strptime(s, fmt).date()
        except ValueError:
            continue
    return None


def parse_int(value) -> int | None:
    if value is None:
        return None
    s = str(value).strip()
    if not s or s in ("--", "_", "-"):
        return None
    try:
        return int(float(s))
    except (ValueError, TypeError):
        return None


def clean_string(value) -> str | None:
    if value is None:
        return None
    s = str(value).strip()
    if not s or s == "--":
        return None
    return s


def detect_file_type(filename: str) -> str:
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    type_map = {
        "pdf": "pdf",
        "docx": "docx",
        "doc": "doc",
        "xlsx": "xlsx",
        "xls": "xls",
        "csv": "csv",
        "txt": "txt",
        "eml": "eml",
        "msg": "msg",
    }
    return type_map.get(ext, "unknown")
