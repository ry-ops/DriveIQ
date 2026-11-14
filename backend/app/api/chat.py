"""Chat API with conversational AI, smart RAG, and session-based history."""
from urllib.parse import quote
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional
from pydantic import BaseModel
import uuid

from app.core.database import get_db
from app.core.config import settings
from app.core.redis_client import chat_session_store
from app.core.llm_client import generate, get_model_name
from app.services.enhanced_search import (
    smart_search, build_context_from_results,
    QueryIntent, SearchResult
)
from app.services.page_images import extract_key_terms
from app.services.reminder_generator import generate_smart_reminders
from app.models.vehicle import Vehicle
from app.models.maintenance import MaintenanceRecord

router = APIRouter()


class ChatMessage(BaseModel):
    role: str  # "user" or "assistant"
    content: str


class ChatSource(BaseModel):
    document: str
    page: int
    chapter: Optional[str] = None
    section: Optional[str] = None
    relevance: float
    thumbnail_url: str
    fullsize_url: str
    highlighted_url: Optional[str] = None


class ChatRequest(BaseModel):
    messages: List[ChatMessage]
    session_id: Optional[str] = None


class ChatResponse(BaseModel):
    message: str
    sources: List[ChatSource]
    session_id: str
    model: str
    query_intent: str


@router.post("", response_model=ChatResponse)
async def chat(request: ChatRequest, db: Session = Depends(get_db)):
    """
    Conversational chat endpoint with smart RAG and session persistence.

    Features:
    - Query classification: Only searches manual for relevant questions
    - Hybrid search: Combines semantic + keyword matching
    - Relevance filtering: Only shows high-quality sources
    - Session memory: Maintains conversation history
    """
    # Validate request
    if not request.messages or not request.messages[-1].content.strip():
        raise HTTPException(status_code=400, detail="Message content is required")

    # Session handling - create new or use existing
    session_id = request.session_id or str(uuid.uuid4())

    # Get existing conversation history from Redis
    history = chat_session_store.get_history(session_id)

    # Determine model name
    model_name = get_model_name()

    # Get latest user message
    user_message = request.messages[-1].content

    # Smart search: Classify intent and only search when needed
    intent, rag_results = smart_search(user_message, db, limit=4)

    # Build context from search results
    context = build_context_from_results(rag_results)

    # Build system prompt based on intent
    base_prompt = f"""You are DriveIQ, an intelligent assistant for vehicle owners powered by AI.
You help answer questions about a {settings.VEHICLE_YEAR} {settings.VEHICLE_MAKE} {settings.VEHICLE_MODEL} {settings.VEHICLE_TRIM}.
VIN: {settings.VEHICLE_VIN}

Be conversational, helpful, and concise. Always prioritize safety for any vehicle-related advice."""

    # Inject maintenance context into system prompt
    try:
        vehicle = db.query(Vehicle).first()
        current_mileage = vehicle.current_mileage if vehicle else None

        if current_mileage:
            reminders = generate_smart_reminders(db, current_mileage)

            maintenance_lines = [f"\nCurrent Mileage: {current_mileage:,} miles\n\nMaintenance Status:"]
            for r in reminders:
                if r["status"] == "overdue":
                    maintenance_lines.append(
                        f"- OVERDUE: {r['name']} (was due at {r['next_mileage']:,} mi)"
                    )
                elif r["status"] == "due_soon":
                    maintenance_lines.append(
                        f"- DUE SOON: {r['name']} (next at {r['next_mileage']:,} mi, {r['miles_remaining']:,} mi remaining)"
                    )
                else:
                    maintenance_lines.append(
                        f"- OK: {r['name']} (next at {r['next_mileage']:,} mi, {r['miles_remaining']:,} mi remaining)"
                    )

            # Recent service history from maintenance_records
            recent_records = (
                db.query(MaintenanceRecord)
                .order_by(MaintenanceRecord.date_performed.desc())
                .limit(5)
                .all()
            )
            if recent_records:
                maintenance_lines.append("\nRecent Service History:")
                for rec in recent_records:
                    date_str = rec.date_performed.strftime("%b %d, %Y") if rec.date_performed else "Unknown"
                    maintenance_lines.append(
                        f"- {rec.maintenance_type} at {rec.mileage:,} mi on {date_str}"
                    )

            base_prompt += "\n" + "\n".join(maintenance_lines)
    except Exception:
        pass  # Don't let maintenance context errors break chat

    if intent == QueryIntent.CONVERSATIONAL:
        system_prompt = base_prompt + """

The user is having a casual conversation. Respond naturally and friendly.
You can mention you're here to help with vehicle questions if appropriate."""

    elif intent == QueryIntent.VEHICLE_GENERAL:
        system_prompt = base_prompt + """

The user is asking a general question about their vehicle. Answer based on what you know about their vehicle configuration."""

    elif intent == QueryIntent.VEHICLE_TECHNICAL and context:
        system_prompt = base_prompt + f"""

The user is asking a technical question. Use the following documentation to inform your answer.
If the documentation doesn't contain relevant information, say so and provide general guidance.

Relevant documentation:
{context}"""

    else:
        # Technical question but no relevant results found
        system_prompt = base_prompt + """

The user is asking about their vehicle. If you don't have specific documentation for this question,
provide general guidance and suggest they consult their owner's manual or a Toyota dealer."""

    # Build messages array: history + new user message
    claude_messages = []

    # Add conversation history
    for msg in history:
        claude_messages.append({"role": msg["role"], "content": msg["content"]})

    # Add new user message
    claude_messages.append({"role": "user", "content": user_message})

    # Call LLM (cloud or local)
    # Permanently cache vehicle questions, 30min for conversational
    cache_ttl = 0 if intent != QueryIntent.CONVERSATIONAL else 1800
    try:
        response_text = generate(
            system=system_prompt,
            messages=claude_messages,
            max_tokens=600,
            stream=not settings.USE_LOCAL_LLM,
            cache_ttl=cache_ttl,
        )
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"AI service error: {str(e)}")

    # Persist messages to session
    chat_session_store.append_message(session_id, "user", user_message)
    chat_session_store.append_message(session_id, "assistant", response_text)

    # Extract key terms for highlighting (only if we have sources)
    key_terms = extract_key_terms(response_text) if rag_results else []

    # Build sources with page image URLs (only for relevant results)
    sources = []
    for r in rag_results:
        terms_param = '&terms='.join(key_terms[:5]) if key_terms else ''
        encoded_doc = quote(r.document_name, safe='')
        source = ChatSource(
            document=r.document_name,
            page=r.page_number,
            chapter=r.chapter,
            section=r.section,
            relevance=round(r.combined_score, 2),
            thumbnail_url=f"/api/pages/{encoded_doc}/{r.page_number}/thumbnail",
            fullsize_url=f"/api/pages/{encoded_doc}/{r.page_number}/full",
            highlighted_url=f"/api/pages/{encoded_doc}/{r.page_number}/highlighted?terms={terms_param}" if key_terms else None
        )
        sources.append(source)

    return ChatResponse(
        message=response_text,
        sources=sources,
        session_id=session_id,
        model=model_name,
        query_intent=intent.value
    )


@router.delete("/{session_id}")
async def clear_chat(session_id: str):
    """Clear chat history for a session."""
    chat_session_store.clear_session(session_id)
    return {"status": "cleared", "session_id": session_id}
