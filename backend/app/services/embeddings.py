"""Local embeddings service using sentence-transformers."""
from sentence_transformers import SentenceTransformer
from typing import List

# Load model once at startup
# all-MiniLM-L6-v2 produces 384-dimensional embeddings
_model = None

def get_model() -> SentenceTransformer:
    """Get or initialize the embedding model."""
    global _model
    if _model is None:
        _model = SentenceTransformer('all-MiniLM-L6-v2')
    return _model


def generate_embedding(text: str) -> List[float]:
    """Generate embedding for a single text."""
    model = get_model()
    embedding = model.encode(text, convert_to_numpy=True)
    return embedding.tolist()


def generate_embeddings(texts: List[str]) -> List[List[float]]:
    """Generate embeddings for multiple texts."""
    model = get_model()
    embeddings = model.encode(texts, convert_to_numpy=True)
    return embeddings.tolist()


def get_embedding_dimension() -> int:
    """Get the dimension of embeddings produced by this model."""
    return 384  # all-MiniLM-L6-v2 produces 384-dimensional vectors
