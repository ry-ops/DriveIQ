"""Chat API with conversational AI, smart RAG, and session-based history."""
import os
from urllib.parse import quote
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import List, Optional
from pydantic import BaseModel
import anthropic
import uuid

from app.core.database import get_db
from app.core.config import settings
from app.core.redis_client import chat_session_store
from app.services.enhanced_search import (
    smart_search, build_context_from_results,
    QueryIntent, SearchResult
)
from app.services.page_images import extract_key_terms

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

    # Determine model configuration
    if settings.USE_LOCAL_LLM:
        if not settings.ANTHROPIC_BASE_URL:
            raise HTTPException(
                status_code=500, detail="Local LLM enabled but ANTHROPIC_BASE_URL not configured"
            )
        model_name = settings.LOCAL_LLM_MODEL
    else:
        if not settings.ANTHROPIC_API_KEY:
            raise HTTPException(status_code=500, detail="Anthropic API key not configured")
        model_name = "claude-sonnet-4-20250514"

    # Get latest user message
    user_message = request.messages[-1].content

    # Smart search: Classify intent and only search when needed
    intent, rag_results = smart_search(user_message, db, limit=3)

    # Build context from search results
    context = build_context_from_results(rag_results)

    # Build Claude client
    if os.environ.get("ANTHROPIC_BASE_URL") == "":
        os.environ.pop("ANTHROPIC_BASE_URL", None)

    client_kwargs = {}
    if settings.USE_LOCAL_LLM:
        client_kwargs["base_url"] = settings.ANTHROPIC_BASE_URL
        client_kwargs["api_key"] = "local"
    else:
        client_kwargs["api_key"] = settings.ANTHROPIC_API_KEY
        if settings.ANTHROPIC_BASE_URL:
            client_kwargs["base_url"] = settings.ANTHROPIC_BASE_URL

    claude_client = anthropic.Anthropic(**client_kwargs)

    # Build system prompt based on intent
    base_prompt = f"""You are DriveIQ, an intelligent assistant for vehicle owners powered by AI.
You help answer questions about a {settings.VEHICLE_YEAR} {settings.VEHICLE_MAKE} {settings.VEHICLE_MODEL} {settings.VEHICLE_TRIM}.
VIN: {settings.VEHICLE_VIN}

Be conversational, helpful, and concise. Always prioritize safety for any vehicle-related advice."""

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

    # Call Claude with streaming (buffer internally, return complete)
    response_text = ""
    try:
        with claude_client.messages.stream(
            model=model_name,
            max_tokens=600,
            system=system_prompt,
            messages=claude_messages,
        ) as stream:
            for chunk in stream.text_stream:
                response_text += chunk
    except anthropic.APIError as e:
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
