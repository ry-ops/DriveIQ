"""Query router for classifying and routing queries to specialized experts."""
from enum import Enum
from typing import Tuple
import anthropic
from app.core.config import settings


class QueryType(str, Enum):
    MAINTENANCE = "maintenance"
    TECHNICAL = "technical"
    SAFETY = "safety"
    GENERAL = "general"


EXPERT_PROMPTS = {
    QueryType.MAINTENANCE: """You are DriveIQ's Maintenance Expert for a {year} {make} {model} {trim}.
Focus on:
- Service intervals and schedules
- Fluid capacities and specifications
- Filter replacements
- Routine maintenance procedures
- Cost estimates for common services
Be practical and include mileage-based recommendations.""",

    QueryType.TECHNICAL: """You are DriveIQ's Technical Expert for a {year} {make} {model} {trim}.
Focus on:
- Engine and drivetrain specifications
- Electrical systems and components
- Towing capacity and payload
- Performance characteristics
- Technical troubleshooting
Provide precise technical details and specifications.""",

    QueryType.SAFETY: """You are DriveIQ's Safety Expert for a {year} {make} {model} {trim}.
Focus on:
- Safety features and systems
- Warning lights and indicators
- Emergency procedures
- Recall information
- Child safety and restraints
Prioritize safety above all else. Be clear and direct about safety concerns.""",

    QueryType.GENERAL: """You are DriveIQ, an intelligent assistant for a {year} {make} {model} {trim}.
VIN: {vin}
Answer questions about the vehicle based on the provided documentation.
Be concise, practical, and helpful."""
}


def classify_query(query: str) -> QueryType:
    """Classify a query into a category using keyword matching."""
    query_lower = query.lower()

    # Safety keywords
    safety_keywords = [
        "safety", "warning", "airbag", "brake", "abs", "traction", "stability",
        "recall", "emergency", "child seat", "seatbelt", "crash", "accident",
        "hazard", "danger", "caution"
    ]

    # Maintenance keywords
    maintenance_keywords = [
        "oil", "filter", "change", "service", "maintenance", "schedule",
        "interval", "fluid", "replace", "tire", "rotation", "brake pad",
        "transmission fluid", "coolant", "spark plug", "battery", "wiper"
    ]

    # Technical keywords
    technical_keywords = [
        "spec", "capacity", "towing", "payload", "engine", "horsepower",
        "torque", "mpg", "fuel", "transmission", "4wd", "awd", "differential",
        "suspension", "electrical", "fuse", "relay", "sensor", "diagnostic"
    ]

    # Count keyword matches
    safety_count = sum(1 for kw in safety_keywords if kw in query_lower)
    maintenance_count = sum(1 for kw in maintenance_keywords if kw in query_lower)
    technical_count = sum(1 for kw in technical_keywords if kw in query_lower)

    # Determine query type based on highest match count
    if safety_count > 0 and safety_count >= max(maintenance_count, technical_count):
        return QueryType.SAFETY
    elif maintenance_count > 0 and maintenance_count >= technical_count:
        return QueryType.MAINTENANCE
    elif technical_count > 0:
        return QueryType.TECHNICAL
    else:
        return QueryType.GENERAL


def get_expert_prompt(query_type: QueryType) -> str:
    """Get the specialized prompt for a query type."""
    prompt_template = EXPERT_PROMPTS.get(query_type, EXPERT_PROMPTS[QueryType.GENERAL])

    return prompt_template.format(
        year=settings.VEHICLE_YEAR,
        make=settings.VEHICLE_MAKE,
        model=settings.VEHICLE_MODEL,
        trim=settings.VEHICLE_TRIM,
        vin=settings.VEHICLE_VIN
    )


def route_query(query: str) -> Tuple[QueryType, str]:
    """Route a query to the appropriate expert and return the specialized prompt."""
    query_type = classify_query(query)
    expert_prompt = get_expert_prompt(query_type)
    return query_type, expert_prompt


async def ask_expert(query: str, context: str) -> dict:
    """Ask a question using the appropriate expert with Claude AI."""
    if not settings.ANTHROPIC_API_KEY:
        raise ValueError("Anthropic API key not configured")

    query_type, system_prompt = route_query(query)

    client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)

    message = client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=600,
        system=system_prompt,
        messages=[
            {
                "role": "user",
                "content": f"""Context from vehicle documentation:
{context}

Question: {query}"""
            }
        ]
    )

    return {
        "answer": message.content[0].text,
        "expert_type": query_type.value,
        "model": "claude-sonnet-4-20250514"
    }
