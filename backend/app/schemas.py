from datetime import datetime, date
from decimal import Decimal
from typing import Optional, List
from pydantic import BaseModel


class SeasonDateOut(BaseModel):
    id: int
    date_from: date
    date_to: date

    model_config = {"from_attributes": True}


class HotelOut(BaseModel):
    id: int
    name: str
    city: str
    stars: Optional[int]
    type: Optional[str]
    address: Optional[str]
    phone: Optional[str]
    email: Optional[str]
    source_document_id: Optional[int] = None
    cmr_supplier_id: Optional[str] = None

    model_config = {"from_attributes": True}


class PriceOut(BaseModel):
    id: int
    document_id: Optional[int]
    hotel: HotelOut
    room_desc: Optional[str]
    meal_plan: Optional[str]
    double_price: Optional[Decimal]
    single_price: Optional[Decimal]
    twin_price: Optional[Decimal]
    triple_price: Optional[Decimal]
    quadruple_price: Optional[Decimal]
    fit_git: Optional[str]
    season_code: Optional[str]
    baby_discount: Optional[str]
    child_discount: Optional[str]
    min_stay: Optional[int]
    note: Optional[str]
    season_dates: List[SeasonDateOut]

    model_config = {"from_attributes": True}


class PriceListResponse(BaseModel):
    items: List[PriceOut]
    total: int
    page: int
    page_size: int


class DocumentOut(BaseModel):
    id: int
    filename: str
    file_type: str
    upload_date: datetime
    status: str
    row_count: Optional[int]
    notes: Optional[str]
    hotel_name: Optional[str] = None
    document_category: str = "hotel"
    folder_id: Optional[int] = None
    confidence_score: Optional[float] = None

    model_config = {"from_attributes": True}


class DocumentUploadResponse(BaseModel):
    id: int
    filename: str
    status: str
    row_count: Optional[int]
    message: str


class ParsedDateRangeSchema(BaseModel):
    date_from: Optional[str] = None
    date_to: Optional[str] = None


class ParsedRowSchema(BaseModel):
    accommodation: Optional[str] = ""
    city: Optional[str] = ""
    room_desc: Optional[str] = None
    double_price: Optional[float] = None
    single_price: Optional[float] = None
    twin_price: Optional[float] = None
    triple_price: Optional[float] = None
    quadruple_price: Optional[float] = None
    stars: Optional[int] = None
    hotel_type: Optional[str] = None
    meal_plan: Optional[str] = None
    fit_git: Optional[str] = None
    season_code: Optional[str] = None
    baby_discount: Optional[str] = None
    child_discount: Optional[str] = None
    date_ranges: List[ParsedDateRangeSchema] = []
    min_stay: Optional[int] = None
    note: Optional[str] = None
    address: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None


class ParsedMenuRowSchema(BaseModel):
    restaurant_name: Optional[str] = ""
    city: Optional[str] = ""
    menu_name: Optional[str] = None
    description: Optional[str] = None
    lunch_price: Optional[float] = None
    dinner_price: Optional[float] = None
    lunch_child_price: Optional[float] = None
    dinner_child_price: Optional[float] = None
    course_1: Optional[str] = None
    course_2: Optional[str] = None
    course_3: Optional[str] = None
    course_4: Optional[str] = None
    course_5: Optional[str] = None
    min_pax: Optional[int] = None
    drink_included: Optional[str] = None
    season_code: Optional[str] = None
    date_ranges: List[ParsedDateRangeSchema] = []
    note: Optional[str] = None
    address: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None


class ParsedTransportRowSchema(BaseModel):
    code: Optional[str] = ""
    price: Optional[float] = None
    company_name: Optional[str] = ""
    company_code: Optional[str] = ""
    product: Optional[str] = ""
    bus_size: Optional[int] = None
    service_type: Optional[str] = ""
    days: Optional[int] = None
    route_description: Optional[str] = ""
    note: Optional[str] = ""
    city: Optional[str] = ""


class UploadForReviewResponse(BaseModel):
    id: int
    filename: str
    status: str
    row_count: Optional[int]
    message: str
    rows: List[ParsedRowSchema]
    menu_rows: List[ParsedMenuRowSchema] = []
    transport_rows: List[ParsedTransportRowSchema] = []
    document_category: str = "hotel"


class ConfirmRowsRequest(BaseModel):
    rows: List[ParsedRowSchema]


class ConfirmMenuRowsRequest(BaseModel):
    rows: List[ParsedMenuRowSchema]


class ConfirmTransportRowsRequest(BaseModel):
    rows: List[ParsedTransportRowSchema]


class ConfirmRowsResponse(BaseModel):
    id: int
    filename: str
    status: str
    row_count: int
    message: str


class StatsOut(BaseModel):
    total_documents: int
    total_hotels: int
    total_prices: int
    total_restaurants: int = 0
    total_menu_prices: int = 0
    total_transport_companies: int = 0
    total_transport_prices: int = 0
    cities: List[str]
    recent_uploads: List[DocumentOut]


class ManualPriceRowSchema(BaseModel):
    room_desc: Optional[str] = None
    meal_plan: Optional[str] = None
    double_price: Optional[float] = None
    single_price: Optional[float] = None
    twin_price: Optional[float] = None
    triple_price: Optional[float] = None
    quadruple_price: Optional[float] = None
    fit_git: Optional[str] = None
    season_code: Optional[str] = None
    date_ranges: List[ParsedDateRangeSchema] = []
    note: Optional[str] = None


class CreateHotelWithPricesRequest(BaseModel):
    name: str
    city: str
    stars: Optional[int] = None
    type: Optional[str] = None
    address: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    cmr_supplier_id: Optional[str] = None
    prices: List[ManualPriceRowSchema] = []


class CreateHotelWithPricesResponse(BaseModel):
    hotel_id: int
    hotel_name: str
    price_count: int
    message: str


class PriceWithoutHotelOut(BaseModel):
    id: int
    document_id: Optional[int]
    room_desc: Optional[str]
    meal_plan: Optional[str]
    double_price: Optional[Decimal]
    single_price: Optional[Decimal]
    twin_price: Optional[Decimal]
    triple_price: Optional[Decimal]
    quadruple_price: Optional[Decimal]
    fit_git: Optional[str]
    season_code: Optional[str]
    baby_discount: Optional[str]
    child_discount: Optional[str]
    min_stay: Optional[int]
    note: Optional[str]
    season_dates: List[SeasonDateOut]

    model_config = {"from_attributes": True}


class HotelDetailOut(BaseModel):
    id: int
    name: str
    city: str
    stars: Optional[int]
    type: Optional[str]
    address: Optional[str]
    phone: Optional[str]
    email: Optional[str]
    cmr_supplier_id: Optional[str] = None
    prices: List[PriceWithoutHotelOut]

    model_config = {"from_attributes": True}


# --- Restaurant schemas ---

class RestaurantOut(BaseModel):
    id: int
    name: str
    city: str
    address: Optional[str]
    phone: Optional[str]
    email: Optional[str]
    source_document_id: Optional[int] = None
    cmr_supplier_id: Optional[str] = None

    model_config = {"from_attributes": True}


class MenuSeasonDateOut(BaseModel):
    id: int
    date_from: date
    date_to: date

    model_config = {"from_attributes": True}


class MenuPriceOut(BaseModel):
    id: int
    document_id: Optional[int]
    restaurant: RestaurantOut
    menu_name: Optional[str]
    description: Optional[str]
    lunch_price: Optional[Decimal]
    dinner_price: Optional[Decimal]
    lunch_child_price: Optional[Decimal]
    dinner_child_price: Optional[Decimal]
    course_1: Optional[str]
    course_2: Optional[str]
    course_3: Optional[str]
    course_4: Optional[str]
    course_5: Optional[str]
    min_pax: Optional[int]
    drink_included: Optional[str]
    season_code: Optional[str]
    note: Optional[str]
    season_dates: List[MenuSeasonDateOut]

    model_config = {"from_attributes": True}


class MenuPriceListResponse(BaseModel):
    items: List[MenuPriceOut]
    total: int
    page: int
    page_size: int


# --- Transportation schemas ---

class TransportCompanyOut(BaseModel):
    id: int
    name: str
    code: str
    city: str
    phone: Optional[str]
    email: Optional[str]
    source_document_id: Optional[int] = None
    cmr_supplier_id: Optional[str] = None

    model_config = {"from_attributes": True}


class TransportPriceOut(BaseModel):
    id: int
    document_id: Optional[int]
    company: TransportCompanyOut
    code: Optional[str]
    price: Optional[Decimal]
    product: Optional[str]
    bus_size: Optional[int]
    service_type: Optional[str]
    days: Optional[int]
    route_description: Optional[str]
    note: Optional[str]
    city: Optional[str]

    model_config = {"from_attributes": True}


class TransportPriceListResponse(BaseModel):
    items: List[TransportPriceOut]
    total: int
    page: int
    page_size: int


# --- Folder schemas ---

class FolderCreate(BaseModel):
    name: str
    parent_id: Optional[int] = None


class FolderRename(BaseModel):
    name: str


class FolderMove(BaseModel):
    parent_id: Optional[int] = None


class FolderOut(BaseModel):
    id: int
    name: str
    parent_id: Optional[int]
    folder_type: str
    created_at: datetime
    document_count: int = 0
    children: List["FolderOut"] = []

    model_config = {"from_attributes": True}


class DocumentMoveToFolder(BaseModel):
    folder_id: Optional[int] = None


class BatchMoveDocuments(BaseModel):
    document_ids: List[int]
    folder_id: Optional[int] = None
