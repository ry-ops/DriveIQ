"""Search API with Claude AI for reasoning and enhanced hybrid search."""
from urllib.parse import quote
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import List
from pydantic import BaseModel

from app.core.database import get_db
from app.core.config import settings
from app.core.llm_client import generate, get_model_name
from app.services.embeddings import generate_embedding
from app.services.page_images import extract_key_terms
from app.services.enhanced_search import hybrid_search, build_context_from_results

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
    """Search vehicle documentation using hybrid search (semantic + keyword)."""
    # Check for documents
    doc_count = db.execute(text("SELECT COUNT(*) FROM document_chunks")).scalar()
    if doc_count == 0:
        raise HTTPException(status_code=404, detail="No documents ingested yet")

    # Use enhanced hybrid search
    results = hybrid_search(search.query, db, limit=search.limit, min_score=0.2)

    return [SearchResult(
        content=r.content,
        document_name=r.document_name,
        page_number=r.page_number,
        chapter=r.chapter,
        section=r.section,
        topics=r.topics if r.topics else [],
        score=r.combined_score
    ) for r in results]


@router.post("/ask")
async def ask_question(search: SearchQuery, db: Session = Depends(get_db)):
    """Ask a question using Claude AI with enhanced hybrid RAG search."""
    model_name = get_model_name()

    # Check for documents
    doc_count = db.execute(text("SELECT COUNT(*) FROM document_chunks")).scalar()
    if doc_count == 0:
        raise HTTPException(status_code=404, detail="No documents ingested. Upload documents and run ingestion first.")

    # Use enhanced hybrid search with relevance filtering
    rag_results = hybrid_search(search.query, db, limit=5, min_score=0.35)

    # Build context from filtered results
    context = build_context_from_results(rag_results)

    if not context:
        return {
            "answer": "I couldn't find relevant information in your vehicle documentation for this question. Try rephrasing your question or consult your owner's manual directly.",
            "sources": [],
            "key_terms": [],
            "model": model_name
        }

    # Generate answer with LLM (cloud or local)
    system_prompt = f"""You are DriveIQ, an intelligent assistant for vehicle owners powered by AI.
You help answer questions about a {settings.VEHICLE_YEAR} {settings.VEHICLE_MAKE} {settings.VEHICLE_MODEL} {settings.VEHICLE_TRIM}.
VIN: {settings.VEHICLE_VIN}

Answer based on the provided documentation. Be concise, practical, and safety-focused.
If the documentation doesn't fully answer the question, say what you found and suggest checking the full manual."""

    answer_text = generate(
        system=system_prompt,
        messages=[
            {
                "role": "user",
                "content": f"""Context from vehicle documentation:
{context}

Question: {search.query}"""
            }
        ],
        max_tokens=600,
    )
    key_terms = extract_key_terms(answer_text)

    # Build sources with page image URLs and relevance scores
    sources = []
    for r in rag_results:
        terms_param = '&terms='.join(key_terms[:5]) if key_terms else ''
        encoded_doc = quote(r.document_name, safe='')
        source = {
            "document": r.document_name,
            "page": r.page_number,
            "chapter": r.chapter,
            "section": r.section,
            "topics": r.topics if r.topics else [],
            "relevance": round(r.combined_score, 2),
            "thumbnail_url": f"/api/pages/{encoded_doc}/{r.page_number}/thumbnail",
            "fullsize_url": f"/api/pages/{encoded_doc}/{r.page_number}/full",
            "highlighted_url": f"/api/pages/{encoded_doc}/{r.page_number}/highlighted?terms={terms_param}" if key_terms else None
        }
        sources.append(source)

    return {
        "answer": answer_text,
        "sources": sources,
        "key_terms": key_terms,
        "model": model_name
    }
