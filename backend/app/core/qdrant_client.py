import logging
from typing import Optional, List

from qdrant_client import QdrantClient
from qdrant_client.http import models
from qdrant_client.http.exceptions import UnexpectedResponse

from app.core.config import settings

logger = logging.getLogger(__name__)

# Qdrant client singleton
_qdrant_client: Optional[QdrantClient] = None


def get_qdrant() -> QdrantClient:
    """Get Qdrant client singleton."""
    global _qdrant_client
    if _qdrant_client is None:
        _qdrant_client = QdrantClient(
            host=settings.QDRANT_HOST,
            port=settings.QDRANT_PORT,
            timeout=10,
        )
    return _qdrant_client


def check_qdrant_health() -> dict:
    """Check Qdrant connectivity and return health status."""
    try:
        client = get_qdrant()
        # Check if collection exists
        collections = client.get_collections()
        collection_names = [c.name for c in collections.collections]

        collection_info = None
        if settings.QDRANT_COLLECTION in collection_names:
            info = client.get_collection(settings.QDRANT_COLLECTION)
            collection_info = {
                "name": settings.QDRANT_COLLECTION,
                "vectors_count": info.vectors_count,
                "points_count": info.points_count,
                "status": info.status.value,
            }

        return {
            "status": "healthy",
            "connected": True,
            "collections": collection_names,
            "primary_collection": collection_info,
        }
    except UnexpectedResponse as e:
        logger.error(f"Qdrant health check failed: {e}")
        return {
            "status": "unhealthy",
            "connected": False,
            "error": str(e),
        }
    except Exception as e:
        logger.error(f"Qdrant health check error: {e}")
        return {
            "status": "error",
            "connected": False,
            "error": str(e),
        }


def ensure_collection(
    vector_size: int = 384,  # all-MiniLM-L6-v2 dimensions
    distance: models.Distance = models.Distance.COSINE,
) -> bool:
    """Ensure the primary collection exists with proper configuration."""
    try:
        client = get_qdrant()
        collections = client.get_collections()
        collection_names = [c.name for c in collections.collections]

        if settings.QDRANT_COLLECTION not in collection_names:
            client.create_collection(
                collection_name=settings.QDRANT_COLLECTION,
                vectors_config=models.VectorParams(
                    size=vector_size,
                    distance=distance,
                ),
                # Payload indexes for filtering
                optimizers_config=models.OptimizersConfigDiff(
                    indexing_threshold=10000,
                ),
            )
            # Create payload indexes
            client.create_payload_index(
                collection_name=settings.QDRANT_COLLECTION,
                field_name="document_type",
                field_schema=models.PayloadSchemaType.KEYWORD,
            )
            client.create_payload_index(
                collection_name=settings.QDRANT_COLLECTION,
                field_name="topics",
                field_schema=models.PayloadSchemaType.KEYWORD,
            )
            logger.info(f"Created Qdrant collection: {settings.QDRANT_COLLECTION}")
        return True
    except Exception as e:
        logger.error(f"Failed to ensure Qdrant collection: {e}")
        return False


def upsert_vectors(
    ids: List[str],
    vectors: List[List[float]],
    payloads: List[dict],
) -> bool:
    """Upsert vectors with payloads to the collection."""
    try:
        client = get_qdrant()
        points = [
            models.PointStruct(id=id_, vector=vector, payload=payload)
            for id_, vector, payload in zip(ids, vectors, payloads)
        ]
        client.upsert(
            collection_name=settings.QDRANT_COLLECTION,
            points=points,
        )
        return True
    except Exception as e:
        logger.error(f"Qdrant upsert failed: {e}")
        return False


def search_vectors(
    query_vector: List[float],
    limit: int = 5,
    score_threshold: float = 0.0,
    filter_conditions: Optional[dict] = None,
) -> List[dict]:
    """Search for similar vectors with optional filtering."""
    try:
        client = get_qdrant()

        # Build filter if conditions provided
        query_filter = None
        if filter_conditions:
            must_conditions = []
            for field, values in filter_conditions.items():
                if isinstance(values, list):
                    must_conditions.append(
                        models.FieldCondition(
                            key=field,
                            match=models.MatchAny(any=values),
                        )
                    )
                else:
                    must_conditions.append(
                        models.FieldCondition(
                            key=field,
                            match=models.MatchValue(value=values),
                        )
                    )
            if must_conditions:
                query_filter = models.Filter(must=must_conditions)

        results = client.search(
            collection_name=settings.QDRANT_COLLECTION,
            query_vector=query_vector,
            limit=limit,
            score_threshold=score_threshold,
            query_filter=query_filter,
            with_payload=True,
        )

        return [
            {
                "id": r.id,
                "score": r.score,
                "payload": r.payload,
            }
            for r in results
        ]
    except Exception as e:
        logger.error(f"Qdrant search failed: {e}")
        return []


def delete_by_filter(filter_field: str, filter_value: str) -> bool:
    """Delete points matching a filter."""
    try:
        client = get_qdrant()
        client.delete(
            collection_name=settings.QDRANT_COLLECTION,
            points_selector=models.FilterSelector(
                filter=models.Filter(
                    must=[
                        models.FieldCondition(
                            key=filter_field,
                            match=models.MatchValue(value=filter_value),
                        )
                    ]
                )
            ),
        )
        return True
    except Exception as e:
        logger.error(f"Qdrant delete failed: {e}")
        return False
