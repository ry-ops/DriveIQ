from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from datetime import datetime

from app.core.database import get_db
from app.models.reminder import Reminder
from app.models.maintenance import MaintenanceRecord
from app.models.vehicle import Vehicle
from app.schemas.reminder import ReminderCreate, ReminderUpdate, ReminderResponse
from app.services.reminder_generator import (
    generate_smart_reminders,
    create_reminder_from_schedule,
    auto_generate_all_reminders
)
from app.data.maintenance_schedule import get_all_maintenance_items

router = APIRouter()


@router.get("/smart")
def get_smart_reminders(
    current_mileage: int,
    db: Session = Depends(get_db)
):
    """Get smart reminders based on maintenance schedule and service history."""
    reminders = generate_smart_reminders(db, current_mileage)
    return reminders


@router.get("/schedule")
def get_maintenance_schedule():
    """Get the Toyota maintenance schedule."""
    schedule = get_all_maintenance_items()
    return [
        {
            "key": key,
            **item
        }
        for key, item in schedule.items()
    ]


@router.post("/auto-generate")
def auto_generate_reminders(
    vehicle_id: int,
    current_mileage: int,
    db: Session = Depends(get_db)
):
    """Auto-generate reminders for all maintenance items based on service history."""
    created = auto_generate_all_reminders(db, vehicle_id, current_mileage)
    return {
        "message": f"Created {len(created)} reminders",
        "reminders": created
    }


@router.post("/from-schedule")
def create_reminder_from_maintenance_schedule(
    vehicle_id: int,
    service_key: str,
    current_mileage: int,
    db: Session = Depends(get_db)
):
    """Create a reminder from a specific maintenance schedule item."""
    try:
        reminder = create_reminder_from_schedule(db, vehicle_id, service_key, current_mileage)
        return reminder
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("", response_model=List[ReminderResponse])
def get_reminders(
    active_only: bool = True,
    db: Session = Depends(get_db)
):
    """Get all reminders."""
    query = db.query(Reminder)
    if active_only:
        query = query.filter(Reminder.is_active == True, Reminder.is_completed == False)
    return query.order_by(Reminder.due_date.asc().nullsfirst()).all()


@router.get("/upcoming", response_model=List[ReminderResponse])
def get_upcoming_reminders(
    current_mileage: int = None,
    db: Session = Depends(get_db)
):
    """Get upcoming/due reminders based on current mileage."""
    from datetime import date, timedelta

    query = db.query(Reminder).filter(
        Reminder.is_active == True,
        Reminder.is_completed == False
    )

    reminders = query.all()
    upcoming = []

    today = date.today()
    for reminder in reminders:
        is_due = False

        # Check date-based reminders
        if reminder.due_date:
            days_until = (reminder.due_date - today).days
            if days_until <= reminder.notify_days_before:
                is_due = True

        # Check mileage-based reminders
        if reminder.due_mileage and current_mileage:
            miles_until = reminder.due_mileage - current_mileage
            if miles_until <= reminder.notify_miles_before:
                is_due = True

        if is_due:
            upcoming.append(reminder)

    return upcoming


@router.get("/{reminder_id}", response_model=ReminderResponse)
def get_reminder(reminder_id: int, db: Session = Depends(get_db)):
    """Get a specific reminder."""
    reminder = db.query(Reminder).filter(Reminder.id == reminder_id).first()
    if not reminder:
        raise HTTPException(status_code=404, detail="Reminder not found")
    return reminder


@router.post("", response_model=ReminderResponse)
def create_reminder(reminder: ReminderCreate, db: Session = Depends(get_db)):
    """Create a new reminder."""
    db_reminder = Reminder(**reminder.model_dump())
    db.add(db_reminder)
    db.commit()
    db.refresh(db_reminder)
    return db_reminder


@router.patch("/{reminder_id}", response_model=ReminderResponse)
def update_reminder(
    reminder_id: int,
    reminder: ReminderUpdate,
    db: Session = Depends(get_db)
):
    """Update a reminder."""
    db_reminder = db.query(Reminder).filter(Reminder.id == reminder_id).first()
    if not db_reminder:
        raise HTTPException(status_code=404, detail="Reminder not found")

    update_data = reminder.model_dump(exclude_unset=True)

    # Handle completion
    if update_data.get("is_completed"):
        update_data["completed_at"] = datetime.utcnow()

    for key, value in update_data.items():
        setattr(db_reminder, key, value)

    db.commit()
    db.refresh(db_reminder)
    return db_reminder


@router.post("/{reminder_id}/complete", response_model=ReminderResponse)
def complete_reminder(
    reminder_id: int,
    mileage: int = None,
    cost: float = None,
    service_provider: str = None,
    notes: str = None,
    db: Session = Depends(get_db)
):
    """Mark a reminder as complete and create a maintenance log entry."""
    from datetime import date, timedelta

    db_reminder = db.query(Reminder).filter(Reminder.id == reminder_id).first()
    if not db_reminder:
        raise HTTPException(status_code=404, detail="Reminder not found")

    # Get vehicle's current mileage if not provided
    if mileage is None:
        vehicle = db.query(Vehicle).filter(Vehicle.id == db_reminder.vehicle_id).first()
        mileage = vehicle.current_mileage if vehicle else db_reminder.due_mileage or 0

    # Create maintenance log entry
    maintenance_record = MaintenanceRecord(
        vehicle_id=db_reminder.vehicle_id,
        maintenance_type=db_reminder.title,
        description=db_reminder.description or f"Completed from reminder: {db_reminder.title}",
        date_performed=date.today(),
        mileage=mileage,
        cost=cost,
        service_provider=service_provider,
        notes=notes or "Created automatically from completed reminder"
    )
    db.add(maintenance_record)

    db_reminder.is_completed = True
    db_reminder.completed_at = datetime.utcnow()

    # If recurring, create next reminder
    if db_reminder.is_recurring:
        new_reminder = Reminder(
            vehicle_id=db_reminder.vehicle_id,
            title=db_reminder.title,
            description=db_reminder.description,
            reminder_type=db_reminder.reminder_type,
            is_recurring=True,
            recurrence_interval_days=db_reminder.recurrence_interval_days,
            recurrence_interval_miles=db_reminder.recurrence_interval_miles,
            notify_days_before=db_reminder.notify_days_before,
            notify_miles_before=db_reminder.notify_miles_before,
        )

        if db_reminder.recurrence_interval_days and db_reminder.due_date:
            new_reminder.due_date = db_reminder.due_date + timedelta(days=db_reminder.recurrence_interval_days)

        if db_reminder.recurrence_interval_miles:
            # Use current mileage for recurring mileage-based reminders
            new_reminder.due_mileage = mileage + db_reminder.recurrence_interval_miles

        db.add(new_reminder)

    db.commit()
    db.refresh(db_reminder)
    return db_reminder


@router.delete("/{reminder_id}")
def delete_reminder(reminder_id: int, db: Session = Depends(get_db)):
    """Delete a reminder."""
    db_reminder = db.query(Reminder).filter(Reminder.id == reminder_id).first()
    if not db_reminder:
        raise HTTPException(status_code=404, detail="Reminder not found")

    db.delete(db_reminder)
    db.commit()
    return {"message": "Reminder deleted"}
