from sqlalchemy import Column, Integer, String, Date, DateTime, Boolean, Text, ForeignKey
from sqlalchemy.sql import func
from app.core.database import Base


class Reminder(Base):
    __tablename__ = "reminders"

    id = Column(Integer, primary_key=True, index=True)
    vehicle_id = Column(Integer, ForeignKey("vehicles.id"), nullable=False)

    # Reminder details
    title = Column(String(200), nullable=False)
    description = Column(Text)
    reminder_type = Column(String(50), nullable=False)  # mileage, date, both

    # Trigger conditions
    due_date = Column(Date)
    due_mileage = Column(Integer)

    # Recurrence
    is_recurring = Column(Boolean, default=False)
    recurrence_interval_days = Column(Integer)
    recurrence_interval_miles = Column(Integer)

    # Status
    is_active = Column(Boolean, default=True)
    is_completed = Column(Boolean, default=False)
    completed_at = Column(DateTime(timezone=True))

    # Notification
    notify_days_before = Column(Integer, default=7)
    notify_miles_before = Column(Integer, default=500)
    last_notified = Column(DateTime(timezone=True))

    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
