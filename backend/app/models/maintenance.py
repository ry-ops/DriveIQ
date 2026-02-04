from sqlalchemy import Column, Integer, String, Date, Float, DateTime, Text, ForeignKey
from sqlalchemy.sql import func
from app.core.database import Base


class MaintenanceRecord(Base):
    __tablename__ = "maintenance_records"

    id = Column(Integer, primary_key=True, index=True)
    vehicle_id = Column(Integer, ForeignKey("vehicles.id"), nullable=False)

    # Maintenance details
    maintenance_type = Column(String(100), nullable=False)  # oil_change, tire_rotation, etc.
    description = Column(Text)
    date_performed = Column(Date, nullable=False)
    mileage = Column(Integer, nullable=False)

    # Cost tracking
    cost = Column(Float)
    parts_cost = Column(Float)
    labor_cost = Column(Float)

    # Service provider
    service_provider = Column(String(200))
    location = Column(String(200))

    # Parts and notes
    parts_used = Column(Text)  # JSON string for parts list
    notes = Column(Text)

    # Documents/receipts (JSON array of file paths)
    documents = Column(Text)  # JSON string for document paths

    # Photos (JSON array of photo objects with metadata)
    # Format: [{"filename": "...", "type": "before"|"after"|"general", "timestamp": "...", "caption": "..."}]
    photos = Column(Text)  # JSON string for photos

    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
