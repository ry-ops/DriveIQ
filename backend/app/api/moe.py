"""MoE (Mixture of Experts) API endpoints with topic-filtered retrieval."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import text
from pydantic import BaseModel
from typing import Optional, List

from app.core.database import get_db
from app.core.config import settings
from app.core.security import get_current_user
from app.services.moe_system import moe_system
from app.services.embeddings import generate_embedding
from app.services.query_router import classify_query, get_expert_topics

router = APIRouter()


class MoEQuery(BaseModel):
    query: str


class FeedbackRequest(BaseModel):
    response_id: str
    helpful: bool
    comment: Optional[str] = None


@router.post("/ask")
async def moe_ask(
    request: MoEQuery,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """Ask a question using the MoE system with topic-filtered retrieval."""
    if not settings.ANTHROPIC_API_KEY:
        raise HTTPException(status_code=500, detail="Anthropic API key not configured")

    # Check for documents
    doc_count = db.execute(text("SELECT COUNT(*) FROM document_chunks")).scalar()
    if doc_count == 0:
        raise HTTPException(
            status_code=404,
            detail="No documents ingested. Upload documents and run ingestion first."
        )

    # Classify query and get relevant topics
    query_type = classify_query(request.query)
    expert_topics = get_expert_topics(query_type)

    # Generate embedding locally
    query_embedding = generate_embedding(request.query)
    embedding_str = "[" + ",".join(str(x) for x in query_embedding) + "]"
    topics_array = "{" + ",".join(f'"{t}"' for t in expert_topics) + "}"

    # First try topic-filtered retrieval
    results = db.execute(
        text("""
        SELECT content, document_name, page_number, chapter, section, topics
        FROM document_chunks
        WHERE topics && :topics::text[]
        ORDER BY embedding <=> CAST(:embedding AS vector)
        LIMIT 5
        """),
        {"embedding": embedding_str, "topics": topics_array}
    ).fetchall()

    # If no topic-filtered results, fall back to general retrieval
    if not results:
        results = db.execute(
            text("""
            SELECT content, document_name, page_number, chapter, section, topics
            FROM document_chunks
            ORDER BY embedding <=> CAST(:embedding AS vector)
            LIMIT 5
            """),
            {"embedding": embedding_str}
        ).fetchall()

    # Build context with chapter/section info
    context_parts = []
    for r in results:
        source_info = f"[{r.document_name}, Page {r.page_number}"
        if r.chapter:
            source_info += f", {r.chapter}"
        if r.section:
            source_info += f" - {r.section}"
        source_info += "]"
        context_parts.append(f"{source_info}\n{r.content}")

    context = "\n\n".join(context_parts)

    if not context:
        return {
            "response_id": "no_context",
            "answer": "No relevant documentation found. Please upload and ingest your vehicle documents.",
            "expert_type": "general",
            "sources": [],
            "model": "claude-sonnet-4-20250514"
        }

    # Get response from MoE system
    response = moe_system.get_expert_response(request.query, context)

    # Add detailed sources with chapter/section citations
    response["sources"] = [
        {
            "document": r.document_name,
            "page": r.page_number,
            "chapter": r.chapter,
            "section": r.section,
            "topics": r.topics if r.topics else []
        }
        for r in results
    ]

    return response


@router.post("/feedback")
async def submit_feedback(
    request: FeedbackRequest,
    current_user: dict = Depends(get_current_user)
):
    """Submit feedback for a MoE response."""
    moe_system.record_feedback(
        request.response_id,
        request.helpful,
        request.comment
    )

    return {"message": "Feedback recorded successfully"}


@router.get("/stats")
async def get_moe_stats(
    current_user: dict = Depends(get_current_user)
):
    """Get MoE system performance statistics."""
    return moe_system.get_performance_stats()


@router.get("/experts")
async def list_experts():
    """List available experts and their specializations."""
    return {
        "experts": [
            {
                "type": "maintenance",
                "name": "Maintenance Expert",
                "description": "Specializes in service intervals, fluid specifications, and routine maintenance"
            },
            {
                "type": "technical",
                "name": "Technical Expert",
                "description": "Handles engine specs, towing capacity, electrical systems, and troubleshooting"
            },
            {
                "type": "safety",
                "name": "Safety Expert",
                "description": "Focuses on safety features, warnings, recalls, and emergency procedures"
            },
            {
                "type": "general",
                "name": "General Assistant",
                "description": "Handles general vehicle questions and information"
            }
        ]
    }
