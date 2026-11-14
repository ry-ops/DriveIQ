from sqlalchemy import Column, Integer, String, Date, Float, DateTime
from sqlalchemy.sql import func
from app.core.database import Base


class Vehicle(Base):
    __tablename__ = "vehicles"

    id = Column(Integer, primary_key=True, index=True)
    vin = Column(String(17), unique=True, index=True, nullable=False)
    year = Column(Integer, nullable=False)
    make = Column(String(50), nullable=False)
    model = Column(String(50), nullable=False)
    trim = Column(String(100))
    engine = Column(String(100))
    transmission = Column(String(100))
    drivetrain = Column(String(50))
    color_exterior = Column(String(50))
    color_interior = Column(String(50))
    purchase_date = Column(Date)
    purchase_mileage = Column(Integer)
    current_mileage = Column(Integer)
    last_mileage_update = Column(DateTime(timezone=True))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
