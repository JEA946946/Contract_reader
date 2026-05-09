from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal
from pathlib import Path


@dataclass
class ParsedDateRange:
    date_from: date | None = None
    date_to: date | None = None


@dataclass
class ParsedPriceRow:
    accommodation: str = ""
    city: str = ""
    room_desc: str | None = None
    double_price: Decimal | None = None
    single_price: Decimal | None = None
    twin_price: Decimal | None = None
    triple_price: Decimal | None = None
    quadruple_price: Decimal | None = None
    stars: int | None = None
    hotel_type: str | None = None
    meal_plan: str | None = None
    fit_git: str | None = None
    season_code: str | None = None
    baby_discount: str | None = None
    child_discount: str | None = None
    date_ranges: list[ParsedDateRange] = field(default_factory=list)
    min_stay: int | None = None
    note: str | None = None
    address: str | None = None
    phone: str | None = None
    email: str | None = None


@dataclass
class ParsedMenuRow:
    restaurant_name: str = ""
    city: str = ""
    menu_name: str | None = None
    description: str | None = None
    lunch_price: Decimal | None = None
    dinner_price: Decimal | None = None
    lunch_child_price: Decimal | None = None
    dinner_child_price: Decimal | None = None
    course_1: str | None = None
    course_2: str | None = None
    course_3: str | None = None
    course_4: str | None = None
    course_5: str | None = None
    min_pax: int | None = None
    drink_included: str | None = None
    season_code: str | None = None
    date_ranges: list[ParsedDateRange] = field(default_factory=list)
    note: str | None = None
    address: str | None = None
    phone: str | None = None
    email: str | None = None


@dataclass
class ParsedTransportRow:
    code: str = ""
    price: Decimal | None = None
    company_name: str = ""
    company_code: str = ""
    product: str = ""
    bus_size: int | None = None
    service_type: str = ""       # transfer | roundtrip | soiree | excursion | mise_a_dispo
    days: int | None = None
    route_description: str = ""
    note: str = ""
    city: str = ""


class BaseParser(ABC):
    @abstractmethod
    def parse(self, file_path: Path) -> list[ParsedPriceRow]:
        pass

    @abstractmethod
    def can_handle(self, file_path: Path) -> bool:
        pass
