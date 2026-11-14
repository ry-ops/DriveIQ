"""Smart reminder generator based on maintenance schedule and service history."""
from datetime import datetime, timedelta
from typing import List, Dict, Optional
from sqlalchemy.orm import Session
from sqlalchemy import text

from app.data.maintenance_schedule import (
    MAINTENANCE_SCHEDULE,
    get_service_key,
    get_maintenance_item
)


def get_last_service_for_type(db: Session, service_key: str) -> Optional[Dict]:
    """Get the last service record for a maintenance type."""
    # Map schedule keys to likely service descriptions
    search_terms = {
        "oil_change": ["oil", "lube"],
        "tire_rotation": ["tire", "rotation"],
        "air_filter": ["air filter", "engine filter"],
        "cabin_filter": ["cabin", "hvac"],
        "brake_fluid": ["brake fluid"],
        "transmission_fluid": ["transmission"],
        "coolant": ["coolant", "antifreeze"],
        "spark_plugs": ["spark plug"],
        "differential_fluid_front": ["front differential"],
        "differential_fluid_rear": ["rear differential", "differential"],
        "transfer_case_fluid": ["transfer case"],
        "brake_pads_front": ["front brake", "brake pad"],
        "brake_pads_rear": ["rear brake"],
        "battery": ["battery"],
        "wiper_blades": ["wiper"],
        "drive_belt": ["belt", "serpentine"]
    }

    terms = search_terms.get(service_key, [service_key.replace("_", " ")])

    # Build search conditions for each table
    conditions_logs = " OR ".join([f"LOWER(service_type) LIKE '%{term}%'" for term in terms])
    conditions_records = " OR ".join([f"LOWER(maintenance_type) LIKE '%{term}%'" for term in terms])

    result = db.execute(
        text(f"""
        SELECT date, mileage, service_type FROM (
            SELECT date, mileage, service_type
            FROM maintenance_logs
            WHERE {conditions_logs}
            UNION ALL
            SELECT date_performed AS date, mileage, maintenance_type AS service_type
            FROM maintenance_records
            WHERE {conditions_records}
        ) combined
        ORDER BY COALESCE(mileage, 0) DESC, date DESC
        LIMIT 1
        """)
    ).fetchone()

    if result:
        return {
            "date": result.date,
            "mileage": result.mileage,
            "service_type": result.service_type
        }
    return None


def calculate_next_service(
    last_service: Optional[Dict],
    schedule_item: Dict,
    current_mileage: int,
    purchase_date: Optional[datetime] = None
) -> Dict:
    """Calculate when the next service is due."""
    interval_miles = schedule_item["interval_miles"]
    interval_months = schedule_item["interval_months"]

    if last_service and last_service.get("mileage"):
        # Calculate based on last service
        last_mileage = last_service["mileage"]
        last_date = last_service["date"]

        next_mileage = last_mileage + interval_miles
        next_date = last_date + timedelta(days=interval_months * 30)

        miles_remaining = next_mileage - current_mileage
        days_remaining = (next_date - datetime.now().date()).days

        # Determine which comes first
        if miles_remaining <= 0 or days_remaining <= 0:
            status = "overdue"
        elif miles_remaining <= interval_miles * 0.1 or days_remaining <= 30:
            status = "due_soon"
        else:
            status = "ok"

        return {
            "next_mileage": next_mileage,
            "next_date": next_date.isoformat() if hasattr(next_date, 'isoformat') else str(next_date),
            "miles_remaining": max(0, miles_remaining),
            "days_remaining": max(0, days_remaining),
            "status": status,
            "last_service": last_service
        }
    else:
        # No service history - estimate based on current mileage
        # Assume service should have been done at standard intervals
        services_due = current_mileage // interval_miles
        next_mileage = (services_due + 1) * interval_miles

        miles_remaining = next_mileage - current_mileage

        if miles_remaining <= 0:
            status = "overdue"
        elif miles_remaining <= interval_miles * 0.1:
            status = "due_soon"
        else:
            status = "ok"

        return {
            "next_mileage": next_mileage,
            "next_date": None,
            "miles_remaining": max(0, miles_remaining),
            "days_remaining": None,
            "status": status,
            "last_service": None
        }


def generate_smart_reminders(db: Session, current_mileage: int) -> List[Dict]:
    """Generate smart reminders based on maintenance schedule and service history."""
    reminders = []

    for service_key, schedule_item in MAINTENANCE_SCHEDULE.items():
        # Get last service for this type
        last_service = get_last_service_for_type(db, service_key)

        # Calculate next service
        next_service = calculate_next_service(
            last_service,
            schedule_item,
            current_mileage
        )

        reminder = {
            "service_key": service_key,
            "name": schedule_item["name"],
            "description": schedule_item["description"],
            "interval_miles": schedule_item["interval_miles"],
            "interval_months": schedule_item["interval_months"],
            "priority": schedule_item["priority"],
            "estimated_cost": schedule_item["estimated_cost"],
            **next_service
        }

        reminders.append(reminder)

    # Sort by urgency: overdue first, then due_soon, then by miles_remaining
    status_order = {"overdue": 0, "due_soon": 1, "ok": 2}
    reminders.sort(key=lambda x: (status_order.get(x["status"], 3), x["miles_remaining"] or 999999))

    return reminders


def create_reminder_from_schedule(
    db: Session,
    vehicle_id: int,
    service_key: str,
    current_mileage: int
) -> Dict:
    """Create a reminder in the database for a scheduled service."""
    schedule_item = get_maintenance_item(service_key)
    if not schedule_item:
        raise ValueError(f"Unknown service key: {service_key}")

    last_service = get_last_service_for_type(db, service_key)
    next_service = calculate_next_service(last_service, schedule_item, current_mileage)

    # Calculate due date and mileage
    due_mileage = next_service["next_mileage"]
    due_date = None
    if next_service["next_date"]:
        due_date = datetime.fromisoformat(next_service["next_date"]).date()
    else:
        # Estimate based on 1000 miles/month
        months_until = next_service["miles_remaining"] / 1000
        due_date = (datetime.now() + timedelta(days=months_until * 30)).date()

    # Insert reminder
    db.execute(
        text("""
        INSERT INTO reminders (
            vehicle_id, title, description, reminder_type,
            due_date, due_mileage, is_recurring,
            recurrence_interval_days, recurrence_interval_miles,
            notify_days_before, notify_miles_before
        ) VALUES (
            :vehicle_id, :title, :description, :reminder_type,
            :due_date, :due_mileage, :is_recurring,
            :recurrence_days, :recurrence_miles,
            :notify_days, :notify_miles
        )
        ON CONFLICT DO NOTHING
        """),
        {
            "vehicle_id": vehicle_id,
            "title": schedule_item["name"],
            "description": schedule_item["description"],
            "reminder_type": "maintenance",
            "due_date": due_date,
            "due_mileage": due_mileage,
            "is_recurring": True,
            "recurrence_days": schedule_item["interval_months"] * 30,
            "recurrence_miles": schedule_item["interval_miles"],
            "notify_days": 14,
            "notify_miles": 500
        }
    )
    db.commit()

    return {
        "service_key": service_key,
        "name": schedule_item["name"],
        "due_date": due_date.isoformat() if due_date else None,
        "due_mileage": due_mileage
    }


def auto_generate_all_reminders(db: Session, vehicle_id: int, current_mileage: int) -> List[Dict]:
    """Auto-generate reminders for all maintenance items."""
    created_reminders = []

    for service_key in MAINTENANCE_SCHEDULE.keys():
        try:
            reminder = create_reminder_from_schedule(db, vehicle_id, service_key, current_mileage)
            created_reminders.append(reminder)
        except Exception as e:
            print(f"Error creating reminder for {service_key}: {e}")
            continue

    return created_reminders
