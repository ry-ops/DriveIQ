"""Import data API for CARFAX and service records."""
from fastapi import APIRouter, HTTPException, UploadFile, File, Depends
from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import List
import tempfile
import os

from app.core.database import get_db
from app.core.security import get_current_user
from app.services.carfax_parser import parse_carfax_pdf, convert_to_maintenance_records

router = APIRouter()


@router.post("/carfax")
async def import_carfax(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """Import service records from a CARFAX PDF."""
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="File must be a PDF")

    # Save uploaded file temporarily
    with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as tmp:
        content = await file.read()
        tmp.write(content)
        tmp_path = tmp.name

    try:
        # Parse CARFAX
        carfax_data = parse_carfax_pdf(tmp_path)

        # Convert to maintenance records
        maintenance_records = convert_to_maintenance_records(carfax_data)

        # Insert into database
        inserted_count = 0
        for record in maintenance_records:
            try:
                db.execute(
                    text("""
                    INSERT INTO maintenance_logs
                    (date, mileage, service_type, description, category, source, location)
                    VALUES (:date, :mileage, :service_type, :description, :category, :source, :location)
                    ON CONFLICT DO NOTHING
                    """),
                    record
                )
                inserted_count += 1
            except Exception:
                continue

        db.commit()

        return {
            "message": "CARFAX imported successfully",
            "vehicle": carfax_data.vehicle,
            "vin": carfax_data.vin,
            "total_records": carfax_data.total_records,
            "imported_records": inserted_count,
            "owners": carfax_data.owners,
            "accidents": carfax_data.accidents
        }

    finally:
        # Clean up temp file
        os.unlink(tmp_path)


@router.post("/service-record")
async def add_service_record(
    date: str,
    mileage: int,
    service_type: str,
    description: str,
    category: str = "maintenance",
    location: str = None,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """Add a manual service record."""
    try:
        db.execute(
            text("""
            INSERT INTO maintenance_logs
            (date, mileage, service_type, description, category, source, location)
            VALUES (:date, :mileage, :service_type, :description, :category, 'manual', :location)
            """),
            {
                "date": date,
                "mileage": mileage,
                "service_type": service_type,
                "description": description,
                "category": category,
                "location": location
            }
        )
        db.commit()

        return {"message": "Service record added successfully"}

    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/service-records")
async def get_service_records(
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """Get all service records."""
    results = db.execute(
        text("""
        SELECT id, date, mileage, service_type, description, category, source, location
        FROM maintenance_logs
        ORDER BY date DESC, mileage DESC
        """)
    ).fetchall()

    return [
        {
            "id": r.id,
            "date": str(r.date),
            "mileage": r.mileage,
            "service_type": r.service_type,
            "description": r.description,
            "category": r.category,
            "source": r.source,
            "location": r.location
        }
        for r in results
    ]


@router.get("/kpis")
async def get_maintenance_kpis(
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """Get maintenance KPIs from service records."""
    # Total records
    total = db.execute(text("SELECT COUNT(*) FROM maintenance_logs")).scalar() or 0

    # Last service
    last_service = db.execute(
        text("SELECT date, mileage, service_type FROM maintenance_logs ORDER BY date DESC LIMIT 1")
    ).fetchone()

    # Latest mileage
    latest_mileage = db.execute(
        text("SELECT MAX(mileage) FROM maintenance_logs")
    ).scalar() or 0

    # Services by category
    category_counts = db.execute(
        text("""
        SELECT category, COUNT(*) as count
        FROM maintenance_logs
        GROUP BY category
        """)
    ).fetchall()

    # Recent services (last 5)
    recent = db.execute(
        text("""
        SELECT date, service_type, mileage
        FROM maintenance_logs
        ORDER BY date DESC
        LIMIT 5
        """)
    ).fetchall()

    return {
        "total_records": total,
        "latest_mileage": latest_mileage,
        "last_service": {
            "date": str(last_service.date) if last_service else None,
            "mileage": last_service.mileage if last_service else None,
            "type": last_service.service_type if last_service else None
        },
        "by_category": {r.category: r.count for r in category_counts},
        "recent_services": [
            {
                "date": str(r.date),
                "type": r.service_type,
                "mileage": r.mileage
            }
            for r in recent
        ]
    }
