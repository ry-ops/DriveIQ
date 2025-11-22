"""MoE (Mixture of Experts) API endpoints."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import text
from pydantic import BaseModel
from typing import Optional

from app.core.database import get_db
from app.core.config import settings
from app.core.security import get_current_user
from app.services.moe_system import moe_system
from app.services.embeddings import generate_embedding

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
    """Ask a question using the MoE system with automatic expert routing."""
    if not settings.ANTHROPIC_API_KEY:
        raise HTTPException(status_code=500, detail="Anthropic API key not configured")

    # Check for documents
    doc_count = db.execute(text("SELECT COUNT(*) FROM document_chunks")).scalar()
    if doc_count == 0:
        raise HTTPException(
            status_code=404,
            detail="No documents ingested. Upload documents and run ingestion first."
        )

    # Generate embedding locally
    query_embedding = generate_embedding(request.query)
    embedding_str = "[" + ",".join(str(x) for x in query_embedding) + "]"

    # Retrieve relevant documents
    results = db.execute(
        text("""
        SELECT content, document_name, page_number
        FROM document_chunks
        ORDER BY embedding <=> :embedding::vector
        LIMIT 5
        """),
        {"embedding": embedding_str}
    ).fetchall()

    # Build context
    context = "\n\n".join([
        f"[{r.document_name}, Page {r.page_number}]\n{r.content}"
        for r in results
    ])

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

    # Add sources
    response["sources"] = [
        {"document": r.document_name, "page": r.page_number}
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
