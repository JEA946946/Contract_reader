from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select, func, text

from app.config import settings
from app.database import engine, Base, get_db, SessionLocal
from app.models import Document, Hotel, Price, Restaurant, MenuPrice, TransportCompany, TransportPrice, Folder
from app.routers import documents, prices, exports, hotels, email_polling, restaurants, transportation, folders, suppliers, settings as settings_router
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
        "ALTER TABLE restaurants ADD COLUMN cmr_supplier_id VARCHAR(36) NULL",
        "ALTER TABLE transport_companies ADD COLUMN cmr_supplier_id VARCHAR(36) NULL",
        # Extraction pipeline optimization
        "ALTER TABLE documents ADD COLUMN content_hash VARCHAR(64) NULL",
        "ALTER TABLE documents ADD COLUMN confidence_score DECIMAL(3,2) NULL",
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

    start_scheduler()


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
