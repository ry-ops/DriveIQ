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
                # Handle NULL mileage and truncate fields
                record['mileage_val'] = record['mileage'] if record['mileage'] is not None else 0
                record['service_type'] = (record['service_type'] or '')[:200]
                record['description'] = (record['description'] or '')[:500] if record['description'] else None
                record['location'] = (record['location'] or '')[:300] if record['location'] else None

                db.execute(
                    text("""
                    INSERT INTO maintenance_logs
                    (date, mileage, service_type, description, category, source, location)
                    VALUES (:date, :mileage_val, :service_type, :description, :category, :source, :location)
                    ON CONFLICT (date, mileage, service_type) DO UPDATE SET
                        description = EXCLUDED.description,
                        category = EXCLUDED.category,
                        location = EXCLUDED.location
                    """),
                    record
                )
                inserted_count += 1
            except Exception as e:
                print(f"Error inserting record: {e}")
                db.rollback()
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
    db: Session = Depends(get_db)
):
    """Get all service records."""
    results = db.execute(
        text("""
        SELECT id, date, mileage, service_type, description, category, source, location, tags
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
            "location": r.location,
            "tags": r.tags.split(',') if r.tags else []
        }
        for r in results
    ]


@router.get("/service-records/{record_id}")
async def get_service_record(
    record_id: int,
    db: Session = Depends(get_db)
):
    """Get a specific service record."""
    result = db.execute(
        text("""
        SELECT id, date, mileage, service_type, description, category, source, location, tags
        FROM maintenance_logs
        WHERE id = :id
        """),
        {"id": record_id}
    ).fetchone()

    if not result:
        raise HTTPException(status_code=404, detail="Service record not found")

    return {
        "id": result.id,
        "date": str(result.date),
        "mileage": result.mileage,
        "service_type": result.service_type,
        "description": result.description,
        "category": result.category,
        "source": result.source,
        "location": result.location,
        "tags": result.tags.split(',') if result.tags else []
    }


@router.patch("/service-records/{record_id}")
async def update_service_record(
    record_id: int,
    date: str = None,
    mileage: int = None,
    service_type: str = None,
    description: str = None,
    category: str = None,
    source: str = None,
    location: str = None,
    tags: List[str] = None,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """Update a service record."""
    # Build update query dynamically
    updates = []
    params = {"id": record_id}

    if date is not None:
        updates.append("date = :date")
        params["date"] = date
    if mileage is not None:
        updates.append("mileage = :mileage")
        params["mileage"] = mileage
    if service_type is not None:
        updates.append("service_type = :service_type")
        params["service_type"] = service_type[:200]
    if description is not None:
        updates.append("description = :description")
        params["description"] = description[:500] if description else None
    if category is not None:
        updates.append("category = :category")
        params["category"] = category
    if source is not None:
        updates.append("source = :source")
        params["source"] = source
    if location is not None:
        updates.append("location = :location")
        params["location"] = location[:300] if location else None
    if tags is not None:
        updates.append("tags = :tags")
        params["tags"] = ','.join(tags) if tags else None

    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")

    try:
        db.execute(
            text(f"""
            UPDATE maintenance_logs
            SET {', '.join(updates)}
            WHERE id = :id
            """),
            params
        )
        db.commit()

        return {"message": "Service record updated successfully"}

    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/service-records/{record_id}")
async def delete_service_record(
    record_id: int,
    db: Session = Depends(get_db)
):
    """Delete a service record."""
    try:
        result = db.execute(
            text("DELETE FROM maintenance_logs WHERE id = :id"),
            {"id": record_id}
        )
        db.commit()

        if result.rowcount == 0:
            raise HTTPException(status_code=404, detail="Service record not found")

        return {"message": "Service record deleted successfully"}

    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/tags")
async def get_all_tags(
    db: Session = Depends(get_db)
):
    """Get all unique tags used across service records."""
    results = db.execute(
        text("""
        SELECT DISTINCT tags
        FROM maintenance_logs
        WHERE tags IS NOT NULL AND tags != ''
        """)
    ).fetchall()

    # Extract unique tags
    all_tags = set()
    for r in results:
        if r.tags:
            for tag in r.tags.split(','):
                tag = tag.strip()
                if tag:
                    all_tags.add(tag)

    return sorted(list(all_tags))


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
