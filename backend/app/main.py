from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select, func, text

from app.config import settings
from app.database import engine, Base, get_db, SessionLocal
from app.models import Document, Hotel, Price, Restaurant, MenuPrice, TransportCompany, TransportPrice, Folder
from app.routers import documents, prices, exports, hotels, email_polling, restaurants, transportation, folders, suppliers, settings as settings_router, email_rules, managed_data, places
from app.schemas import StatsOut, DocumentOut
from app.services.scheduler import start_scheduler, stop_scheduler

app = FastAPI(title="Hotel Price Reader", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins.split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(documents.router)
app.include_router(prices.router)
app.include_router(exports.router)
app.include_router(hotels.router)
app.include_router(email_polling.router)
app.include_router(restaurants.router)
app.include_router(transportation.router)
app.include_router(folders.router)
app.include_router(suppliers.router)
app.include_router(settings_router.router)
app.include_router(email_rules.router)
app.include_router(managed_data.router)
app.include_router(places.router)


@app.on_event("startup")
def on_startup():
    Base.metadata.create_all(bind=engine)
    # Auto-migrate: add columns if they don't exist
    for stmt in [
        "ALTER TABLE documents ADD COLUMN parsed_rows_json TEXT",
        "ALTER TABLE documents ADD COLUMN document_category VARCHAR(20) DEFAULT 'hotel'",
        # Restaurant model restructure
        "ALTER TABLE menu_prices ADD COLUMN lunch_price DECIMAL(10,2)",
        "ALTER TABLE menu_prices ADD COLUMN dinner_price DECIMAL(10,2)",
        "ALTER TABLE menu_prices ADD COLUMN lunch_child_price DECIMAL(10,2)",
        "ALTER TABLE menu_prices ADD COLUMN dinner_child_price DECIMAL(10,2)",
        "ALTER TABLE menu_prices ADD COLUMN course_1 VARCHAR(500)",
        "ALTER TABLE menu_prices ADD COLUMN course_2 VARCHAR(500)",
        "ALTER TABLE menu_prices ADD COLUMN course_3 VARCHAR(500)",
        "ALTER TABLE menu_prices ADD COLUMN course_4 VARCHAR(500)",
        "ALTER TABLE menu_prices ADD COLUMN course_5 VARCHAR(500)",
        # Folder system
        "ALTER TABLE documents ADD COLUMN folder_id INT NULL",
        # CMR supplier linking
        "ALTER TABLE hotels ADD COLUMN cmr_supplier_id VARCHAR(36) NULL",
        "ALTER TABLE hotels ADD COLUMN country VARCHAR(100) NULL",
        "ALTER TABLE hotels ADD COLUMN postal_code VARCHAR(20) NULL",
        "ALTER TABLE hotels ADD COLUMN state VARCHAR(100) NULL",
        "ALTER TABLE restaurants ADD COLUMN cmr_supplier_id VARCHAR(36) NULL",
        "ALTER TABLE transport_companies ADD COLUMN cmr_supplier_id VARCHAR(36) NULL",
        # Extraction pipeline optimization
        "ALTER TABLE documents ADD COLUMN content_hash VARCHAR(64) NULL",
        "ALTER TABLE documents ADD COLUMN confidence_score DECIMAL(3,2) NULL",
        # Email inbox: body and attachment storage
        "ALTER TABLE processed_emails ADD COLUMN body_text TEXT NULL",
        "ALTER TABLE processed_emails ADD COLUMN body_html TEXT NULL",
        "ALTER TABLE processed_emails ADD COLUMN attachment_names TEXT NULL",
        "ALTER TABLE processed_emails ADD COLUMN label VARCHAR(30) NULL",
        # Expand body columns to MEDIUMTEXT for large HTML emails (up to 16MB)
        "ALTER TABLE processed_emails MODIFY COLUMN body_text MEDIUMTEXT NULL",
        "ALTER TABLE processed_emails MODIFY COLUMN body_html MEDIUMTEXT NULL",
    ]:
        try:
            with engine.connect() as conn:
                conn.execute(text(stmt))
                conn.commit()
        except Exception:
            pass  # Column already exists

    # Add index for content_hash
    for idx_stmt in [
        "CREATE INDEX ix_documents_content_hash ON documents(content_hash)",
    ]:
        try:
            with engine.connect() as conn:
                conn.execute(text(idx_stmt))
                conn.commit()
        except Exception:
            pass  # Index already exists

    # Create extraction_feedback table
    try:
        with engine.connect() as conn:
            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS extraction_feedback (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    document_id INT NOT NULL,
                    original_rows_json TEXT NOT NULL,
                    corrected_rows_json TEXT NOT NULL,
                    diff_summary TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (document_id) REFERENCES documents(id)
                )
            """))
            conn.commit()
    except Exception:
        pass

    # Create email_folder_rules table
    try:
        with engine.connect() as conn:
            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS email_folder_rules (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    keyword VARCHAR(255) NOT NULL,
                    folder_id INT NOT NULL,
                    is_case_sensitive BOOLEAN DEFAULT FALSE,
                    priority INT DEFAULT 0,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (folder_id) REFERENCES folders(id) ON DELETE CASCADE
                )
            """))
            conn.commit()
    except Exception:
        pass

    # Create managed_cities table
    try:
        with engine.connect() as conn:
            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS managed_cities (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    name VARCHAR(100) NOT NULL UNIQUE,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            """))
            conn.commit()
    except Exception:
        pass

    # Create managed_categories table
    try:
        with engine.connect() as conn:
            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS managed_categories (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    slug VARCHAR(50) NOT NULL UNIQUE,
                    label VARCHAR(100) NOT NULL,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            """))
            conn.commit()
    except Exception:
        pass

    # Migrate existing price_per_person data to dinner_price
    try:
        with engine.connect() as conn:
            conn.execute(text(
                "UPDATE menu_prices SET dinner_price = price_per_person "
                "WHERE price_per_person IS NOT NULL AND dinner_price IS NULL"
            ))
            conn.commit()
    except Exception:
        pass

    # Recover documents stuck in "processing" (e.g. after server restart killed threads)
    try:
        with engine.connect() as conn:
            conn.execute(text(
                "UPDATE documents SET status = 'failed', "
                "notes = CONCAT(COALESCE(notes, ''), ' | Recovered from stuck processing after restart') "
                "WHERE status = 'processing'"
            ))
            conn.commit()
    except Exception:
        pass

    # Backfill email body/attachments for existing ProcessedEmail records
    _backfill_email_bodies()

    # Backfill auto-labels for existing emails that have no label
    _backfill_email_labels()

    # Seed managed cities/categories from existing data
    _backfill_managed_data()

    start_scheduler()


def _backfill_email_bodies():
    """Re-read .eml files on disk to populate body_text/body_html/attachment_names
    for ProcessedEmail records that were created before those columns existed."""
    import email as email_lib
    from email import policy as email_policy
    import json
    from app.models import ProcessedEmail

    db = SessionLocal()
    try:
        records = (
            db.query(ProcessedEmail)
            .join(Document, ProcessedEmail.document_id == Document.id)
            .filter(ProcessedEmail.body_text.is_(None))
            .filter(Document.file_type == "eml")
            .all()
        )
        if not records:
            return

        for rec in records:
            doc = rec.document
            if not doc:
                continue
            eml_path = settings.upload_path / doc.filename
            if not eml_path.exists():
                continue
            try:
                raw = eml_path.read_bytes()
                msg = email_lib.message_from_bytes(raw, policy=email_policy.default)
                body_text = ""
                body_html = ""
                attachment_names = []
                for part in msg.walk():
                    content_type = part.get_content_type()
                    disposition = str(part.get("Content-Disposition", ""))
                    if "attachment" in disposition:
                        fname = part.get_filename()
                        if fname:
                            attachment_names.append(fname)
                    elif content_type == "text/plain" and not body_text:
                        payload = part.get_content()
                        if isinstance(payload, str):
                            body_text = payload
                    elif content_type == "text/html" and not body_html:
                        payload = part.get_content()
                        if isinstance(payload, str):
                            body_html = payload

                rec.body_text = body_text or None
                rec.body_html = body_html or None
                rec.attachment_names = json.dumps(attachment_names) if attachment_names else None
            except Exception:
                continue

        db.commit()
    except Exception:
        pass
    finally:
        db.close()


def _backfill_email_labels():
    """Auto-detect labels for existing ProcessedEmail records that have no label."""
    from app.models import ProcessedEmail
    from app.services.email_labeler import auto_detect_label

    db = SessionLocal()
    try:
        records = (
            db.query(ProcessedEmail)
            .filter(ProcessedEmail.label.is_(None))
            .all()
        )
        for rec in records:
            label = auto_detect_label(rec.subject, rec.body_text)
            if label:
                rec.label = label
        db.commit()
    except Exception:
        pass
    finally:
        db.close()


def _backfill_managed_data():
    """Seed managed_cities from existing supplier cities, and seed default categories."""
    from app.models import ManagedCity, ManagedCategory

    db = SessionLocal()
    try:
        # Seed cities from existing Hotel, Restaurant, TransportCompany cities
        existing_city_names = {c.name for c in db.query(ManagedCity).all()}
        all_cities: set[str] = set()
        for city_val in db.query(Hotel.city).distinct().all():
            if city_val[0]:
                all_cities.add(city_val[0].strip())
        for city_val in db.query(Restaurant.city).distinct().all():
            if city_val[0]:
                all_cities.add(city_val[0].strip())
        for city_val in db.query(TransportCompany.city).distinct().all():
            if city_val[0]:
                all_cities.add(city_val[0].strip())

        for city_name in sorted(all_cities):
            if city_name and city_name not in existing_city_names:
                db.add(ManagedCity(name=city_name))

        # Seed default categories
        default_categories = [
            ("hotel", "Hotel"),
            ("restaurant", "Restaurant"),
            ("transportation", "Transport"),
        ]
        existing_slugs = {c.slug for c in db.query(ManagedCategory).all()}
        for slug, label in default_categories:
            if slug not in existing_slugs:
                db.add(ManagedCategory(slug=slug, label=label))

        db.commit()
    except Exception:
        pass
    finally:
        db.close()


@app.on_event("shutdown")
def on_shutdown():
    stop_scheduler()


@app.get("/api/stats", response_model=StatsOut)
def get_stats():
    db = SessionLocal()
    try:
        total_documents = db.execute(select(func.count(Document.id))).scalar() or 0
        total_hotels = db.execute(select(func.count(Hotel.id))).scalar() or 0
        total_prices = db.execute(select(func.count(Price.id))).scalar() or 0
        total_restaurants = db.execute(select(func.count(Restaurant.id))).scalar() or 0
        total_menu_prices = db.execute(select(func.count(MenuPrice.id))).scalar() or 0
        total_transport_companies = db.execute(select(func.count(TransportCompany.id))).scalar() or 0
        total_transport_prices = db.execute(select(func.count(TransportPrice.id))).scalar() or 0
        cities = db.execute(select(Hotel.city).distinct().order_by(Hotel.city)).scalars().all()
        recent = (
            db.query(Document)
            .order_by(Document.upload_date.desc())
            .limit(5)
            .all()
        )
        return StatsOut(
            total_documents=total_documents,
            total_hotels=total_hotels,
            total_prices=total_prices,
            total_restaurants=total_restaurants,
            total_menu_prices=total_menu_prices,
            total_transport_companies=total_transport_companies,
            total_transport_prices=total_transport_prices,
            cities=list(cities),
            recent_uploads=recent,
        )
    finally:
        db.close()


@app.get("/api/health")
def health():
    return {"status": "ok"}
