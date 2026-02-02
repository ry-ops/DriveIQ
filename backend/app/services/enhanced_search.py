"""Enhanced search with relevance filtering, query classification, and hybrid search."""
import re
from enum import Enum
from typing import List, Optional, Tuple
from dataclasses import dataclass
from sqlalchemy.orm import Session
from sqlalchemy import text

from app.services.embeddings import generate_embedding
from app.core.config import settings


class QueryIntent(str, Enum):
    """Classification of query intent."""
    VEHICLE_TECHNICAL = "vehicle_technical"  # Needs RAG from manual
    VEHICLE_GENERAL = "vehicle_general"  # About the vehicle but may not need manual
    CONVERSATIONAL = "conversational"  # Greetings, chitchat
    OFF_TOPIC = "off_topic"  # Not about the vehicle at all


@dataclass
class SearchResult:
    """A single search result with relevance score."""
    content: str
    document_name: str
    page_number: int
    chapter: Optional[str]
    section: Optional[str]
    topics: Optional[list]
    semantic_score: float
    keyword_score: float
    combined_score: float


# Minimum relevance threshold for including a result
RELEVANCE_THRESHOLD = 0.35

# Keywords that indicate vehicle/manual questions
VEHICLE_KEYWORDS = [
    # Maintenance
    "oil", "filter", "change", "service", "maintenance", "schedule", "interval",
    "fluid", "replace", "tire", "rotation", "brake", "transmission", "coolant",
    "spark plug", "battery", "wiper", "alignment", "tune-up",
    # Technical
    "spec", "capacity", "towing", "payload", "engine", "horsepower", "torque",
    "mpg", "fuel", "4wd", "awd", "differential", "suspension", "electrical",
    "fuse", "relay", "sensor", "diagnostic", "warning light", "dashboard",
    # Safety
    "airbag", "abs", "traction", "stability", "recall", "emergency", "seatbelt",
    "child seat", "hazard",
    # Features
    "bluetooth", "navigation", "cruise control", "climate", "air conditioning",
    "heater", "radio", "speaker", "camera", "parking", "mirror", "seat",
    "window", "door", "lock", "key", "remote", "start",
    # General vehicle
    "manual", "owner", "guide", "how to", "how do i", "where is", "what is",
    "reset", "turn on", "turn off", "activate", "deactivate"
]

# Patterns that indicate conversational/greeting queries
CONVERSATIONAL_PATTERNS = [
    r"^(hi|hello|hey|greetings|good morning|good afternoon|good evening)\b",
    r"^(thanks|thank you|thx|ty)\b",
    r"^(bye|goodbye|see you|later)\b",
    r"^(how are you|what's up|sup)\b",
    r"^(who are you|what are you|tell me about yourself)\b",
]

# Questions about the vehicle that don't need manual lookup
VEHICLE_GENERAL_PATTERNS = [
    r"what (color|colour) is my",
    r"what year is my",
    r"what model is my",
    r"what is my vin",
    r"tell me about my (car|vehicle|4runner|truck)",
]


def classify_query_intent(query: str) -> QueryIntent:
    """Classify the intent of a query to determine if RAG is needed."""
    query_lower = query.lower().strip()

    # Check for conversational patterns
    for pattern in CONVERSATIONAL_PATTERNS:
        if re.search(pattern, query_lower):
            return QueryIntent.CONVERSATIONAL

    # Check for general vehicle questions (don't need manual)
    for pattern in VEHICLE_GENERAL_PATTERNS:
        if re.search(pattern, query_lower):
            return QueryIntent.VEHICLE_GENERAL

    # Check for vehicle/technical keywords
    keyword_matches = sum(1 for kw in VEHICLE_KEYWORDS if kw in query_lower)

    if keyword_matches >= 1:
        return QueryIntent.VEHICLE_TECHNICAL

    # Check for question words that might indicate vehicle questions
    question_starters = ["how", "what", "where", "when", "why", "can i", "should i", "do i"]
    if any(query_lower.startswith(qs) for qs in question_starters):
        # Could be about the vehicle, do a light RAG search
        return QueryIntent.VEHICLE_TECHNICAL

    # Default to conversational for very short queries
    if len(query_lower.split()) <= 3:
        return QueryIntent.CONVERSATIONAL

    # Default to vehicle technical for longer queries
    return QueryIntent.VEHICLE_TECHNICAL


def calculate_keyword_score(query: str, content: str) -> float:
    """Calculate keyword overlap score between query and content."""
    query_words = set(re.findall(r'\b\w+\b', query.lower()))
    content_words = set(re.findall(r'\b\w+\b', content.lower()))

    # Remove common stop words
    stop_words = {'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been',
                  'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will',
                  'would', 'could', 'should', 'may', 'might', 'must', 'can',
                  'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from',
                  'it', 'this', 'that', 'these', 'those', 'i', 'you', 'he',
                  'she', 'we', 'they', 'my', 'your', 'his', 'her', 'our', 'their'}

    query_words = query_words - stop_words
    content_words = content_words - stop_words

    if not query_words:
        return 0.0

    matches = query_words & content_words
    return len(matches) / len(query_words)


def hybrid_search(
    query: str,
    db: Session,
    limit: int = 5,
    min_score: float = RELEVANCE_THRESHOLD
) -> List[SearchResult]:
    """
    Perform hybrid search combining semantic and keyword matching.

    Returns results sorted by combined score, filtered by minimum threshold.
    """
    # Generate semantic embedding
    query_embedding = generate_embedding(query)
    embedding_str = "[" + ",".join(str(x) for x in query_embedding) + "]"

    # Retrieve more candidates than needed for filtering
    candidate_limit = limit * 3

    # Vector similarity search with scores
    results = db.execute(
        text("""
        SELECT content, document_name, page_number, chapter, section, topics,
               1 - (embedding <=> CAST(:embedding AS vector)) as semantic_score
        FROM document_chunks
        ORDER BY embedding <=> CAST(:embedding AS vector)
        LIMIT :limit
        """),
        {"embedding": embedding_str, "limit": candidate_limit}
    ).fetchall()

    # Calculate combined scores and filter
    scored_results = []
    for r in results:
        semantic_score = float(r.semantic_score)
        keyword_score = calculate_keyword_score(query, r.content)

        # Combined score: weighted average (semantic is usually more reliable)
        combined_score = (semantic_score * 0.7) + (keyword_score * 0.3)

        # Only include if above threshold
        if combined_score >= min_score:
            scored_results.append(SearchResult(
                content=r.content,
                document_name=r.document_name,
                page_number=r.page_number,
                chapter=r.chapter,
                section=r.section,
                topics=r.topics if r.topics else [],
                semantic_score=semantic_score,
                keyword_score=keyword_score,
                combined_score=combined_score
            ))

    # Sort by combined score and return top results
    scored_results.sort(key=lambda x: x.combined_score, reverse=True)
    return scored_results[:limit]


def smart_search(
    query: str,
    db: Session,
    limit: int = 3
) -> Tuple[QueryIntent, List[SearchResult]]:
    """
    Smart search that classifies query intent and only searches when needed.

    Returns:
        - QueryIntent: The classified intent
        - List[SearchResult]: Relevant results (empty if RAG not needed)
    """
    intent = classify_query_intent(query)

    # Only do RAG for vehicle technical questions
    if intent == QueryIntent.VEHICLE_TECHNICAL:
        # Check if there are documents to search
        doc_count = db.execute(text("SELECT COUNT(*) FROM document_chunks")).scalar()
        if doc_count > 0:
            results = hybrid_search(query, db, limit=limit)
            return intent, results

    # For other intents, return empty results (no RAG needed)
    return intent, []


def build_context_from_results(results: List[SearchResult]) -> str:
    """Build context string from search results."""
    if not results:
        return ""

    context_parts = []
    for r in results:
        source_info = f"[{r.document_name}, Page {r.page_number}"
        if r.chapter:
            source_info += f", {r.chapter}"
        if r.section:
            source_info += f" - {r.section}"
        source_info += f"] (relevance: {r.combined_score:.2f})"
        context_parts.append(f"{source_info}\n{r.content}")

    return "\n\n".join(context_parts)
