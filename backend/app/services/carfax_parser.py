"""Enhanced CARFAX PDF parser for extracting comprehensive vehicle and service data."""
import re
from datetime import datetime
from typing import List, Optional
from pypdf import PdfReader
from pydantic import BaseModel

from app.data.maintenance_schedule import get_service_key, SERVICE_TYPE_MAPPING


class DealerInfo(BaseModel):
    name: str
    location: Optional[str]
    phone: Optional[str]
    rating: Optional[float]
    reviews: Optional[int]


class ServiceRecord(BaseModel):
    date: str
    mileage: Optional[int]
    service_type: str
    description: str
    location: Optional[str]
    category: str  # maintenance, repair, inspection, recall
    dealer_name: Optional[str]
    dealer_rating: Optional[float]
    dealer_phone: Optional[str]
    service_items: List[str]  # Individual service items


class OwnershipInfo(BaseModel):
    owner_number: int
    year_purchased: Optional[int]
    owner_type: Optional[str]  # Personal, Commercial, etc.
    length_of_ownership: Optional[str]
    states: List[str]
    annual_miles: Optional[int]
    last_odometer: Optional[int]


class TitleInfo(BaseModel):
    damage_brands_clear: bool
    odometer_brands_clear: bool
    total_loss: bool
    structural_damage: bool
    airbag_deployed: bool
    odometer_rollback: bool
    accidents_reported: int
    recalls_reported: bool


class WarrantyInfo(BaseModel):
    basic_expired: bool
    drivetrain_expired: bool
    emissions_expired: bool
    corrosion_expired: bool


class CarfaxData(BaseModel):
    # Basic vehicle info
    vin: Optional[str]
    vehicle: Optional[str]
    year: Optional[int]
    make: Optional[str]
    model: Optional[str]
    trim: Optional[str]
    body_style: Optional[str]
    engine: Optional[str]
    fuel_type: Optional[str]
    drivetrain: Optional[str]

    # Value and history summary
    retail_value: Optional[int]
    report_date: Optional[str]
    total_records: int
    owners: Optional[int]
    accidents: int

    # Value factors
    no_accidents: bool
    single_owner: bool
    cpo_status: Optional[str]  # e.g., "Silver", "Gold", None
    has_service_history: bool
    personal_vehicle: bool

    # Detailed information
    ownership_info: Optional[OwnershipInfo]
    title_info: Optional[TitleInfo]
    warranty_info: Optional[WarrantyInfo]
    service_records: List[ServiceRecord]

    # CPO details
    cpo_warranty: Optional[str]
    cpo_inspection_points: Optional[int]


def extract_mileage(text: str) -> Optional[int]:
    """Extract mileage from text, handling various formats."""
    patterns = [
        r"(\d{1,3},?\d{3})\s*(?:miles?|mi\.?)",
        r"(?:^|\s)(\d{4,6})(?:\s|$)",
        r"(\d{1,3},\d{3})",
    ]

    for pattern in patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            mileage_str = match.group(1).replace(",", "")
            try:
                mileage = int(mileage_str)
                if 0 < mileage < 500000:
                    return mileage
            except ValueError:
                continue
    return None


def extract_retail_value(text: str) -> Optional[int]:
    """Extract CARFAX retail value."""
    patterns = [
        r"\$(\d{1,3},?\d{3})\s*(?:CARFAX\s+)?Retail\s+Value",
        r"CARFAX\s+Retail\s+Value[:\s]*\$(\d{1,3},?\d{3})",
        r"\$(\d{1,3},?\d{3})\s*\n\s*CARFAX\s+Retail",
    ]

    for pattern in patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            value_str = match.group(1).replace(",", "")
            try:
                return int(value_str)
            except ValueError:
                continue
    return None


def extract_vehicle_specs(text: str) -> dict:
    """Extract detailed vehicle specifications."""
    specs = {
        'year': None,
        'make': None,
        'model': None,
        'trim': None,
        'body_style': None,
        'engine': None,
        'fuel_type': None,
        'drivetrain': None,
    }

    # Year and model extraction
    vehicle_match = re.search(
        r"(\d{4})\s+(TOYOTA|Honda|Ford|Chevrolet|Nissan|BMW|Mercedes|Lexus|Acura)\s*\n?\s*([A-Z0-9]+(?:\s+[A-Z0-9]+)*)",
        text, re.IGNORECASE
    )
    if vehicle_match:
        specs['year'] = int(vehicle_match.group(1))
        specs['make'] = vehicle_match.group(2).title()
        model_trim = vehicle_match.group(3).strip()
        parts = model_trim.split()
        if parts:
            specs['model'] = parts[0]
            if len(parts) > 1:
                specs['trim'] = ' '.join(parts[1:])

    # Body style
    body_match = re.search(r"(\d)\s*DOOR\s+(WAGON|SEDAN|COUPE|SUV|TRUCK|VAN|SPORT\s*UTILITY)", text, re.IGNORECASE)
    if body_match:
        specs['body_style'] = f"{body_match.group(1)} Door {body_match.group(2).title()}"

    # Engine
    engine_match = re.search(r"(\d\.\d)L\s*(V\d+|I\d+|INLINE)?\s*[A-Z]*\s*(?:DOHC|SOHC)?\s*\d*V?", text, re.IGNORECASE)
    if engine_match:
        specs['engine'] = engine_match.group(0).strip()

    # Fuel type
    if re.search(r"\bGASOLINE\b", text, re.IGNORECASE):
        specs['fuel_type'] = "Gasoline"
    elif re.search(r"\bDIESEL\b", text, re.IGNORECASE):
        specs['fuel_type'] = "Diesel"
    elif re.search(r"\bHYBRID\b", text, re.IGNORECASE):
        specs['fuel_type'] = "Hybrid"
    elif re.search(r"\bELECTRIC\b", text, re.IGNORECASE):
        specs['fuel_type'] = "Electric"

    # Drivetrain
    if re.search(r"REAR\s+WHEEL\s+DRIVE\s+W/\s*4X4", text, re.IGNORECASE):
        specs['drivetrain'] = "4WD"
    elif re.search(r"ALL\s+WHEEL\s+DRIVE|AWD", text, re.IGNORECASE):
        specs['drivetrain'] = "AWD"
    elif re.search(r"FRONT\s+WHEEL\s+DRIVE|FWD", text, re.IGNORECASE):
        specs['drivetrain'] = "FWD"
    elif re.search(r"REAR\s+WHEEL\s+DRIVE|RWD", text, re.IGNORECASE):
        specs['drivetrain'] = "RWD"
    elif re.search(r"4X4|4WD", text, re.IGNORECASE):
        specs['drivetrain'] = "4WD"

    return specs


def extract_ownership_info(text: str) -> Optional[OwnershipInfo]:
    """Extract detailed ownership information."""
    # Annual miles
    annual_match = re.search(r"Estimated\s+miles\s+driven\s+per\s+year\s*(\d{1,3},?\d{0,3})/yr", text)
    annual_miles = int(annual_match.group(1).replace(",", "")) if annual_match else None

    # Last odometer
    odometer_match = re.search(r"Last\s+reported\s+odometer\s+reading\s*(\d{1,3},?\d{0,3})", text)
    last_odometer = int(odometer_match.group(1).replace(",", "")) if odometer_match else None

    # Also check for odometer in header
    if not last_odometer:
        odometer_match = re.search(r"(\d{1,3},?\d{3})\s*Last\s+reported\s+odometer", text)
        if odometer_match:
            last_odometer = int(odometer_match.group(1).replace(",", ""))

    # Year purchased
    year_match = re.search(r"Year\s+purchased\s*(\d{4})", text)
    year_purchased = int(year_match.group(1)) if year_match else None

    # Also check "Purchased: YYYY" format
    if not year_purchased:
        year_match = re.search(r"Purchased:\s*(\d{4})", text)
        year_purchased = int(year_match.group(1)) if year_match else None

    # Owner type
    owner_type = None
    if re.search(r"Personal\s+(?:Vehicle|vehicle)", text):
        owner_type = "Personal"
    elif re.search(r"Commercial\s+(?:Vehicle|vehicle)", text):
        owner_type = "Commercial"
    elif re.search(r"Rental\s+(?:Vehicle|vehicle)", text):
        owner_type = "Rental"
    elif re.search(r"Lease\s+(?:Vehicle|vehicle)", text):
        owner_type = "Lease"

    # Length of ownership
    length_match = re.search(r"Estimated\s+length\s+of\s+ownership\s*(\d+\s*yrs?\.?\s*\d*\s*mo?\.?)", text)
    length = length_match.group(1).strip() if length_match else None

    # States owned
    states = []
    state_match = re.search(r"Owned\s+in\s+the\s+following\s+states?/provinces?\s*([A-Za-z,\s]+)", text)
    if state_match:
        states = [s.strip() for s in state_match.group(1).split(',') if s.strip()]

    if not any([annual_miles, last_odometer, year_purchased, owner_type]):
        return None

    return OwnershipInfo(
        owner_number=1,
        year_purchased=year_purchased,
        owner_type=owner_type,
        length_of_ownership=length,
        states=states,
        annual_miles=annual_miles,
        last_odometer=last_odometer
    )


def extract_title_info(text: str) -> TitleInfo:
    """Extract title and history information."""
    # Check for various issues
    damage_clear = bool(re.search(r"Damage\s+Brands.*(?:Guaranteed|No\s+Problem)", text, re.IGNORECASE | re.DOTALL))
    odometer_clear = bool(re.search(r"Odometer\s+Brands.*(?:Guaranteed|No\s+Problem)", text, re.IGNORECASE | re.DOTALL))

    total_loss = not bool(re.search(r"No\s+total\s+loss\s+reported", text, re.IGNORECASE))
    structural = not bool(re.search(r"No\s+structural\s+damage\s+reported", text, re.IGNORECASE))
    airbag = not bool(re.search(r"No\s+airbag\s+deployment\s+reported", text, re.IGNORECASE))
    odometer_rollback = not bool(re.search(r"No\s+indication\s+of.*odometer\s+rollback", text, re.IGNORECASE))

    # Accidents
    accidents = 0
    if re.search(r"No\s+accidents?\s+(?:or\s+damage\s+)?reported", text, re.IGNORECASE):
        accidents = 0
    else:
        accident_match = re.search(r"(\d+)\s+accidents?\s+reported", text, re.IGNORECASE)
        if accident_match:
            accidents = int(accident_match.group(1))

    # Recalls
    recalls = bool(re.search(r"open\s+recalls?\s+reported", text, re.IGNORECASE))

    return TitleInfo(
        damage_brands_clear=damage_clear,
        odometer_brands_clear=odometer_clear,
        total_loss=total_loss,
        structural_damage=structural,
        airbag_deployed=airbag,
        odometer_rollback=odometer_rollback,
        accidents_reported=accidents,
        recalls_reported=recalls
    )


def extract_cpo_info(text: str) -> tuple[Optional[str], Optional[str], Optional[int]]:
    """Extract Certified Pre-Owned information."""
    cpo_status = None
    warranty = None
    inspection_points = None

    # Check for CPO status
    if re.search(r"Toyota\s+Certified\s+Pre-Owned\s*-?\s*Silver", text, re.IGNORECASE):
        cpo_status = "Silver"
    elif re.search(r"Toyota\s+Certified\s+Pre-Owned\s*-?\s*Gold", text, re.IGNORECASE):
        cpo_status = "Gold"
    elif re.search(r"Certified\s+Pre-Owned", text, re.IGNORECASE):
        cpo_status = "Standard"

    # Extract warranty details
    warranty_match = re.search(r"(\d+)-month/(\d+,?\d*)\s*mile.*(?:Warranty|warranty)", text)
    if warranty_match:
        months = warranty_match.group(1)
        miles = warranty_match.group(2).replace(",", "")
        warranty = f"{months} months / {miles} miles"

    # Inspection points
    inspection_match = re.search(r"(\d+)-Point.*(?:Inspection|inspection)", text)
    if inspection_match:
        inspection_points = int(inspection_match.group(1))

    return cpo_status, warranty, inspection_points


def categorize_service(description: str) -> tuple[str, str]:
    """Categorize service and extract service type from description."""
    desc_lower = description.lower()

    # First try to map using our maintenance schedule
    service_key = get_service_key(description)
    if service_key:
        from app.data.maintenance_schedule import get_maintenance_item
        item = get_maintenance_item(service_key)
        if item:
            return item["name"], "maintenance"

    # Service patterns with categories and display names
    service_patterns = {
        "maintenance": {
            r"oil\s*(?:&|and)?\s*filter": "Oil & Filter Change",
            r"oil\s+change": "Oil Change",
            r"lube\s*[,\s]*oil": "Oil & Filter Change",
            r"tire\s+rotation": "Tire Rotation",
            r"rotate\s+tires?": "Tire Rotation",
            r"balance\s+tires?": "Tire Balance",
            r"tires?\s+balanced": "Tire Balance",
            r"wheel\s+alignment": "Wheel Alignment",
            r"alignment\s+performed": "Wheel Alignment",
            r"air\s+filter\s+replaced": "Air Filter Replacement",
            r"air\s+filter\s+checked": "Air Filter Inspection",
            r"engine\s+filter": "Engine Air Filter",
            r"cabin\s+(?:air\s+)?filter": "Cabin Air Filter",
            r"hvac\s+filter": "Cabin Air Filter",
            r"brake\s+fluid": "Brake Fluid Service",
            r"transmission\s+(?:fluid|service)": "Transmission Service",
            r"transmission\s+fluid\s+flushed": "Transmission Flush",
            r"coolant\s+(?:flush|service)?": "Coolant Service",
            r"antifreeze": "Coolant Service",
            r"spark\s+plug": "Spark Plugs",
            r"battery\s+(?:replace|service|install)": "Battery Service",
            r"wiper\s+blade": "Wiper Blades",
            r"wipers?/washers?\s+checked": "Wiper Inspection",
            r"drive\s+belt": "Drive Belt",
            r"serpentine\s+belt": "Serpentine Belt",
            r"timing\s+belt": "Timing Belt",
            r"differential\s+(?:fluid|service)": "Differential Service",
            r"front\s+differential": "Front Differential Service",
            r"rear\s+differential": "Rear Differential Service",
            r"transfer\s+case": "Transfer Case Service",
            r"power\s+steering\s+fluid": "Power Steering Fluid",
            r"multi[- ]?point\s+inspection": "Multi-Point Inspection",
            r"maintenance\s+inspection": "Maintenance Inspection",
            r"scheduled\s+maintenance": "Scheduled Maintenance",
            r"factory\s+scheduled": "Factory Scheduled Maintenance",
            r"fluids?\s+checked": "Fluid Inspection",
            r"steering/suspension\s+lubricated": "Chassis Lubrication",
            r"pre[- ]?delivery\s+inspection": "Pre-Delivery Inspection",
            r"(\d+,?\d*)\s*mile\s+service": "Scheduled Service",
        },
        "repair": {
            r"tires?\s+replaced": "Tire Replacement",
            r"four\s+tires?\s+replaced": "Four Tires Replaced",
            r"brake\s+(?:pad|shoe)s?\s+(?:replace|install)": "Brake Pad Replacement",
            r"(?:front|rear)\s+brake\s+(?:pad|shoe)": "Brake Pad Replacement",
            r"rotor\s+(?:replace|resurface|machine)": "Rotor Service",
            r"brake\s+repair": "Brake Repair",
            r"brakes?\s+checked": "Brake Inspection",
            r"alternator": "Alternator Replacement",
            r"starter\s+(?:motor|replace)": "Starter Replacement",
            r"water\s+pump": "Water Pump Replacement",
            r"thermostat": "Thermostat Replacement",
            r"radiator\s+(?:replace|repair)": "Radiator Service",
            r"a/?c\s+(?:service|repair|recharge)": "A/C Service",
            r"air\s+conditioning": "A/C Service",
            r"suspension\s+(?:repair|service)": "Suspension Repair",
            r"shock\s+(?:absorber)?s?": "Shock Absorber Replacement",
            r"strut": "Strut Replacement",
            r"cv\s+(?:joint|axle|boot)": "CV Joint/Axle Service",
            r"exhaust\s+(?:repair|replace)": "Exhaust Repair",
            r"muffler": "Muffler Replacement",
            r"catalytic\s+converter": "Catalytic Converter",
        },
        "inspection": {
            r"(?:safety|state)\s+inspection": "Safety Inspection",
            r"emissions?\s+(?:test|inspection)": "Emissions Inspection",
            r"smog\s+(?:check|test)": "Smog Check",
            r"vehicle\s+inspection": "Vehicle Inspection",
            r"pre[- ]?purchase\s+inspection": "Pre-Purchase Inspection",
            r"inspection\s+performed": "Vehicle Inspection",
            r"airbag\s+system\s+checked": "Airbag System Check",
            r"tire\s+condition.*checked": "Tire Inspection",
        },
        "recall": {
            r"recall\s+(?:repair|service|performed)": "Recall Service",
            r"safety\s+recall": "Safety Recall",
            r"manufacturer\s+recall": "Manufacturer Recall",
            r"campaign": "Recall Campaign",
        }
    }

    for category, patterns in service_patterns.items():
        for pattern, service_name in patterns.items():
            if re.search(pattern, desc_lower):
                return service_name, category

    if any(word in desc_lower for word in ["replace", "repair", "fix", "broken"]):
        return "Repair Service", "repair"
    elif any(word in desc_lower for word in ["inspect", "check", "test"]):
        return "Inspection", "inspection"

    return "Service", "maintenance"


def extract_dealer_info(text_block: str) -> Optional[DealerInfo]:
    """Extract dealer information from a service record text block."""
    # Look for dealer name with location and rating
    dealer_match = re.search(
        r"([A-Z][A-Za-z\s&']+(?:Toyota|Honda|Ford|Motors?|Auto|Service))\s*\n\s*"
        r"([A-Za-z\s]+,\s*[A-Z]{2})\s*\n\s*"
        r"([\d-]+)\s*\n\s*"
        r"(\d\.\d)\s*/\s*5\.0",
        text_block
    )

    if dealer_match:
        # Extract review count
        reviews_match = re.search(r"(\d+)\s*Verified\s*Reviews?", text_block)
        reviews = int(reviews_match.group(1)) if reviews_match else None

        return DealerInfo(
            name=dealer_match.group(1).strip(),
            location=dealer_match.group(2).strip(),
            phone=dealer_match.group(3).strip(),
            rating=float(dealer_match.group(4)),
            reviews=reviews
        )

    return None


def extract_service_items(description: str) -> List[str]:
    """Extract individual service items from a description."""
    items = []

    # Split by common delimiters
    parts = re.split(r'\s*[-•]\s*|\n', description)

    for part in parts:
        part = part.strip()
        if len(part) > 3 and not part.startswith('Vehicle serviced'):
            # Clean up the item
            part = re.sub(r'^\s*[-•]\s*', '', part)
            if part:
                items.append(part)

    return items


def extract_service_records(text: str) -> List[ServiceRecord]:
    """Extract service records from CARFAX text with enhanced dealer info."""
    records = []

    # Split text into service record blocks
    # Look for date patterns followed by service details
    record_pattern = r"(\d{1,2}/\d{1,2}/\d{4})\s+(\d{1,3},?\d{0,3})?\s*(.+?)(?=\d{1,2}/\d{1,2}/\d{4}|Have Questions|Glossary|$)"

    matches = re.findall(record_pattern, text, re.DOTALL)

    seen_entries = set()

    for match in matches:
        date_str, mileage_str, details = match

        # Skip duplicate entries
        entry_key = (date_str, mileage_str)
        if entry_key in seen_entries:
            continue
        seen_entries.add(entry_key)

        # Clean mileage
        mileage = None
        if mileage_str:
            mileage = int(mileage_str.replace(",", ""))

        # Skip non-service entries (title registrations, etc.)
        if any(skip in details.lower() for skip in [
            'title or registration issued',
            'title issued or updated',
            'registration issued or renewed',
            'loan or lien',
            'vehicle color noted',
            'vehicle purchase reported',
            'vehicle manufactured',
            'vehicle sold',
        ]):
            continue

        # Extract dealer info
        dealer = extract_dealer_info(details)

        # Extract service items
        service_items = extract_service_items(details)

        # Clean description
        description = " ".join(details.split())
        description = re.sub(r"\s+", " ", description)

        if len(description) < 10:
            continue

        # Get service type and category
        service_type, category = categorize_service(description)

        # Create location string
        location = None
        if dealer:
            location = f"{dealer.name}, {dealer.location}" if dealer.location else dealer.name

        if len(description) > 500:
            description = description[:497] + "..."

        records.append(ServiceRecord(
            date=date_str,
            mileage=mileage,
            service_type=service_type[:200],
            description=description,
            location=location,
            category=category,
            dealer_name=dealer.name if dealer else None,
            dealer_rating=dealer.rating if dealer else None,
            dealer_phone=dealer.phone if dealer else None,
            service_items=service_items
        ))

    # Sort by date (newest first)
    records.sort(key=lambda r: (
        datetime.strptime(r.date, "%m/%d/%Y") if "/" in r.date else datetime.min,
        r.mileage or 0
    ), reverse=True)

    return records


def parse_carfax_pdf(file_path: str) -> CarfaxData:
    """Parse a CARFAX PDF and extract comprehensive vehicle and service data."""
    reader = PdfReader(file_path)

    full_text = ""
    for page in reader.pages:
        page_text = page.extract_text()
        if page_text:
            full_text += page_text + "\n"

    # Extract VIN
    vin_match = re.search(r"VIN[:\s]*([A-HJ-NPR-Z0-9]{17})", full_text, re.IGNORECASE)
    vin = vin_match.group(1) if vin_match else None

    # Extract vehicle specs
    specs = extract_vehicle_specs(full_text)

    # Build vehicle name
    vehicle = None
    if specs['year'] and specs['make'] and specs['model']:
        vehicle = f"{specs['year']} {specs['make']} {specs['model']}"
        if specs['trim']:
            vehicle += f" {specs['trim']}"

    # Extract retail value
    retail_value = extract_retail_value(full_text)

    # Extract report date
    date_match = re.search(r"(\d{1,2}/\d{1,2}/\d{2,4})\s+\d{1,2}:\d{2}:\d{2}\s*(?:AM|PM)", full_text)
    report_date = date_match.group(1) if date_match else None

    # Extract owner count
    owner_match = re.search(r"(\d+)\s*-?\s*(?:owner|Owner)", full_text)
    owners = int(owner_match.group(1)) if owner_match else None

    # Also check "CARFAX 1-Owner"
    if not owners:
        if re.search(r"CARFAX\s+1-Owner", full_text):
            owners = 1

    # Extract ownership info
    ownership_info = extract_ownership_info(full_text)

    # Extract title info
    title_info = extract_title_info(full_text)

    # Extract CPO info
    cpo_status, cpo_warranty, cpo_inspection = extract_cpo_info(full_text)

    # Value factors
    no_accidents = bool(re.search(r"No\s+(?:accidents?|damage)\s+(?:reported|found)", full_text, re.IGNORECASE))
    single_owner = owners == 1 if owners else False
    has_service = bool(re.search(r"Service\s+History", full_text, re.IGNORECASE))
    personal = bool(re.search(r"Personal\s+(?:vehicle|Vehicle)", full_text, re.IGNORECASE))

    # Extract service records
    service_records = extract_service_records(full_text)

    # Create warranty info
    warranty_info = WarrantyInfo(
        basic_expired=bool(re.search(r"Basic.*Coverage\s+Expired", full_text, re.IGNORECASE | re.DOTALL)),
        drivetrain_expired=bool(re.search(r"Drivetrain.*Coverage\s+Expired", full_text, re.IGNORECASE | re.DOTALL)),
        emissions_expired=bool(re.search(r"Emissions.*Coverage\s+Expired", full_text, re.IGNORECASE | re.DOTALL)),
        corrosion_expired=bool(re.search(r"Corrosion.*Coverage\s+Expired", full_text, re.IGNORECASE | re.DOTALL)),
    )

    return CarfaxData(
        vin=vin,
        vehicle=vehicle,
        year=specs['year'],
        make=specs['make'],
        model=specs['model'],
        trim=specs['trim'],
        body_style=specs['body_style'],
        engine=specs['engine'],
        fuel_type=specs['fuel_type'],
        drivetrain=specs['drivetrain'],
        retail_value=retail_value,
        report_date=report_date,
        total_records=len(service_records),
        owners=owners,
        accidents=title_info.accidents_reported,
        no_accidents=no_accidents,
        single_owner=single_owner,
        cpo_status=cpo_status,
        has_service_history=has_service,
        personal_vehicle=personal,
        ownership_info=ownership_info,
        title_info=title_info,
        warranty_info=warranty_info,
        service_records=service_records,
        cpo_warranty=cpo_warranty,
        cpo_inspection_points=cpo_inspection
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
            "location": record.location,
            "dealer_name": record.dealer_name,
            "dealer_rating": record.dealer_rating,
            "dealer_phone": record.dealer_phone,
            "service_items": record.service_items
        })

    return maintenance_records
