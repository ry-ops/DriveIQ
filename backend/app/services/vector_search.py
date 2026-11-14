"""
Vector Search Service

Unified interface for vector similarity search supporting both pgvector and Qdrant backends.
Includes Redis caching for search results.
"""
import logging
from typing import List, Optional
from dataclasses import dataclass

from sqlalchemy.orm import Session
from sqlalchemy import text

from app.core.config import settings
from app.core.redis_client import search_cache
from app.core.qdrant_client import search_vectors, ensure_collection, upsert_vectors
from app.services.embeddings import generate_embedding

logger = logging.getLogger(__name__)


@dataclass
class SearchResult:
    """Unified search result from any backend."""
    content: str
    document_name: str
    page_number: Optional[int]
    chapter: Optional[str]
    section: Optional[str]
    topics: List[str]
    score: float
    chunk_id: Optional[int] = None


class VectorSearchService:
    """
    Vector search service with support for multiple backends.

    Supports:
    - pgvector: Uses PostgreSQL with pgvector extension
    - qdrant: Uses Qdrant vector database

    Includes Redis caching for search results.
    """

    def __init__(self, db: Session, use_qdrant: bool = False):
        self.db = db
        self.use_qdrant = use_qdrant
        self._ensure_backend()

    def _ensure_backend(self):
        """Ensure the selected backend is available."""
        if self.use_qdrant:
            ensure_collection()

    def search(
        self,
        query: str,
        limit: int = 5,
        topics_filter: Optional[List[str]] = None,
        document_type: Optional[str] = None,
        use_cache: bool = True,
        min_score: float = 0.0,
    ) -> List[SearchResult]:
        """
        Search for similar documents.

        Args:
            query: Search query text
            limit: Maximum number of results
            topics_filter: Filter by topics (e.g., ["maintenance", "safety"])
            document_type: Filter by document type (e.g., "manual", "qrg")
            use_cache: Whether to use Redis cache
            min_score: Minimum similarity score threshold

        Returns:
            List of SearchResult objects
        """
        # Build cache key
        cache_filters = {
            "topics": topics_filter,
            "doc_type": document_type,
            "limit": limit,
            "min_score": min_score,
        }

        # Try cache first
        if use_cache:
            cached = search_cache.get_results(query, cache_filters)
            if cached is not None:
                logger.debug(f"Search cache hit for query: {query[:50]}...")
                return [SearchResult(**r) for r in cached]

        # Generate query embedding
        query_embedding = generate_embedding(query)

        # Search using selected backend
        if self.use_qdrant:
            results = self._search_qdrant(
                query_embedding, limit, topics_filter, document_type, min_score
            )
        else:
            results = self._search_pgvector(
                query_embedding, limit, topics_filter, document_type, min_score
            )

        # Cache results
        if use_cache and results:
            cache_data = [
                {
                    "content": r.content,
                    "document_name": r.document_name,
                    "page_number": r.page_number,
                    "chapter": r.chapter,
                    "section": r.section,
                    "topics": r.topics,
                    "score": r.score,
                    "chunk_id": r.chunk_id,
                }
                for r in results
            ]
            search_cache.set_results(query, cache_data, cache_filters)

        return results

    def _search_pgvector(
        self,
        query_embedding: List[float],
        limit: int,
        topics_filter: Optional[List[str]],
        document_type: Optional[str],
        min_score: float,
    ) -> List[SearchResult]:
        """Search using pgvector backend."""
        embedding_str = "[" + ",".join(str(x) for x in query_embedding) + "]"

        # Build query with optional filters
        query_parts = [
            """
            SELECT id, content, document_name, page_number, chapter, section, topics,
                   1 - (embedding <=> CAST(:embedding AS vector)) as score
            FROM document_chunks
            WHERE 1=1
            """
        ]
        params = {"embedding": embedding_str, "limit": limit}

        if topics_filter:
            query_parts.append("AND topics && :topics::text[]")
            params["topics"] = topics_filter

        if document_type:
            query_parts.append("AND document_type = :doc_type")
            params["doc_type"] = document_type

        if min_score > 0:
            query_parts.append(
                "AND 1 - (embedding <=> CAST(:embedding AS vector)) >= :min_score"
            )
            params["min_score"] = min_score

        query_parts.append("ORDER BY embedding <=> CAST(:embedding AS vector)")
        query_parts.append("LIMIT :limit")

        sql = " ".join(query_parts)
        results = self.db.execute(text(sql), params).fetchall()

        return [
            SearchResult(
                content=r.content,
                document_name=r.document_name,
                page_number=r.page_number,
                chapter=r.chapter,
                section=r.section,
                topics=r.topics if r.topics else [],
                score=float(r.score),
                chunk_id=r.id,
            )
            for r in results
        ]

    def _search_qdrant(
        self,
        query_embedding: List[float],
        limit: int,
        topics_filter: Optional[List[str]],
        document_type: Optional[str],
        min_score: float,
    ) -> List[SearchResult]:
        """Search using Qdrant backend."""
        # Build filter conditions
        filter_conditions = {}
        if topics_filter:
            filter_conditions["topics"] = topics_filter
        if document_type:
            filter_conditions["document_type"] = document_type

        results = search_vectors(
            query_vector=query_embedding,
            limit=limit,
            score_threshold=min_score,
            filter_conditions=filter_conditions if filter_conditions else None,
        )

        return [
            SearchResult(
                content=r["payload"].get("content", ""),
                document_name=r["payload"].get("document_name", ""),
                page_number=r["payload"].get("page_number"),
                chapter=r["payload"].get("chapter"),
                section=r["payload"].get("section"),
                topics=r["payload"].get("topics", []),
                score=r["score"],
                chunk_id=r["payload"].get("chunk_id"),
            )
            for r in results
        ]


def get_search_service(
    db: Session, use_qdrant: bool = False
) -> VectorSearchService:
    """Factory function to get search service with selected backend."""
    return VectorSearchService(db, use_qdrant=use_qdrant)
