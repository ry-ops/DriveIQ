"""Import data API for CARFAX and service records."""
from fastapi import APIRouter, HTTPException, UploadFile, File, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import List
import tempfile
import os
import shutil
from pathlib import Path

from app.core.database import get_db
from app.core.security import get_current_user
from app.services.carfax_parser import parse_carfax_pdf, convert_to_maintenance_records

router = APIRouter()

# Storage directory for CARFAX PDFs
CARFAX_DIR = Path(__file__).parent.parent.parent.parent / "carfax_reports"
CARFAX_DIR.mkdir(parents=True, exist_ok=True)


def ensure_carfax_tables(db: Session):
    """Ensure CARFAX-related tables exist."""
    # Create carfax_reports table
    db.execute(text("""
        CREATE TABLE IF NOT EXISTS carfax_reports (
            id SERIAL PRIMARY KEY,
            vin VARCHAR(17) UNIQUE,
            vehicle VARCHAR(255),
            year INTEGER,
            make VARCHAR(100),
            model VARCHAR(100),
            trim VARCHAR(100),
            body_style VARCHAR(100),
            engine VARCHAR(100),
            fuel_type VARCHAR(50),
            drivetrain VARCHAR(50),
            retail_value INTEGER,
            report_date DATE,
            owner_count INTEGER,
            accidents INTEGER DEFAULT 0,
            no_accidents BOOLEAN DEFAULT TRUE,
            single_owner BOOLEAN DEFAULT FALSE,
            cpo_status VARCHAR(50),
            has_service_history BOOLEAN DEFAULT FALSE,
            personal_vehicle BOOLEAN DEFAULT TRUE,
            annual_miles INTEGER,
            last_odometer INTEGER,
            year_purchased INTEGER,
            ownership_length VARCHAR(50),
            ownership_states TEXT,
            damage_brands_clear BOOLEAN DEFAULT TRUE,
            odometer_brands_clear BOOLEAN DEFAULT TRUE,
            cpo_warranty VARCHAR(100),
            cpo_inspection_points INTEGER,
            pdf_path VARCHAR(500),
            imported_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW()
        )
    """))

    # Add new columns to maintenance_logs if they don't exist
    try:
        db.execute(text("ALTER TABLE maintenance_logs ADD COLUMN IF NOT EXISTS dealer_name VARCHAR(255)"))
        db.execute(text("ALTER TABLE maintenance_logs ADD COLUMN IF NOT EXISTS dealer_rating DECIMAL(2,1)"))
        db.execute(text("ALTER TABLE maintenance_logs ADD COLUMN IF NOT EXISTS dealer_phone VARCHAR(20)"))
    except Exception:
        pass  # Columns may already exist

    db.commit()


@router.post("/carfax")
async def import_carfax(
    file: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    """Import comprehensive data from a CARFAX PDF."""
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="File must be a PDF")

    # Ensure tables exist
    ensure_carfax_tables(db)

    # Save uploaded file temporarily
    with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as tmp:
        content = await file.read()
        tmp.write(content)
        tmp_path = tmp.name

    try:
        # Parse CARFAX
        carfax_data = parse_carfax_pdf(tmp_path)

        # Save PDF permanently if we have a VIN
        pdf_path = None
        if carfax_data.vin:
            pdf_filename = f"{carfax_data.vin}_{carfax_data.report_date or 'unknown'}.pdf".replace("/", "-")
            pdf_path = CARFAX_DIR / pdf_filename
            shutil.copy(tmp_path, pdf_path)
            pdf_path = str(pdf_path)

        # Store CARFAX report metadata
        ownership_states = ','.join(carfax_data.ownership_info.states) if carfax_data.ownership_info and carfax_data.ownership_info.states else None

        db.execute(
            text("""
            INSERT INTO carfax_reports (
                vin, vehicle, year, make, model, trim, body_style, engine, fuel_type, drivetrain,
                retail_value, report_date, owner_count, accidents, no_accidents, single_owner,
                cpo_status, has_service_history, personal_vehicle, annual_miles, last_odometer,
                year_purchased, ownership_length, ownership_states, damage_brands_clear,
                odometer_brands_clear, cpo_warranty, cpo_inspection_points, pdf_path
            ) VALUES (
                :vin, :vehicle, :year, :make, :model, :trim, :body_style, :engine, :fuel_type, :drivetrain,
                :retail_value, :report_date, :owner_count, :accidents, :no_accidents, :single_owner,
                :cpo_status, :has_service_history, :personal_vehicle, :annual_miles, :last_odometer,
                :year_purchased, :ownership_length, :ownership_states, :damage_brands_clear,
                :odometer_brands_clear, :cpo_warranty, :cpo_inspection_points, :pdf_path
            )
            ON CONFLICT (vin) DO UPDATE SET
                vehicle = EXCLUDED.vehicle,
                retail_value = EXCLUDED.retail_value,
                report_date = EXCLUDED.report_date,
                owner_count = EXCLUDED.owner_count,
                accidents = EXCLUDED.accidents,
                last_odometer = EXCLUDED.last_odometer,
                cpo_status = EXCLUDED.cpo_status,
                cpo_warranty = EXCLUDED.cpo_warranty,
                pdf_path = EXCLUDED.pdf_path,
                updated_at = NOW()
            """),
            {
                "vin": carfax_data.vin,
                "vehicle": carfax_data.vehicle,
                "year": carfax_data.year,
                "make": carfax_data.make,
                "model": carfax_data.model,
                "trim": carfax_data.trim,
                "body_style": carfax_data.body_style,
                "engine": carfax_data.engine,
                "fuel_type": carfax_data.fuel_type,
                "drivetrain": carfax_data.drivetrain,
                "retail_value": carfax_data.retail_value,
                "report_date": carfax_data.report_date,
                "owner_count": carfax_data.owners,
                "accidents": carfax_data.accidents,
                "no_accidents": carfax_data.no_accidents,
                "single_owner": carfax_data.single_owner,
                "cpo_status": carfax_data.cpo_status,
                "has_service_history": carfax_data.has_service_history,
                "personal_vehicle": carfax_data.personal_vehicle,
                "annual_miles": carfax_data.ownership_info.annual_miles if carfax_data.ownership_info else None,
                "last_odometer": carfax_data.ownership_info.last_odometer if carfax_data.ownership_info else None,
                "year_purchased": carfax_data.ownership_info.year_purchased if carfax_data.ownership_info else None,
                "ownership_length": carfax_data.ownership_info.length_of_ownership if carfax_data.ownership_info else None,
                "ownership_states": ownership_states,
                "damage_brands_clear": carfax_data.title_info.damage_brands_clear if carfax_data.title_info else True,
                "odometer_brands_clear": carfax_data.title_info.odometer_brands_clear if carfax_data.title_info else True,
                "cpo_warranty": carfax_data.cpo_warranty,
                "cpo_inspection_points": carfax_data.cpo_inspection_points,
                "pdf_path": pdf_path
            }
        )

        # Convert to maintenance records
        maintenance_records = convert_to_maintenance_records(carfax_data)

        # Insert service records into database
        inserted_count = 0
        for record in maintenance_records:
            try:
                record['mileage_val'] = record['mileage'] if record['mileage'] is not None else 0
                record['service_type'] = (record['service_type'] or '')[:200]
                record['description'] = (record['description'] or '')[:500] if record['description'] else None
                record['location'] = (record['location'] or '')[:300] if record['location'] else None
                record['dealer_name'] = (record.get('dealer_name') or '')[:255] if record.get('dealer_name') else None
                record['dealer_phone'] = (record.get('dealer_phone') or '')[:20] if record.get('dealer_phone') else None

                db.execute(
                    text("""
                    INSERT INTO maintenance_logs
                    (date, mileage, service_type, description, category, source, location, dealer_name, dealer_rating, dealer_phone)
                    VALUES (:date, :mileage_val, :service_type, :description, :category, :source, :location, :dealer_name, :dealer_rating, :dealer_phone)
                    """),
                    record
                )
                inserted_count += 1
            except Exception as e:
                print(f"Error inserting record: {e}")
                continue

        db.commit()

        return {
            "message": "CARFAX imported successfully",
            "vehicle": carfax_data.vehicle,
            "vin": carfax_data.vin,
            "retail_value": carfax_data.retail_value,
            "total_records": carfax_data.total_records,
            "imported_records": inserted_count,
            "owners": carfax_data.owners,
            "accidents": carfax_data.accidents,
            "cpo_status": carfax_data.cpo_status,
            "last_odometer": carfax_data.ownership_info.last_odometer if carfax_data.ownership_info else None,
            "annual_miles": carfax_data.ownership_info.annual_miles if carfax_data.ownership_info else None,
            "no_accidents": carfax_data.no_accidents,
            "single_owner": carfax_data.single_owner
        }

    finally:
        os.unlink(tmp_path)


@router.get("/carfax-report")
async def get_carfax_report(db: Session = Depends(get_db)):
    """Get the stored CARFAX report data."""
    try:
        result = db.execute(
            text("""
            SELECT * FROM carfax_reports
            ORDER BY updated_at DESC
            LIMIT 1
            """)
        ).fetchone()

        if not result:
            raise HTTPException(status_code=404, detail="No CARFAX report found")

        return dict(result._mapping)
    except Exception as e:
        # Table doesn't exist yet
        if "carfax_reports" in str(e):
            raise HTTPException(status_code=404, detail="No CARFAX report found")
        raise


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
    try:
        # Try with dealer columns first
        results = db.execute(
            text("""
            SELECT id, date, mileage, service_type, description, category, source, location, tags,
                   dealer_name, dealer_rating, dealer_phone
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
                "tags": r.tags.split(',') if r.tags else [],
                "dealer_name": r.dealer_name,
                "dealer_rating": float(r.dealer_rating) if r.dealer_rating else None,
                "dealer_phone": r.dealer_phone
            }
            for r in results
        ]
    except Exception as e:
        # Dealer columns don't exist yet, fall back to basic query
        if "dealer_name" in str(e):
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
                    "tags": r.tags.split(',') if r.tags else [],
                    "dealer_name": None,
                    "dealer_rating": None,
                    "dealer_phone": None
                }
                for r in results
            ]
        raise


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
    tags: List[str] = Query(None),
    db: Session = Depends(get_db)
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
