from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Optional

from app.core.database import get_db
from app.models.maintenance import MaintenanceRecord
from app.schemas.maintenance import MaintenanceCreate, MaintenanceUpdate, MaintenanceResponse

router = APIRouter()


@router.get("/", response_model=List[MaintenanceResponse])
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


@router.post("/", response_model=MaintenanceResponse)
def create_maintenance_record(record: MaintenanceCreate, db: Session = Depends(get_db)):
    """Create a new maintenance record."""
    db_record = MaintenanceRecord(**record.model_dump())
    db.add(db_record)
    db.commit()
    db.refresh(db_record)
    return db_record


@router.patch("/{record_id}", response_model=MaintenanceResponse)
def update_maintenance_record(
    record_id: int,
    record: MaintenanceUpdate,
    db: Session = Depends(get_db)
):
    """Update a maintenance record."""
    db_record = db.query(MaintenanceRecord).filter(MaintenanceRecord.id == record_id).first()
    if not db_record:
        raise HTTPException(status_code=404, detail="Maintenance record not found")

    update_data = record.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_record, key, value)

    db.commit()
    db.refresh(db_record)
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
