from pydantic import BaseModel
from datetime import date, datetime
from typing import Optional


class VehicleBase(BaseModel):
    vin: str
    year: int
    make: str
    model: str
    trim: Optional[str] = None
    engine: Optional[str] = None
    transmission: Optional[str] = None
    drivetrain: Optional[str] = None
    color_exterior: Optional[str] = None
    color_interior: Optional[str] = None


class VehicleCreate(VehicleBase):
    purchase_date: Optional[date] = None
    purchase_mileage: Optional[int] = None
    current_mileage: Optional[int] = None


class VehicleUpdate(BaseModel):
    current_mileage: Optional[int] = None
    color_exterior: Optional[str] = None
    color_interior: Optional[str] = None


class VehicleResponse(VehicleBase):
    id: int
    purchase_date: Optional[date] = None
    purchase_mileage: Optional[int] = None
    current_mileage: Optional[int] = None
    last_mileage_update: Optional[datetime] = None
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True
