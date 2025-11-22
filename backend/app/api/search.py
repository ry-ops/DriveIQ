"""Search API with Claude AI for reasoning and local embeddings."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import List
from pydantic import BaseModel
import anthropic

from app.core.database import get_db
from app.core.config import settings
from app.services.embeddings import generate_embedding

router = APIRouter()

class SearchQuery(BaseModel):
    query: str
    limit: int = 5

class SearchResult(BaseModel):
    content: str
    document_name: str
    page_number: int | None
    score: float

@router.post("/", response_model=List[SearchResult])
async def search_documents(search: SearchQuery, db: Session = Depends(get_db)):
    """Search vehicle documentation using semantic search."""
    # Check for documents
    doc_count = db.execute(text("SELECT COUNT(*) FROM document_chunks")).scalar()
    if doc_count == 0:
        raise HTTPException(status_code=404, detail="No documents ingested yet")

    # Generate embedding locally
    query_embedding = generate_embedding(search.query)
    embedding_str = "[" + ",".join(str(x) for x in query_embedding) + "]"

    # Vector similarity search
    results = db.execute(
        text("""
        SELECT content, document_name, page_number, 1 - (embedding <=> :embedding::vector) as score
        FROM document_chunks
        ORDER BY embedding <=> :embedding::vector
        LIMIT :limit
        """),
        {"embedding": embedding_str, "limit": search.limit}
    ).fetchall()

    return [SearchResult(content=r.content, document_name=r.document_name,
                        page_number=r.page_number, score=float(r.score)) for r in results]

@router.post("/ask")
async def ask_question(search: SearchQuery, db: Session = Depends(get_db)):
    """Ask a question using Claude AI with RAG from vehicle documentation."""
    if not settings.ANTHROPIC_API_KEY:
        raise HTTPException(status_code=500, detail="Anthropic API key not configured")

    # Check for documents
    doc_count = db.execute(text("SELECT COUNT(*) FROM document_chunks")).scalar()
    if doc_count == 0:
        raise HTTPException(status_code=404, detail="No documents ingested. Upload documents and run ingestion first.")

    # Generate embedding locally
    query_embedding = generate_embedding(search.query)
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
            "answer": "No relevant documentation found. Please upload and ingest your vehicle documents.",
            "sources": [],
            "model": "claude-sonnet-4-20250514"
        }

    # Generate answer with Claude
    claude_client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)

    system_prompt = f"""You are DriveIQ, an intelligent assistant for vehicle owners powered by Claude AI.
You help answer questions about a {settings.VEHICLE_YEAR} {settings.VEHICLE_MAKE} {settings.VEHICLE_MODEL} {settings.VEHICLE_TRIM}.
VIN: {settings.VEHICLE_VIN}

Answer based on the provided documentation. Be concise, practical, and safety-focused.
If information isn't in the documentation, say so clearly."""

    message = claude_client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=600,
        system=system_prompt,
        messages=[
            {
                "role": "user",
                "content": f"""Context from vehicle documentation:
{context}

Question: {search.query}"""
            }
        ]
    )

    return {
        "answer": message.content[0].text,
        "sources": [{"document": r.document_name, "page": r.page_number} for r in results],
        "model": "claude-sonnet-4-20250514"
    }
