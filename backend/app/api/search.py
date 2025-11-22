from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from pydantic import BaseModel

from app.core.database import get_db
from app.core.config import settings
from app.models.document import DocumentChunk

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
async def search_documents(
    search: SearchQuery,
    db: Session = Depends(get_db)
):
    """Search vehicle documentation using semantic search."""
    import openai

    if not settings.OPENAI_API_KEY:
        raise HTTPException(status_code=500, detail="OpenAI API key not configured")

    # Generate embedding for query
    client = openai.OpenAI(api_key=settings.OPENAI_API_KEY)
    response = client.embeddings.create(
        model="text-embedding-ada-002",
        input=search.query
    )
    query_embedding = response.data[0].embedding

    # Perform vector similarity search
    results = db.execute(
        """
        SELECT
            content,
            document_name,
            page_number,
            1 - (embedding <=> :embedding) as score
        FROM document_chunks
        ORDER BY embedding <=> :embedding
        LIMIT :limit
        """,
        {"embedding": str(query_embedding), "limit": search.limit}
    ).fetchall()

    return [
        SearchResult(
            content=r.content,
            document_name=r.document_name,
            page_number=r.page_number,
            score=float(r.score)
        )
        for r in results
    ]


@router.post("/ask")
async def ask_question(
    search: SearchQuery,
    db: Session = Depends(get_db)
):
    """Ask a question about the vehicle and get an AI-generated answer."""
    import openai

    if not settings.OPENAI_API_KEY:
        raise HTTPException(status_code=500, detail="OpenAI API key not configured")

    # Get relevant context
    client = openai.OpenAI(api_key=settings.OPENAI_API_KEY)

    # Generate embedding for query
    embedding_response = client.embeddings.create(
        model="text-embedding-ada-002",
        input=search.query
    )
    query_embedding = embedding_response.data[0].embedding

    # Get relevant documents
    results = db.execute(
        """
        SELECT content, document_name, page_number
        FROM document_chunks
        ORDER BY embedding <=> :embedding
        LIMIT 5
        """,
        {"embedding": str(query_embedding)}
    ).fetchall()

    # Build context
    context = "\n\n".join([
        f"[{r.document_name}, Page {r.page_number}]\n{r.content}"
        for r in results
    ])

    # Generate answer
    chat_response = client.chat.completions.create(
        model="gpt-4-turbo-preview",
        messages=[
            {
                "role": "system",
                "content": f"""You are a helpful assistant for a 2018 Toyota 4Runner SR5 Premium owner.
Answer questions based on the vehicle documentation provided.
Be concise and practical. If the information isn't in the documentation, say so.

Vehicle: {settings.VEHICLE_YEAR} {settings.VEHICLE_MAKE} {settings.VEHICLE_MODEL} {settings.VEHICLE_TRIM}
VIN: {settings.VEHICLE_VIN}"""
            },
            {
                "role": "user",
                "content": f"""Context from vehicle documentation:
{context}

Question: {search.query}"""
            }
        ],
        temperature=0.3,
        max_tokens=500
    )

    return {
        "answer": chat_response.choices[0].message.content,
        "sources": [
            {"document": r.document_name, "page": r.page_number}
            for r in results
        ]
    }
