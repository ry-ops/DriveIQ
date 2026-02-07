"""Enhanced search with relevance filtering, query classification, and hybrid search."""
import logging
import re
from enum import Enum
from typing import List, Optional, Tuple
from dataclasses import dataclass
from sqlalchemy.orm import Session
from sqlalchemy import text

from app.services.embeddings import generate_embedding
from app.core.config import settings
from app.core.qdrant_client import search_vectors

logger = logging.getLogger(__name__)


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


def is_toc_or_index_page(content: str) -> bool:
    """Detect table of contents, index, and cross-reference pages.

    These pages have high keyword density but no actual information —
    they just list page numbers and section titles.
    """
    # Count page reference patterns: "P. 123", "→ P. 123", "... 123"
    page_refs = len(re.findall(r'(?:→\s*)?P\.\s*\d+', content))
    page_refs += len(re.findall(r'\.{3,}\s*\d+', content))

    # High ratio of page references to total words = TOC/index page
    word_count = len(content.split())
    if word_count > 0 and page_refs >= 4 and page_refs / word_count > 0.03:
        return True

    # Explicit TOC/index headers
    lower = content.lower()
    if any(marker in lower for marker in [
        'pictorial index', 'table of contents', 'alphabetical index',
    ]):
        return True

    return False


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

    Queries pgvector (PostgreSQL) and optionally Qdrant, merging results
    from both backends. Deduplicates by (document_name, page_number),
    keeping the higher combined score.

    Returns results sorted by combined score, filtered by minimum threshold.
    """
    # Generate semantic embedding once (reused for both backends)
    query_embedding = generate_embedding(query)
    embedding_str = "[" + ",".join(str(x) for x in query_embedding) + "]"

    # Retrieve more candidates than needed for filtering
    candidate_limit = limit * 3

    # --- pgvector search ---
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

    # Calculate combined scores and filter (skip TOC/index pages)
    scored_results = []
    for r in results:
        if is_toc_or_index_page(r.content):
            continue

        semantic_score = float(r.semantic_score)
        keyword_score = calculate_keyword_score(query, r.content)
        combined_score = (semantic_score * 0.7) + (keyword_score * 0.3)

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

    # --- Qdrant search (if enabled) ---
    if settings.USE_QDRANT:
        try:
            qdrant_results = search_vectors(
                query_vector=query_embedding,
                limit=candidate_limit,
                score_threshold=min_score,
            )
            for r in qdrant_results:
                payload = r["payload"]
                content = payload.get("content", "")

                if is_toc_or_index_page(content):
                    continue

                semantic_score = float(r["score"])
                keyword_score = calculate_keyword_score(query, content)
                combined_score = (semantic_score * 0.7) + (keyword_score * 0.3)

                if combined_score >= min_score:
                    scored_results.append(SearchResult(
                        content=content,
                        document_name=payload.get("document_name", ""),
                        page_number=payload.get("page_number", 0),
                        chapter=payload.get("chapter"),
                        section=payload.get("section"),
                        topics=payload.get("topics", []),
                        semantic_score=semantic_score,
                        keyword_score=keyword_score,
                        combined_score=combined_score
                    ))
        except Exception as e:
            logger.warning(f"Qdrant search failed, using pgvector only: {e}")

    # Deduplicate by (document_name, page_number), keeping highest score
    seen = {}
    for r in scored_results:
        key = (r.document_name, r.page_number)
        if key not in seen or r.combined_score > seen[key].combined_score:
            seen[key] = r

    deduped = list(seen.values())
    deduped.sort(key=lambda x: x.combined_score, reverse=True)
    return deduped[:limit]


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
