from datetime import datetime, date
from decimal import Decimal
from typing import Optional, List
from sqlalchemy import String, Integer, Text, DateTime, Date, ForeignKey, Numeric, Index
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Folder(Base):
    __tablename__ = "folders"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(255))
    parent_id: Mapped[Optional[int]] = mapped_column(ForeignKey("folders.id", ondelete="SET NULL"), nullable=True)
    folder_type: Mapped[str] = mapped_column(String(20), default="manual")  # "manual" or "auto"
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    children: Mapped[List["Folder"]] = relationship(back_populates="parent", cascade="all, delete-orphan")
    parent: Mapped[Optional["Folder"]] = relationship(back_populates="children", remote_side="Folder.id")
    documents: Mapped[List["Document"]] = relationship(back_populates="folder")


class Document(Base):
    __tablename__ = "documents"
    __table_args__ = (
        Index("ix_documents_status", "status"),
        Index("ix_documents_upload_date", "upload_date"),
        Index("ix_documents_content_hash", "content_hash"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    filename: Mapped[str] = mapped_column(String(255))
    file_type: Mapped[str] = mapped_column(String(20))
    upload_date: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    status: Mapped[str] = mapped_column(String(20), default="pending")
    row_count: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    parsed_rows_json: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    document_category: Mapped[str] = mapped_column(String(20), default="hotel")
    folder_id: Mapped[Optional[int]] = mapped_column(ForeignKey("folders.id", ondelete="SET NULL"), nullable=True)
    content_hash: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    confidence_score: Mapped[Optional[float]] = mapped_column(Numeric(3, 2), nullable=True)

    folder: Mapped[Optional["Folder"]] = relationship(back_populates="documents")
    prices: Mapped[List["Price"]] = relationship(back_populates="document", cascade="all, delete-orphan")
    menu_prices: Mapped[List["MenuPrice"]] = relationship(back_populates="document", cascade="all, delete-orphan")
    transport_prices: Mapped[List["TransportPrice"]] = relationship(back_populates="document", cascade="all, delete-orphan")


class Hotel(Base):
    __tablename__ = "hotels"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(255))
    city: Mapped[str] = mapped_column(String(100))
    stars: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    type: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    address: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    phone: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    email: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    source_document_id: Mapped[Optional[int]] = mapped_column(ForeignKey("documents.id"), nullable=True)
    cmr_supplier_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)

    prices: Mapped[List["Price"]] = relationship(back_populates="hotel")


class Price(Base):
    __tablename__ = "prices"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    document_id: Mapped[Optional[int]] = mapped_column(ForeignKey("documents.id"), nullable=True)
    hotel_id: Mapped[int] = mapped_column(ForeignKey("hotels.id"))
    room_desc: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    meal_plan: Mapped[Optional[str]] = mapped_column(String(5), nullable=True)
    double_price: Mapped[Optional[Decimal]] = mapped_column(Numeric(10, 2), nullable=True)
    single_price: Mapped[Optional[Decimal]] = mapped_column(Numeric(10, 2), nullable=True)
    twin_price: Mapped[Optional[Decimal]] = mapped_column(Numeric(10, 2), nullable=True)
    triple_price: Mapped[Optional[Decimal]] = mapped_column(Numeric(10, 2), nullable=True)
    quadruple_price: Mapped[Optional[Decimal]] = mapped_column(Numeric(10, 2), nullable=True)
    fit_git: Mapped[Optional[str]] = mapped_column(String(5), nullable=True)
    season_code: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    baby_discount: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    child_discount: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    min_stay: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    note: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    document: Mapped[Optional["Document"]] = relationship(back_populates="prices")
    hotel: Mapped["Hotel"] = relationship(back_populates="prices")
    season_dates: Mapped[List["SeasonDate"]] = relationship(back_populates="price", cascade="all, delete-orphan")


class SeasonDate(Base):
    __tablename__ = "season_dates"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    price_id: Mapped[int] = mapped_column(ForeignKey("prices.id"))
    date_from: Mapped[date] = mapped_column(Date)
    date_to: Mapped[date] = mapped_column(Date)

    price: Mapped["Price"] = relationship(back_populates="season_dates")


class Restaurant(Base):
    __tablename__ = "restaurants"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(255))
    city: Mapped[str] = mapped_column(String(100))
    address: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    phone: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    email: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    source_document_id: Mapped[Optional[int]] = mapped_column(ForeignKey("documents.id"), nullable=True)
    cmr_supplier_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)

    menu_prices: Mapped[List["MenuPrice"]] = relationship(back_populates="restaurant")


class MenuPrice(Base):
    __tablename__ = "menu_prices"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    document_id: Mapped[Optional[int]] = mapped_column(ForeignKey("documents.id"), nullable=True)
    restaurant_id: Mapped[int] = mapped_column(ForeignKey("restaurants.id"))
    menu_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    lunch_price: Mapped[Optional[Decimal]] = mapped_column(Numeric(10, 2), nullable=True)
    dinner_price: Mapped[Optional[Decimal]] = mapped_column(Numeric(10, 2), nullable=True)
    lunch_child_price: Mapped[Optional[Decimal]] = mapped_column(Numeric(10, 2), nullable=True)
    dinner_child_price: Mapped[Optional[Decimal]] = mapped_column(Numeric(10, 2), nullable=True)
    course_1: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    course_2: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    course_3: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    course_4: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    course_5: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    min_pax: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    drink_included: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    season_code: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    note: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    document: Mapped[Optional["Document"]] = relationship(back_populates="menu_prices")
    restaurant: Mapped["Restaurant"] = relationship(back_populates="menu_prices")
    season_dates: Mapped[List["MenuSeasonDate"]] = relationship(back_populates="menu_price", cascade="all, delete-orphan")


class MenuSeasonDate(Base):
    __tablename__ = "menu_season_dates"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    menu_price_id: Mapped[int] = mapped_column(ForeignKey("menu_prices.id"))
    date_from: Mapped[date] = mapped_column(Date)
    date_to: Mapped[date] = mapped_column(Date)

    menu_price: Mapped["MenuPrice"] = relationship(back_populates="season_dates")


class TransportCompany(Base):
    __tablename__ = "transport_companies"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(255))
    code: Mapped[str] = mapped_column(String(50))
    city: Mapped[str] = mapped_column(String(100))
    phone: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    email: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    source_document_id: Mapped[Optional[int]] = mapped_column(ForeignKey("documents.id"), nullable=True)
    cmr_supplier_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)

    transport_prices: Mapped[List["TransportPrice"]] = relationship(back_populates="company")


class TransportPrice(Base):
    __tablename__ = "transport_prices"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    document_id: Mapped[Optional[int]] = mapped_column(ForeignKey("documents.id"), nullable=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("transport_companies.id"))
    code: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    price: Mapped[Optional[Decimal]] = mapped_column(Numeric(10, 2), nullable=True)
    product: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    bus_size: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    service_type: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    days: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    route_description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    note: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    city: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)

    document: Mapped[Optional["Document"]] = relationship(back_populates="transport_prices")
    company: Mapped["TransportCompany"] = relationship(back_populates="transport_prices")


class ProcessedEmail(Base):
    __tablename__ = "processed_emails"
    __table_args__ = (Index("ix_processed_emails_message_id", "message_id", unique=True),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    message_id: Mapped[str] = mapped_column(String(512), unique=True, nullable=False)
    subject: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    sender: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    received_date: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    document_id: Mapped[Optional[int]] = mapped_column(ForeignKey("documents.id"), nullable=True)
    processed_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    status: Mapped[str] = mapped_column(String(20), default="processed")
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    document: Mapped[Optional["Document"]] = relationship()


class ExtractionFeedback(Base):
    """Stores diffs between original AI extraction and user-confirmed rows."""
    __tablename__ = "extraction_feedback"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    document_id: Mapped[int] = mapped_column(ForeignKey("documents.id"), nullable=False)
    original_rows_json: Mapped[str] = mapped_column(Text, nullable=False)
    corrected_rows_json: Mapped[str] = mapped_column(Text, nullable=False)
    diff_summary: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    document: Mapped["Document"] = relationship()
