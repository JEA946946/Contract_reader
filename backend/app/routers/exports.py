from typing import Optional
from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.database import get_db
from app.services.exporter import export_csv, export_excel

router = APIRouter(prefix="/api/export", tags=["export"])


@router.get("/csv")
def download_csv(
    city: Optional[str] = Query(None),
    hotel_name: Optional[str] = Query(None),
    season_code: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    buffer = export_csv(db, city=city, hotel_name=hotel_name, season_code=season_code)
    return StreamingResponse(
        buffer,
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=hotel_prices.csv"},
    )


@router.get("/excel")
def download_excel(
    city: Optional[str] = Query(None),
    hotel_name: Optional[str] = Query(None),
    season_code: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    buffer = export_excel(db, city=city, hotel_name=hotel_name, season_code=season_code)
    return StreamingResponse(
        buffer,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=hotel_prices.xlsx"},
    )
