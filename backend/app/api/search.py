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
from app.services.page_images import extract_key_terms, sanitize_filename

router = APIRouter()

class SearchQuery(BaseModel):
    query: str
    limit: int = 5

class SearchResult(BaseModel):
    content: str
    document_name: str
    page_number: int | None
    chapter: str | None = None
    section: str | None = None
    topics: list | None = None
    score: float

@router.post("", response_model=List[SearchResult])
async def search_documents(search: SearchQuery, db: Session = Depends(get_db)):
    """Search vehicle documentation using semantic search."""
    # Check for documents
    doc_count = db.execute(text("SELECT COUNT(*) FROM document_chunks")).scalar()
    if doc_count == 0:
        raise HTTPException(status_code=404, detail="No documents ingested yet")

    # Generate embedding locally
    query_embedding = generate_embedding(search.query)
    embedding_str = "[" + ",".join(str(x) for x in query_embedding) + "]"

    # Vector similarity search with metadata
    results = db.execute(
        text("""
        SELECT content, document_name, page_number, chapter, section, topics,
               1 - (embedding <=> CAST(:embedding AS vector)) as score
        FROM document_chunks
        ORDER BY embedding <=> CAST(:embedding AS vector)
        LIMIT :limit
        """),
        {"embedding": embedding_str, "limit": search.limit}
    ).fetchall()

    return [SearchResult(
        content=r.content,
        document_name=r.document_name,
        page_number=r.page_number,
        chapter=r.chapter,
        section=r.section,
        topics=r.topics if r.topics else [],
        score=float(r.score)
    ) for r in results]

@router.post("/ask")
async def ask_question(search: SearchQuery, db: Session = Depends(get_db)):
    """Ask a question using Claude AI (cloud or local) with RAG from vehicle documentation."""
    # Check API configuration and determine model
    if settings.USE_LOCAL_LLM:
        if not settings.ANTHROPIC_BASE_URL:
            raise HTTPException(status_code=500, detail="Local LLM enabled but ANTHROPIC_BASE_URL not configured")
        model_name = settings.LOCAL_LLM_MODEL
    else:
        if not settings.ANTHROPIC_API_KEY:
            raise HTTPException(status_code=500, detail="Anthropic API key not configured")
        model_name = "claude-sonnet-4-20250514"

    # Check for documents
    doc_count = db.execute(text("SELECT COUNT(*) FROM document_chunks")).scalar()
    if doc_count == 0:
        raise HTTPException(status_code=404, detail="No documents ingested. Upload documents and run ingestion first.")

    # Generate embedding locally
    query_embedding = generate_embedding(search.query)
    embedding_str = "[" + ",".join(str(x) for x in query_embedding) + "]"

    # Retrieve relevant documents with metadata
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
            "answer": "No relevant documentation found. Please upload and ingest your vehicle documents.",
            "sources": [],
            "model": model_name
        }

    # Generate answer with Claude (cloud or local)
    client_kwargs = {}
    if settings.USE_LOCAL_LLM:
        client_kwargs["base_url"] = settings.ANTHROPIC_BASE_URL
        client_kwargs["api_key"] = "local"  # Dummy key for local LLM
    else:
        client_kwargs["api_key"] = settings.ANTHROPIC_API_KEY
        if settings.ANTHROPIC_BASE_URL:
            client_kwargs["base_url"] = settings.ANTHROPIC_BASE_URL

    claude_client = anthropic.Anthropic(**client_kwargs)

    system_prompt = f"""You are DriveIQ, an intelligent assistant for vehicle owners powered by AI.
You help answer questions about a {settings.VEHICLE_YEAR} {settings.VEHICLE_MAKE} {settings.VEHICLE_MODEL} {settings.VEHICLE_TRIM}.
VIN: {settings.VEHICLE_VIN}

Answer based on the provided documentation. Be concise, practical, and safety-focused.
If information isn't in the documentation, say so clearly."""

    message = claude_client.messages.create(
        model=model_name,
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

    # Extract key terms from the answer for highlighting
    answer_text = message.content[0].text
    key_terms = extract_key_terms(answer_text)

    # Build sources with page image URLs
    sources = []
    for r in results:
        terms_param = '&terms='.join(key_terms[:5]) if key_terms else ''
        source = {
            "document": r.document_name,
            "page": r.page_number,
            "chapter": r.chapter,
            "section": r.section,
            "topics": r.topics if r.topics else [],
            "thumbnail_url": f"/api/pages/{r.document_name}/{r.page_number}/thumbnail",
            "fullsize_url": f"/api/pages/{r.document_name}/{r.page_number}/full",
            "highlighted_url": f"/api/pages/{r.document_name}/{r.page_number}/highlighted?terms={terms_param}" if key_terms else None
        }
        sources.append(source)

    return {
        "answer": answer_text,
        "sources": sources,
        "key_terms": key_terms,
        "model": model_name
    }
