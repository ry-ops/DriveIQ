from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from sqlalchemy.orm import Session
from typing import List, Optional
from pathlib import Path
from urllib.parse import quote
from pydantic import BaseModel
import os
import json
import re

from app.core.database import get_db
from app.models.maintenance import MaintenanceRecord
from app.models.reminder import Reminder
from app.models.vehicle import Vehicle
from app.schemas.maintenance import MaintenanceCreate, MaintenanceUpdate, MaintenanceResponse
from app.data.maintenance_schedule import get_service_key, get_maintenance_item
from app.services.embeddings import generate_embedding
from app.core.qdrant_client import search_vectors

router = APIRouter()


# Mapping of maintenance types to search queries for finding related docs
MAINTENANCE_SEARCH_QUERIES = {
    "oil_change": "engine oil change procedure specifications drain refill",
    "tire_rotation": "tire rotation pattern procedure front rear",
    "air_filter": "air filter replacement engine air cleaner",
    "cabin_filter": "cabin air filter replacement hvac",
    "wiper_blades": "windshield wiper blade replacement",
    "inspection": "vehicle inspection checklist maintenance",
    "tire_replacement": "tire specifications size pressure replacement",
    "wheel_alignment": "wheel alignment specifications adjustment",
    "tire_balance": "tire wheel balance vibration",
    "brakes_checked": "brake inspection pad thickness rotor",
    "brake_pads": "brake pad replacement front rear procedure",
    "brake_rotors": "brake rotor disc replacement resurfacing",
    "brake_fluid_flush": "brake fluid bleeding flush DOT specifications",
    "transmission_service": "transmission fluid change automatic manual",
    "coolant_flush": "coolant antifreeze flush drain refill",
    "power_steering_flush": "power steering fluid flush",
    "differential_service": "differential fluid gear oil change",
    "fuel_filter": "fuel filter replacement",
    "spark_plugs": "spark plug replacement gap specifications",
    "timing_belt": "timing belt chain replacement interval",
    "serpentine_belt": "serpentine drive belt replacement tension",
    "fuel_system_service": "fuel system injector cleaning",
    "battery": "battery replacement specifications CCA",
    "alternator": "alternator charging system replacement",
    "starter": "starter motor replacement",
    "ac_service": "air conditioning AC refrigerant recharge",
    "shocks_struts": "shock absorber strut replacement suspension",
    "ball_joints": "ball joint replacement suspension",
    "tie_rods": "tie rod end replacement steering",
}


class RelatedDocument(BaseModel):
    document_name: str
    page_number: int
    chapter: Optional[str] = None
    section: Optional[str] = None
    relevance: float
    thumbnail_url: str
    fullsize_url: str
    content_preview: str


class RelatedDocsResponse(BaseModel):
    maintenance_type: str
    search_query: str
    documents: List[RelatedDocument]

# Upload directories - use /app paths in container, relative paths locally
if Path("/app/receipts").exists() or Path("/app/docs").exists():
    RECEIPTS_DIR = Path("/app/receipts")
    PHOTOS_DIR = Path("/app/maintenance_photos")
else:
    RECEIPTS_DIR = Path(__file__).parent.parent.parent.parent / "receipts"
    PHOTOS_DIR = Path(__file__).parent.parent.parent.parent / "maintenance_photos"

RECEIPTS_DIR.mkdir(exist_ok=True)
PHOTOS_DIR.mkdir(exist_ok=True)

# Allowed file types
ALLOWED_RECEIPT_EXTENSIONS = {".pdf", ".jpg", ".jpeg", ".png", ".gif"}
ALLOWED_PHOTO_EXTENSIONS = {".jpg", ".jpeg", ".png", ".gif", ".webp", ".heic"}
MAX_RECEIPT_SIZE = 10 * 1024 * 1024  # 10MB
MAX_PHOTO_SIZE = 15 * 1024 * 1024  # 15MB


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


# ============== Photo Endpoints ==============

class PhotoUploadResponse(BaseModel):
    filename: str
    url: str
    thumbnail_url: str
    photo_type: str
    timestamp: str


@router.post("/{record_id}/photos", response_model=PhotoUploadResponse)
async def upload_photo(
    record_id: int,
    file: UploadFile = File(...),
    photo_type: str = Query(default="general", regex="^(before|after|general)$"),
    caption: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """Upload a photo to a maintenance record (before, after, or general)."""
    from datetime import datetime

    # Get the maintenance record
    db_record = db.query(MaintenanceRecord).filter(MaintenanceRecord.id == record_id).first()
    if not db_record:
        raise HTTPException(status_code=404, detail="Maintenance record not found")

    # Validate file extension
    ext = Path(file.filename).suffix.lower()
    if ext not in ALLOWED_PHOTO_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"File type not allowed. Allowed types: {', '.join(ALLOWED_PHOTO_EXTENSIONS)}"
        )

    # Read file content
    content = await file.read()

    # Validate file size
    if len(content) > MAX_PHOTO_SIZE:
        raise HTTPException(
            status_code=400,
            detail=f"File too large. Maximum size: {MAX_PHOTO_SIZE // (1024*1024)}MB"
        )

    # Create unique filename
    safe_filename = sanitize_filename(file.filename)
    if not safe_filename:
        raise HTTPException(status_code=400, detail="Invalid filename")

    timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    unique_filename = f"{record_id}_{photo_type}_{timestamp}_{safe_filename}"
    file_path = PHOTOS_DIR / unique_filename

    # Save file
    with open(file_path, "wb") as f:
        f.write(content)

    # Update photos list in record
    current_photos = []
    if db_record.photos:
        try:
            current_photos = json.loads(db_record.photos)
        except json.JSONDecodeError:
            current_photos = []

    photo_entry = {
        "filename": unique_filename,
        "type": photo_type,
        "timestamp": datetime.utcnow().isoformat(),
        "caption": caption,
    }
    current_photos.append(photo_entry)

    db_record.photos = json.dumps(current_photos)
    db.commit()

    return PhotoUploadResponse(
        filename=unique_filename,
        url=f"/api/maintenance/{record_id}/photos/{unique_filename}",
        thumbnail_url=f"/api/maintenance/{record_id}/photos/{unique_filename}/thumbnail",
        photo_type=photo_type,
        timestamp=photo_entry["timestamp"],
    )


@router.get("/{record_id}/photos")
async def list_photos(
    record_id: int,
    db: Session = Depends(get_db)
):
    """List all photos for a maintenance record."""
    db_record = db.query(MaintenanceRecord).filter(MaintenanceRecord.id == record_id).first()
    if not db_record:
        raise HTTPException(status_code=404, detail="Maintenance record not found")

    photos = []
    if db_record.photos:
        try:
            photo_list = json.loads(db_record.photos)
            for photo in photo_list:
                filename = photo.get("filename", "")
                file_path = PHOTOS_DIR / filename
                if file_path.exists():
                    photos.append({
                        **photo,
                        "url": f"/api/maintenance/{record_id}/photos/{filename}",
                        "thumbnail_url": f"/api/maintenance/{record_id}/photos/{filename}/thumbnail",
                        "size": file_path.stat().st_size,
                    })
        except json.JSONDecodeError:
            pass

    return photos


@router.get("/{record_id}/photos/{filename}")
async def get_photo(
    record_id: int,
    filename: str,
    db: Session = Depends(get_db)
):
    """Get a photo from a maintenance record."""
    from fastapi.responses import FileResponse

    db_record = db.query(MaintenanceRecord).filter(MaintenanceRecord.id == record_id).first()
    if not db_record:
        raise HTTPException(status_code=404, detail="Maintenance record not found")

    safe_filename = sanitize_filename(filename)
    if not safe_filename:
        raise HTTPException(status_code=400, detail="Invalid filename")

    file_path = PHOTOS_DIR / safe_filename
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Photo not found")

    if not file_path.resolve().parent == PHOTOS_DIR.resolve():
        raise HTTPException(status_code=400, detail="Invalid file path")

    return FileResponse(file_path, media_type="image/jpeg")


@router.get("/{record_id}/photos/{filename}/thumbnail")
async def get_photo_thumbnail(
    record_id: int,
    filename: str,
    db: Session = Depends(get_db)
):
    """Get a thumbnail of a photo (resized on-the-fly)."""
    from fastapi.responses import Response
    from PIL import Image
    import io

    db_record = db.query(MaintenanceRecord).filter(MaintenanceRecord.id == record_id).first()
    if not db_record:
        raise HTTPException(status_code=404, detail="Maintenance record not found")

    safe_filename = sanitize_filename(filename)
    if not safe_filename:
        raise HTTPException(status_code=400, detail="Invalid filename")

    file_path = PHOTOS_DIR / safe_filename
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Photo not found")

    if not file_path.resolve().parent == PHOTOS_DIR.resolve():
        raise HTTPException(status_code=400, detail="Invalid file path")

    # Generate thumbnail
    try:
        with Image.open(file_path) as img:
            img.thumbnail((200, 200))
            buffer = io.BytesIO()
            img.save(buffer, format="JPEG", quality=85)
            buffer.seek(0)
            return Response(content=buffer.read(), media_type="image/jpeg")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate thumbnail: {str(e)}")


@router.delete("/{record_id}/photos/{filename}")
async def delete_photo(
    record_id: int,
    filename: str,
    db: Session = Depends(get_db)
):
    """Delete a photo from a maintenance record."""
    db_record = db.query(MaintenanceRecord).filter(MaintenanceRecord.id == record_id).first()
    if not db_record:
        raise HTTPException(status_code=404, detail="Maintenance record not found")

    safe_filename = sanitize_filename(filename)
    if not safe_filename:
        raise HTTPException(status_code=400, detail="Invalid filename")

    # Check if photo is in the list
    current_photos = []
    if db_record.photos:
        try:
            current_photos = json.loads(db_record.photos)
        except json.JSONDecodeError:
            current_photos = []

    photo_filenames = [p.get("filename") for p in current_photos]
    if safe_filename not in photo_filenames:
        raise HTTPException(status_code=404, detail="Photo not found in record")

    # Delete the file
    file_path = PHOTOS_DIR / safe_filename
    if file_path.exists():
        if not file_path.resolve().parent == PHOTOS_DIR.resolve():
            raise HTTPException(status_code=400, detail="Invalid file path")
        file_path.unlink()

    # Update photos list
    current_photos = [p for p in current_photos if p.get("filename") != safe_filename]
    db_record.photos = json.dumps(current_photos) if current_photos else None
    db.commit()

    return {"message": f"Photo '{safe_filename}' deleted successfully"}


@router.get("/related-docs/{maintenance_type}", response_model=RelatedDocsResponse)
async def get_related_documents(
    maintenance_type: str,
    limit: int = Query(default=5, le=10),
):
    """
    Get related document pages for a maintenance type.
    Uses RAG search to find relevant manual pages, CARFAX entries, etc.
    """
    # Get search query for this maintenance type
    search_query = MAINTENANCE_SEARCH_QUERIES.get(
        maintenance_type,
        maintenance_type.replace("_", " ")  # Fallback: just use the type name
    )

    # Generate embedding for the search query
    query_embedding = generate_embedding(search_query)

    # Search Qdrant for related documents
    results = search_vectors(
        query_vector=query_embedding,
        limit=limit,
        score_threshold=0.3,  # Only return reasonably relevant results
    )

    # Build response with page URLs
    documents = []
    seen_pages = set()  # Avoid duplicate pages

    for result in results:
        payload = result.get("payload", {})
        doc_name = payload.get("document_name", "")
        page_num = payload.get("page_number", 0)

        # Skip duplicates (same doc + page)
        page_key = f"{doc_name}:{page_num}"
        if page_key in seen_pages:
            continue
        seen_pages.add(page_key)

        # Build URLs
        encoded_doc = quote(doc_name, safe='')
        content = payload.get("content", "")
        preview = content[:150] + "..." if len(content) > 150 else content

        documents.append(RelatedDocument(
            document_name=doc_name,
            page_number=page_num,
            chapter=payload.get("chapter"),
            section=payload.get("section"),
            relevance=round(result.get("score", 0), 2),
            thumbnail_url=f"/api/pages/{encoded_doc}/{page_num}/thumbnail",
            fullsize_url=f"/api/pages/{encoded_doc}/{page_num}/full",
            content_preview=preview,
        ))

    return RelatedDocsResponse(
        maintenance_type=maintenance_type,
        search_query=search_query,
        documents=documents,
    )
