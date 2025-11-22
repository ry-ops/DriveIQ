from pydantic import BaseModel
from datetime import date, datetime
from typing import Optional


class ReminderBase(BaseModel):
    title: str
    description: Optional[str] = None
    reminder_type: str  # mileage, date, both


class ReminderCreate(ReminderBase):
    vehicle_id: int
    due_date: Optional[date] = None
    due_mileage: Optional[int] = None
    is_recurring: bool = False
    recurrence_interval_days: Optional[int] = None
    recurrence_interval_miles: Optional[int] = None
    notify_days_before: int = 7
    notify_miles_before: int = 500


class ReminderUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    due_date: Optional[date] = None
    due_mileage: Optional[int] = None
    is_active: Optional[bool] = None
    is_completed: Optional[bool] = None
    notify_days_before: Optional[int] = None
    notify_miles_before: Optional[int] = None


class ReminderResponse(ReminderBase):
    id: int
    vehicle_id: int
    due_date: Optional[date] = None
    due_mileage: Optional[int] = None
    is_recurring: bool
    recurrence_interval_days: Optional[int] = None
    recurrence_interval_miles: Optional[int] = None
    is_active: bool
    is_completed: bool
    completed_at: Optional[datetime] = None
    notify_days_before: int
    notify_miles_before: int
    last_notified: Optional[datetime] = None
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True
