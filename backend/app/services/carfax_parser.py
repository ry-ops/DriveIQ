"""CARFAX PDF parser for extracting service records."""
import re
from datetime import datetime
from typing import List, Optional
from pypdf import PdfReader
from pydantic import BaseModel


class ServiceRecord(BaseModel):
    date: str
    mileage: Optional[int]
    service_type: str
    description: str
    location: Optional[str]
    category: str  # maintenance, repair, inspection, recall


class CarfaxData(BaseModel):
    vin: Optional[str]
    vehicle: Optional[str]
    total_records: int
    service_records: List[ServiceRecord]
    owners: Optional[int]
    accidents: Optional[int]


def extract_service_records(text: str) -> List[ServiceRecord]:
    """Extract service records from CARFAX text."""
    records = []

    # Common service patterns
    service_patterns = {
        "maintenance": [
            r"oil\s+change", r"oil\s+and\s+filter", r"tire\s+rotation",
            r"air\s+filter", r"cabin\s+filter", r"brake\s+fluid",
            r"transmission\s+fluid", r"coolant", r"spark\s+plug",
            r"battery", r"wiper\s+blade", r"multi[- ]point\s+inspection"
        ],
        "repair": [
            r"repair", r"replace", r"fix", r"brake\s+pad", r"rotor",
            r"alternator", r"starter", r"water\s+pump", r"timing\s+belt"
        ],
        "inspection": [
            r"inspection", r"safety\s+check", r"emissions", r"smog"
        ],
        "recall": [
            r"recall", r"campaign", r"safety\s+recall"
        ]
    }

    # Pattern to match date and mileage entries
    entry_pattern = r"(\d{1,2}/\d{1,2}/\d{4})\s+(\d{1,3},?\d{0,3})?\s*(?:miles?)?\s*(.+?)(?=\d{1,2}/\d{1,2}/\d{4}|$)"

    matches = re.findall(entry_pattern, text, re.DOTALL | re.IGNORECASE)

    for match in matches:
        date_str, mileage_str, description = match

        # Clean up mileage
        mileage = None
        if mileage_str:
            mileage = int(mileage_str.replace(",", ""))

        # Clean up description
        description = " ".join(description.split())

        if not description or len(description) < 5:
            continue

        # Categorize the service
        category = "maintenance"
        service_type = "General Service"

        desc_lower = description.lower()

        for cat, patterns in service_patterns.items():
            for pattern in patterns:
                if re.search(pattern, desc_lower):
                    category = cat
                    # Extract service type from pattern
                    service_type = pattern.replace(r"\s+", " ").replace("\\", "")
                    service_type = service_type.title()
                    break
            else:
                continue
            break

        # Extract location if present
        location = None
        location_match = re.search(r"(?:at|@)\s+(.+?)(?:\s+\d|$)", description)
        if location_match:
            location = location_match.group(1).strip()

        records.append(ServiceRecord(
            date=date_str,
            mileage=mileage,
            service_type=service_type,
            description=description[:500],  # Limit description length
            location=location,
            category=category
        ))

    return records


def parse_carfax_pdf(file_path: str) -> CarfaxData:
    """Parse a CARFAX PDF and extract vehicle and service data."""
    reader = PdfReader(file_path)

    full_text = ""
    for page in reader.pages:
        full_text += page.extract_text() + "\n"

    # Extract VIN
    vin_match = re.search(r"VIN[:\s]+([A-HJ-NPR-Z0-9]{17})", full_text, re.IGNORECASE)
    vin = vin_match.group(1) if vin_match else None

    # Extract vehicle info
    vehicle_match = re.search(r"(\d{4})\s+([\w\s]+?)(?:\n|VIN)", full_text)
    vehicle = f"{vehicle_match.group(1)} {vehicle_match.group(2).strip()}" if vehicle_match else None

    # Extract owner count
    owner_match = re.search(r"(\d+)\s+(?:owner|Owner)", full_text)
    owners = int(owner_match.group(1)) if owner_match else None

    # Check for accidents
    accident_match = re.search(r"(\d+)\s+(?:accident|Accident)", full_text)
    accidents = int(accident_match.group(1)) if accident_match else 0

    # No accidents phrase
    if re.search(r"No\s+(?:accidents?|damage)", full_text, re.IGNORECASE):
        accidents = 0

    # Extract service records
    service_records = extract_service_records(full_text)

    return CarfaxData(
        vin=vin,
        vehicle=vehicle,
        total_records=len(service_records),
        service_records=service_records,
        owners=owners,
        accidents=accidents
    )


def convert_to_maintenance_records(carfax_data: CarfaxData) -> List[dict]:
    """Convert CARFAX service records to maintenance log format."""
    maintenance_records = []

    for record in carfax_data.service_records:
        # Parse date
        try:
            date_obj = datetime.strptime(record.date, "%m/%d/%Y")
            formatted_date = date_obj.strftime("%Y-%m-%d")
        except ValueError:
            formatted_date = record.date

        maintenance_records.append({
            "date": formatted_date,
            "mileage": record.mileage,
            "service_type": record.service_type,
            "description": record.description,
            "category": record.category,
            "source": "CARFAX",
            "location": record.location
        })

    return maintenance_records
