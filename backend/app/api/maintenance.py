from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from sqlalchemy.orm import Session
from typing import List, Optional
from pathlib import Path
import os
import json
import re

from app.core.database import get_db
from app.models.maintenance import MaintenanceRecord
from app.models.reminder import Reminder
from app.models.vehicle import Vehicle
from app.schemas.maintenance import MaintenanceCreate, MaintenanceUpdate, MaintenanceResponse
from app.data.maintenance_schedule import get_service_key, get_maintenance_item

router = APIRouter()

# Receipt upload directory
RECEIPTS_DIR = Path(__file__).parent.parent.parent.parent / "receipts"
RECEIPTS_DIR.mkdir(exist_ok=True)

# Allowed file types for receipts
ALLOWED_RECEIPT_EXTENSIONS = {".pdf", ".jpg", ".jpeg", ".png", ".gif"}
MAX_RECEIPT_SIZE = 10 * 1024 * 1024  # 10MB


def sanitize_filename(filename: str) -> str:
    """Sanitize filename to prevent path traversal attacks."""
    filename = os.path.basename(filename)
    filename = re.sub(r'[^\w\s\-\.]', '', filename)
    filename = filename.lstrip('.')
    return filename


def sync_reminders_with_maintenance(db: Session, vehicle_id: int, maintenance_type: str, mileage: int):
    """
    Sync reminders with a new maintenance record.
    - Find matching active reminders by title
    - For recurring reminders: update due_mileage to mileage + interval
    - For non-recurring reminders: mark as completed
    - Update vehicle's current mileage if higher
    """
    from datetime import datetime, timedelta

    # Get the service key from maintenance type
    service_key = get_service_key(maintenance_type)
    schedule_item = get_maintenance_item(service_key) if service_key else None

    # Find matching active reminders by title (case-insensitive match)
    reminders = db.query(Reminder).filter(
        Reminder.vehicle_id == vehicle_id,
        Reminder.is_active == True,
        Reminder.is_completed == False
    ).all()

    updated_count = 0
    for reminder in reminders:
        # Match by title containing the maintenance type or vice versa
        title_lower = reminder.title.lower()
        type_lower = maintenance_type.lower()

        # Check for match
        is_match = (
            type_lower in title_lower or
            title_lower in type_lower or
            (schedule_item and schedule_item["name"].lower() in title_lower)
        )

        if is_match:
            if reminder.is_recurring and reminder.recurrence_interval_miles:
                # Update the due mileage for recurring reminders
                reminder.due_mileage = mileage + reminder.recurrence_interval_miles
                if reminder.recurrence_interval_days and reminder.due_date:
                    reminder.due_date = reminder.due_date + timedelta(days=reminder.recurrence_interval_days)
            else:
                # Mark non-recurring reminders as completed
                reminder.is_completed = True
                reminder.completed_at = datetime.utcnow()

            updated_count += 1

    # Update vehicle's current mileage if this maintenance was done at a higher mileage
    vehicle = db.query(Vehicle).filter(Vehicle.id == vehicle_id).first()
    if vehicle and mileage > (vehicle.current_mileage or 0):
        vehicle.current_mileage = mileage

    return updated_count


@router.get("", response_model=List[MaintenanceResponse])
def get_maintenance_records(
    skip: int = 0,
    limit: int = 100,
    maintenance_type: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """Get all maintenance records."""
    query = db.query(MaintenanceRecord)
    if maintenance_type:
        query = query.filter(MaintenanceRecord.maintenance_type == maintenance_type)
    return query.order_by(MaintenanceRecord.date_performed.desc()).offset(skip).limit(limit).all()


@router.get("/{record_id}", response_model=MaintenanceResponse)
def get_maintenance_record(record_id: int, db: Session = Depends(get_db)):
    """Get a specific maintenance record."""
    record = db.query(MaintenanceRecord).filter(MaintenanceRecord.id == record_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="Maintenance record not found")
    return record


@router.post("", response_model=MaintenanceResponse)
def create_maintenance_record(record: MaintenanceCreate, db: Session = Depends(get_db)):
    """Create a new maintenance record and sync with reminders."""
    db_record = MaintenanceRecord(**record.model_dump())
    db.add(db_record)
    db.commit()
    db.refresh(db_record)

    # Sync reminders with this maintenance record
    sync_reminders_with_maintenance(
        db,
        record.vehicle_id,
        record.maintenance_type,
        record.mileage
    )
    db.commit()

    return db_record


@router.patch("/{record_id}", response_model=MaintenanceResponse)
def update_maintenance_record(
    record_id: int,
    record: MaintenanceUpdate,
    db: Session = Depends(get_db)
):
    """Update a maintenance record and sync with reminders if mileage changes."""
    db_record = db.query(MaintenanceRecord).filter(MaintenanceRecord.id == record_id).first()
    if not db_record:
        raise HTTPException(status_code=404, detail="Maintenance record not found")

    update_data = record.model_dump(exclude_unset=True)

    # Track if mileage or type changed
    mileage_changed = "mileage" in update_data and update_data["mileage"] != db_record.mileage
    type_changed = "maintenance_type" in update_data and update_data["maintenance_type"] != db_record.maintenance_type

    for key, value in update_data.items():
        setattr(db_record, key, value)

    db.commit()
    db.refresh(db_record)

    # Sync reminders if mileage or type changed
    if mileage_changed or type_changed:
        sync_reminders_with_maintenance(
            db,
            db_record.vehicle_id,
            db_record.maintenance_type,
            db_record.mileage
        )
        db.commit()

    return db_record


@router.delete("/{record_id}")
def delete_maintenance_record(record_id: int, db: Session = Depends(get_db)):
    """Delete a maintenance record."""
    db_record = db.query(MaintenanceRecord).filter(MaintenanceRecord.id == record_id).first()
    if not db_record:
        raise HTTPException(status_code=404, detail="Maintenance record not found")

    db.delete(db_record)
    db.commit()
    return {"message": "Maintenance record deleted"}


@router.get("/types/summary")
def get_maintenance_summary(db: Session = Depends(get_db)):
    """Get summary of maintenance by type."""
    from sqlalchemy import func
    summary = db.query(
        MaintenanceRecord.maintenance_type,
        func.count(MaintenanceRecord.id).label("count"),
        func.sum(MaintenanceRecord.cost).label("total_cost"),
        func.max(MaintenanceRecord.date_performed).label("last_performed"),
        func.max(MaintenanceRecord.mileage).label("last_mileage")
    ).group_by(MaintenanceRecord.maintenance_type).all()

    return [
        {
            "type": s.maintenance_type,
            "count": s.count,
            "total_cost": float(s.total_cost) if s.total_cost else 0,
            "last_performed": s.last_performed,
            "last_mileage": s.last_mileage
        }
        for s in summary
    ]


@router.post("/{record_id}/documents", response_model=MaintenanceResponse)
async def upload_document(
    record_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    """Upload a document/receipt to a maintenance record."""
    # Get the maintenance record
    db_record = db.query(MaintenanceRecord).filter(MaintenanceRecord.id == record_id).first()
    if not db_record:
        raise HTTPException(status_code=404, detail="Maintenance record not found")

    # Validate file extension
    ext = Path(file.filename).suffix.lower()
    if ext not in ALLOWED_RECEIPT_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"File type not allowed. Allowed types: {', '.join(ALLOWED_RECEIPT_EXTENSIONS)}"
        )

    # Read file content
    content = await file.read()

    # Validate file size
    if len(content) > MAX_RECEIPT_SIZE:
        raise HTTPException(
            status_code=400,
            detail=f"File too large. Maximum size: {MAX_RECEIPT_SIZE // (1024*1024)}MB"
        )

    # Create unique filename with record_id prefix
    safe_filename = sanitize_filename(file.filename)
    if not safe_filename:
        raise HTTPException(status_code=400, detail="Invalid filename")

    # Add record_id to filename to avoid collisions
    unique_filename = f"{record_id}_{safe_filename}"
    file_path = RECEIPTS_DIR / unique_filename

    # Save file
    with open(file_path, "wb") as f:
        f.write(content)

    # Update documents list in record
    current_docs = []
    if db_record.documents:
        try:
            current_docs = json.loads(db_record.documents)
        except json.JSONDecodeError:
            current_docs = []

    if unique_filename not in current_docs:
        current_docs.append(unique_filename)

    db_record.documents = json.dumps(current_docs)
    db.commit()
    db.refresh(db_record)

    return db_record


@router.delete("/{record_id}/documents/{filename}")
async def delete_document(
    record_id: int,
    filename: str,
    db: Session = Depends(get_db)
):
    """Delete a document/receipt from a maintenance record."""
    # Get the maintenance record
    db_record = db.query(MaintenanceRecord).filter(MaintenanceRecord.id == record_id).first()
    if not db_record:
        raise HTTPException(status_code=404, detail="Maintenance record not found")

    # Sanitize filename
    safe_filename = sanitize_filename(filename)
    if not safe_filename:
        raise HTTPException(status_code=400, detail="Invalid filename")

    # Check if file is in the documents list
    current_docs = []
    if db_record.documents:
        try:
            current_docs = json.loads(db_record.documents)
        except json.JSONDecodeError:
            current_docs = []

    if safe_filename not in current_docs:
        raise HTTPException(status_code=404, detail="Document not found in record")

    # Delete the file
    file_path = RECEIPTS_DIR / safe_filename
    if file_path.exists():
        # Security check
        if not file_path.resolve().parent == RECEIPTS_DIR.resolve():
            raise HTTPException(status_code=400, detail="Invalid file path")
        file_path.unlink()

    # Update documents list
    current_docs.remove(safe_filename)
    db_record.documents = json.dumps(current_docs) if current_docs else None
    db.commit()

    return {"message": f"Document '{safe_filename}' deleted successfully"}


@router.get("/{record_id}/documents")
async def list_documents(
    record_id: int,
    db: Session = Depends(get_db)
):
    """List all documents/receipts for a maintenance record."""
    # Get the maintenance record
    db_record = db.query(MaintenanceRecord).filter(MaintenanceRecord.id == record_id).first()
    if not db_record:
        raise HTTPException(status_code=404, detail="Maintenance record not found")

    documents = []
    if db_record.documents:
        try:
            doc_list = json.loads(db_record.documents)
            for filename in doc_list:
                file_path = RECEIPTS_DIR / filename
                if file_path.exists():
                    stat = file_path.stat()
                    documents.append({
                        "filename": filename,
                        "size": stat.st_size,
                        "path": f"/api/maintenance/{record_id}/documents/{filename}/download"
                    })
        except json.JSONDecodeError:
            pass

    return documents


@router.get("/{record_id}/documents/{filename}/download")
async def download_document(
    record_id: int,
    filename: str,
    db: Session = Depends(get_db)
):
    """Download a document/receipt from a maintenance record."""
    from fastapi.responses import FileResponse

    # Get the maintenance record
    db_record = db.query(MaintenanceRecord).filter(MaintenanceRecord.id == record_id).first()
    if not db_record:
        raise HTTPException(status_code=404, detail="Maintenance record not found")

    # Sanitize filename
    safe_filename = sanitize_filename(filename)
    if not safe_filename:
        raise HTTPException(status_code=400, detail="Invalid filename")

    # Check if file exists
    file_path = RECEIPTS_DIR / safe_filename
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Document not found")

    # Security check
    if not file_path.resolve().parent == RECEIPTS_DIR.resolve():
        raise HTTPException(status_code=400, detail="Invalid file path")

    return FileResponse(file_path, filename=safe_filename)
