from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from datetime import datetime

from app.core.database import get_db
from app.models.vehicle import Vehicle
from app.schemas.vehicle import VehicleCreate, VehicleUpdate, VehicleResponse

router = APIRouter()


@router.get("/", response_model=VehicleResponse)
def get_vehicle(db: Session = Depends(get_db)):
    """Get the vehicle information."""
    vehicle = db.query(Vehicle).first()
    if not vehicle:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    return vehicle


@router.post("/", response_model=VehicleResponse)
def create_vehicle(vehicle: VehicleCreate, db: Session = Depends(get_db)):
    """Create vehicle record."""
    db_vehicle = Vehicle(**vehicle.model_dump())
    db.add(db_vehicle)
    db.commit()
    db.refresh(db_vehicle)
    return db_vehicle


@router.patch("/", response_model=VehicleResponse)
def update_vehicle(vehicle: VehicleUpdate, db: Session = Depends(get_db)):
    """Update vehicle information (e.g., current mileage)."""
    db_vehicle = db.query(Vehicle).first()
    if not db_vehicle:
        raise HTTPException(status_code=404, detail="Vehicle not found")

    update_data = vehicle.model_dump(exclude_unset=True)
    if "current_mileage" in update_data:
        update_data["last_mileage_update"] = datetime.utcnow()

    for key, value in update_data.items():
        setattr(db_vehicle, key, value)

    db.commit()
    db.refresh(db_vehicle)
    return db_vehicle


@router.patch("/mileage/{mileage}", response_model=VehicleResponse)
def update_mileage(mileage: int, db: Session = Depends(get_db)):
    """Quick endpoint to update current mileage."""
    db_vehicle = db.query(Vehicle).first()
    if not db_vehicle:
        raise HTTPException(status_code=404, detail="Vehicle not found")

    db_vehicle.current_mileage = mileage
    db_vehicle.last_mileage_update = datetime.utcnow()

    db.commit()
    db.refresh(db_vehicle)
    return db_vehicle
