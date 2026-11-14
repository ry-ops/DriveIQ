"""Toyota 4Runner maintenance schedule data."""

# Toyota 4Runner (2018) Maintenance Schedule
# Based on Toyota's official maintenance guide

MAINTENANCE_SCHEDULE = {
    "oil_change": {
        "name": "Oil & Filter Change",
        "interval_miles": 5000,
        "interval_months": 6,
        "description": "Replace engine oil and oil filter",
        "category": "maintenance",
        "priority": "high",
        "estimated_cost": 75
    },
    "tire_rotation": {
        "name": "Tire Rotation",
        "interval_miles": 5000,
        "interval_months": 6,
        "description": "Rotate tires to ensure even wear",
        "category": "maintenance",
        "priority": "medium",
        "estimated_cost": 40
    },
    "air_filter": {
        "name": "Engine Air Filter",
        "interval_miles": 30000,
        "interval_months": 36,
        "description": "Replace engine air filter element",
        "category": "maintenance",
        "priority": "medium",
        "estimated_cost": 45
    },
    "cabin_filter": {
        "name": "Cabin Air Filter",
        "interval_miles": 15000,
        "interval_months": 12,
        "description": "Replace cabin air filter for HVAC system",
        "category": "maintenance",
        "priority": "low",
        "estimated_cost": 35
    },
    "brake_fluid": {
        "name": "Brake Fluid",
        "interval_miles": 30000,
        "interval_months": 36,
        "description": "Inspect and replace brake fluid",
        "category": "maintenance",
        "priority": "high",
        "estimated_cost": 100
    },
    "transmission_fluid": {
        "name": "Transmission Fluid",
        "interval_miles": 60000,
        "interval_months": 72,
        "description": "Replace automatic transmission fluid",
        "category": "maintenance",
        "priority": "high",
        "estimated_cost": 200
    },
    "coolant": {
        "name": "Engine Coolant",
        "interval_miles": 100000,
        "interval_months": 120,
        "description": "Replace engine coolant (first at 100k, then every 50k)",
        "category": "maintenance",
        "priority": "medium",
        "estimated_cost": 150
    },
    "spark_plugs": {
        "name": "Spark Plugs",
        "interval_miles": 120000,
        "interval_months": 120,
        "description": "Replace spark plugs",
        "category": "maintenance",
        "priority": "medium",
        "estimated_cost": 250
    },
    "drive_belt": {
        "name": "Drive Belt",
        "interval_miles": 100000,
        "interval_months": 120,
        "description": "Inspect and replace drive belt",
        "category": "maintenance",
        "priority": "medium",
        "estimated_cost": 200
    },
    "differential_fluid_front": {
        "name": "Front Differential Fluid",
        "interval_miles": 30000,
        "interval_months": 36,
        "description": "Replace front differential fluid (4WD)",
        "category": "maintenance",
        "priority": "medium",
        "estimated_cost": 100
    },
    "differential_fluid_rear": {
        "name": "Rear Differential Fluid",
        "interval_miles": 30000,
        "interval_months": 36,
        "description": "Replace rear differential fluid",
        "category": "maintenance",
        "priority": "medium",
        "estimated_cost": 100
    },
    "transfer_case_fluid": {
        "name": "Transfer Case Fluid",
        "interval_miles": 30000,
        "interval_months": 36,
        "description": "Replace transfer case fluid (4WD)",
        "category": "maintenance",
        "priority": "medium",
        "estimated_cost": 100
    },
    "brake_pads_front": {
        "name": "Front Brake Pads",
        "interval_miles": 40000,
        "interval_months": 48,
        "description": "Inspect and replace front brake pads",
        "category": "maintenance",
        "priority": "high",
        "estimated_cost": 300
    },
    "brake_pads_rear": {
        "name": "Rear Brake Pads",
        "interval_miles": 50000,
        "interval_months": 60,
        "description": "Inspect and replace rear brake pads",
        "category": "maintenance",
        "priority": "high",
        "estimated_cost": 250
    },
    "battery": {
        "name": "Battery",
        "interval_miles": 50000,
        "interval_months": 48,
        "description": "Inspect and replace battery",
        "category": "maintenance",
        "priority": "medium",
        "estimated_cost": 200
    },
    "wiper_blades": {
        "name": "Wiper Blades",
        "interval_miles": 15000,
        "interval_months": 12,
        "description": "Replace windshield wiper blades",
        "category": "maintenance",
        "priority": "low",
        "estimated_cost": 40
    }
}

# Map CARFAX service types to maintenance schedule keys
SERVICE_TYPE_MAPPING = {
    # Oil changes
    "oil change": "oil_change",
    "oil and filter": "oil_change",
    "oil & filter": "oil_change",
    "engine oil": "oil_change",
    "lube oil filter": "oil_change",

    # Tire rotation
    "tire rotation": "tire_rotation",
    "rotate tires": "tire_rotation",
    "tire service": "tire_rotation",

    # Air filters
    "air filter": "air_filter",
    "engine air filter": "air_filter",
    "cabin filter": "cabin_filter",
    "cabin air filter": "cabin_filter",
    "hvac filter": "cabin_filter",

    # Fluids
    "brake fluid": "brake_fluid",
    "transmission fluid": "transmission_fluid",
    "transmission service": "transmission_fluid",
    "coolant": "coolant",
    "antifreeze": "coolant",
    "coolant flush": "coolant",

    # Differentials and transfer case
    "differential": "differential_fluid_rear",
    "front differential": "differential_fluid_front",
    "rear differential": "differential_fluid_rear",
    "transfer case": "transfer_case_fluid",

    # Brakes
    "brake pad": "brake_pads_front",
    "front brake": "brake_pads_front",
    "rear brake": "brake_pads_rear",
    "brake service": "brake_pads_front",

    # Spark plugs
    "spark plug": "spark_plugs",

    # Battery
    "battery": "battery",

    # Wipers
    "wiper": "wiper_blades",
    "wiper blade": "wiper_blades",

    # Belt
    "drive belt": "drive_belt",
    "serpentine belt": "drive_belt",
    "belt": "drive_belt"
}


def get_service_key(service_description: str) -> str | None:
    """Map a service description to a maintenance schedule key."""
    desc_lower = service_description.lower()

    for keyword, schedule_key in SERVICE_TYPE_MAPPING.items():
        if keyword in desc_lower:
            return schedule_key

    return None


def get_maintenance_item(key: str) -> dict | None:
    """Get maintenance schedule item by key."""
    return MAINTENANCE_SCHEDULE.get(key)


def get_all_maintenance_items() -> dict:
    """Get all maintenance schedule items."""
    return MAINTENANCE_SCHEDULE
