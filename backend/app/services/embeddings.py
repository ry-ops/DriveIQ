"""Local embeddings service using sentence-transformers with Redis caching."""
import logging
from sentence_transformers import SentenceTransformer
from typing import List, Optional

from app.core.redis_client import embedding_cache

logger = logging.getLogger(__name__)

# Load model once at startup
# all-MiniLM-L6-v2 produces 384-dimensional embeddings
_model = None


def get_model() -> SentenceTransformer:
    """Get or initialize the embedding model."""
    global _model
    if _model is None:
        logger.info("Loading sentence-transformers model: all-MiniLM-L6-v2")
        _model = SentenceTransformer('all-MiniLM-L6-v2')
        logger.info("Model loaded successfully")
    return _model


def generate_embedding(text: str, use_cache: bool = True) -> List[float]:
    """
    Generate embedding for a single text.
    Uses Redis cache to avoid recomputing embeddings for the same text.
    """
    # Try cache first
    if use_cache:
        cached = embedding_cache.get_embedding(text)
        if cached is not None:
            logger.debug(f"Cache hit for embedding (text length: {len(text)})")
            return cached

    # Generate embedding
    model = get_model()
    embedding = model.encode(text, convert_to_numpy=True)
    result = embedding.tolist()

    # Cache for future use
    if use_cache:
        embedding_cache.set_embedding(text, result)
        logger.debug(f"Cached embedding (text length: {len(text)})")

    return result


def generate_embeddings(texts: List[str], use_cache: bool = True) -> List[List[float]]:
    """
    Generate embeddings for multiple texts with caching.
    Checks cache for each text and only computes missing embeddings.
    """
    results: List[Optional[List[float]]] = [None] * len(texts)
    texts_to_compute: List[tuple[int, str]] = []

    # Check cache for each text
    if use_cache:
        for i, text in enumerate(texts):
            cached = embedding_cache.get_embedding(text)
            if cached is not None:
                results[i] = cached
            else:
                texts_to_compute.append((i, text))
    else:
        texts_to_compute = list(enumerate(texts))

    cache_hits = len(texts) - len(texts_to_compute)
    if cache_hits > 0:
        logger.debug(f"Embedding cache: {cache_hits}/{len(texts)} hits")

    # Compute missing embeddings in batch
    if texts_to_compute:
        model = get_model()
        texts_only = [t for _, t in texts_to_compute]
        new_embeddings = model.encode(texts_only, convert_to_numpy=True)

        for (idx, text), embedding in zip(texts_to_compute, new_embeddings):
            embedding_list = embedding.tolist()
            results[idx] = embedding_list
            if use_cache:
                embedding_cache.set_embedding(text, embedding_list)

    return results


def get_embedding_dimension() -> int:
    """Get the dimension of embeddings produced by this model."""
    return 384  # all-MiniLM-L6-v2 produces 384-dimensional vectors


def preload_model():
    """Preload the model at startup to avoid first-request latency."""
    get_model()
    logger.info("Embedding model preloaded")
