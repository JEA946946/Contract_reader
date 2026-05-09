"""Normalize and save parsed transport rows to the database."""
from __future__ import annotations

from sqlalchemy.orm import Session
from sqlalchemy import select

from app.parsers.base import ParsedTransportRow
from app.models import Document, TransportCompany, TransportPrice


VALID_SERVICE_TYPES = {"transfer", "roundtrip", "soiree", "excursion", "mise_a_dispo"}


def normalize_service_type(type_str: str | None) -> str:
    """Normalize service type to one of the standard values."""
    if not type_str:
        return "transfer"
    low = type_str.lower().strip()
    if low in VALID_SERVICE_TYPES:
        return low
    if low in ("t", "transfert"):
        return "transfer"
    if low in ("r", "round trip", "round-trip", "aller-retour"):
        return "roundtrip"
    if low in ("s", "soirée"):
        return "soiree"
    if low in ("e", "excurtion"):
        return "excursion"
    if low in ("m", "mise a dispo", "mise à dispo", "mise à disposition", "mise a disposition"):
        return "mise_a_dispo"
    return "transfer"


def get_or_create_transport_company(
    db: Session,
    name: str,
    code: str,
    city: str,
    phone: str | None = None,
    email: str | None = None,
    cmr_supplier_id: str | None = None,
) -> TransportCompany:
    """Find existing transport company by code+city or create a new one."""
    stmt = select(TransportCompany).where(
        TransportCompany.code == code,
        TransportCompany.city == city,
    )
    company = db.execute(stmt).scalar_one_or_none()
    if company:
        if name and not company.name:
            company.name = name
        if phone and not company.phone:
            company.phone = phone
        if email and not company.email:
            company.email = email
        if cmr_supplier_id and not company.cmr_supplier_id:
            company.cmr_supplier_id = cmr_supplier_id
        return company

    company = TransportCompany(
        name=name, code=code, city=city, phone=phone, email=email,
        cmr_supplier_id=cmr_supplier_id,
    )
    db.add(company)
    db.flush()
    return company


def save_parsed_transport_rows(rows: list[ParsedTransportRow], document: Document, db: Session) -> int:
    """Save parsed transport rows to TransportCompany + TransportPrice tables."""
    count = 0
    for row in rows:
        company_code = (row.company_code or "").strip()
        company_name = (row.company_name or "").strip()
        if not company_code and not company_name:
            continue

        if not company_code:
            company_code = company_name[:10].upper().replace(" ", "")

        company = get_or_create_transport_company(
            db, company_name, company_code, row.city or "",
        )
        if not company.source_document_id:
            company.source_document_id = document.id

        transport_price = TransportPrice(
            document_id=document.id,
            company_id=company.id,
            code=row.code or None,
            price=row.price,
            product=row.product or None,
            bus_size=row.bus_size,
            service_type=normalize_service_type(row.service_type),
            days=row.days,
            route_description=row.route_description or None,
            note=row.note or None,
            city=row.city or None,
        )
        db.add(transport_price)
        db.flush()

        count += 1

    db.commit()
    return count
