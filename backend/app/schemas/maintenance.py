from pydantic import BaseModel
from datetime import date, datetime
from typing import Optional


class MaintenanceBase(BaseModel):
    maintenance_type: str
    description: Optional[str] = None
    date_performed: date
    mileage: int


class MaintenanceCreate(MaintenanceBase):
    vehicle_id: int
    cost: Optional[float] = None
    parts_cost: Optional[float] = None
    labor_cost: Optional[float] = None
    service_provider: Optional[str] = None
    location: Optional[str] = None
    parts_used: Optional[str] = None
    notes: Optional[str] = None


class MaintenanceUpdate(BaseModel):
    maintenance_type: Optional[str] = None
    description: Optional[str] = None
    date_performed: Optional[date] = None
    mileage: Optional[int] = None
    cost: Optional[float] = None
    parts_cost: Optional[float] = None
    labor_cost: Optional[float] = None
    service_provider: Optional[str] = None
    location: Optional[str] = None
    parts_used: Optional[str] = None
    notes: Optional[str] = None


class MaintenanceResponse(MaintenanceBase):
    id: int
    vehicle_id: int
    cost: Optional[float] = None
    parts_cost: Optional[float] = None
    labor_cost: Optional[float] = None
    service_provider: Optional[str] = None
    location: Optional[str] = None
    parts_used: Optional[str] = None
    notes: Optional[str] = None
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True
