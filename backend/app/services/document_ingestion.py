"""Enhanced document ingestion with topic tagging for filtered retrieval."""
import os
import re
import uuid
import logging
from typing import List, Dict, Optional, Tuple
from pypdf import PdfReader
from sqlalchemy.orm import Session
from sqlalchemy import text

from app.services.embeddings import generate_embedding
from app.services.page_images import extract_page_images
from app.core.qdrant_client import upsert_vectors, delete_by_filter, ensure_collection
from app.core.redis_client import flush_document_caches

logger = logging.getLogger(__name__)

# Topic keywords mapping - used to auto-tag content
TOPIC_KEYWORDS = {
    "maintenance": [
        "oil", "filter", "fluid", "tire", "brake", "coolant", "transmission",
        "maintenance", "service", "interval", "schedule", "inspect", "replace",
        "lubrication", "rotation", "alignment", "battery", "wiper", "belt",
        "differential", "transfer case", "spark plug", "air filter", "cabin filter"
    ],
    "technical": [
        "engine", "horsepower", "torque", "specification", "capacity", "dimension",
        "towing", "payload", "electrical", "fuse", "wiring", "sensor", "ecu",
        "transmission", "drivetrain", "suspension", "steering", "exhaust",
        "compression", "displacement", "rpm", "voltage", "amperage", "cylinder"
    ],
    "safety": [
        "warning", "danger", "caution", "airbag", "seatbelt", "abs", "traction",
        "stability", "brake", "emergency", "hazard", "recall", "safety",
        "collision", "impact", "restraint", "child seat", "latch", "anchor"
    ],
    "operation": [
        "drive", "start", "stop", "park", "shift", "accelerate", "steering",
        "control", "switch", "button", "dial", "display", "meter", "gauge",
        "indicator", "light", "signal", "horn", "mirror", "seat", "window"
    ],
    "features": [
        "navigation", "audio", "bluetooth", "climate", "cruise", "4wd", "awd",
        "crawl control", "multi-terrain", "kinetic", "locking", "feature",
        "system", "mode", "setting", "option", "comfort", "convenience"
    ]
}

# Chapter detection patterns for Toyota manuals
CHAPTER_PATTERNS = [
    r"^(\d+[-–]?\d*)\s*[-–]?\s*(.+)$",  # "1-1 Before Driving" or "1 Introduction"
    r"^(SECTION\s+\d+)\s*[-–:]?\s*(.+)$",
    r"^(Chapter\s+\d+)\s*[-–:]?\s*(.+)$",
]


def detect_topics(text: str) -> List[str]:
    """Detect topics from text content based on keyword matching."""
    text_lower = text.lower()
    detected_topics = []

    for topic, keywords in TOPIC_KEYWORDS.items():
        # Count keyword matches
        matches = sum(1 for keyword in keywords if keyword in text_lower)
        # Threshold: at least 2 keyword matches to tag with topic
        if matches >= 2:
            detected_topics.append(topic)

    # If no topics detected, tag as general
    if not detected_topics:
        detected_topics = ["general"]

    return detected_topics


def extract_chapter_section(text: str, page_num: int) -> Tuple[Optional[str], Optional[str]]:
    """Extract chapter and section from text based on formatting patterns."""
    lines = text.split('\n')

    chapter = None
    section = None

    for line in lines[:10]:  # Check first 10 lines
        line = line.strip()
        if not line:
            continue

        # Check for chapter patterns
        for pattern in CHAPTER_PATTERNS:
            match = re.match(pattern, line, re.IGNORECASE)
            if match:
                chapter = f"{match.group(1)} - {match.group(2)}".strip()
                break

        # Check for section headers (usually in bold or larger font - indicated by ALL CAPS or Title Case)
        if line.isupper() and len(line) > 5 and len(line) < 100:
            section = line.title()
        elif re.match(r'^[A-Z][a-z]+ [A-Z][a-z]+', line) and len(line) < 100:
            section = line

    return chapter, section


def chunk_text(text: str, chunk_size: int = 1000, overlap: int = 200) -> List[str]:
    """Split text into overlapping chunks."""
    if len(text) <= chunk_size:
        return [text]

    chunks = []
    start = 0

    while start < len(text):
        end = start + chunk_size

        # Try to break at sentence boundary
        if end < len(text):
            # Look for sentence end
            for punct in ['. ', '.\n', '! ', '!\n', '? ', '?\n']:
                last_punct = text.rfind(punct, start, end)
                if last_punct > start + chunk_size // 2:
                    end = last_punct + 1
                    break

        chunk = text[start:end].strip()
        if chunk:
            chunks.append(chunk)

        start = end - overlap

    return chunks


def process_pdf_document(
    file_path: str,
    document_name: str,
    document_type: str = "manual"
) -> List[Dict]:
    """Process a PDF document and extract chunks with metadata."""
    reader = PdfReader(file_path)
    chunks_data = []
    chunk_index = 0

    current_chapter = None

    for page_num, page in enumerate(reader.pages, 1):
        text = page.extract_text()
        if not text or len(text.strip()) < 50:
            continue

        # Extract chapter/section from page
        chapter, section = extract_chapter_section(text, page_num)
        if chapter:
            current_chapter = chapter

        # Chunk the page content
        page_chunks = chunk_text(text)

        for chunk_text_content in page_chunks:
            # Detect topics
            topics = detect_topics(chunk_text_content)

            # Generate embedding
            embedding = generate_embedding(chunk_text_content)

            chunks_data.append({
                "document_name": document_name,
                "document_type": document_type,
                "chunk_index": chunk_index,
                "content": chunk_text_content,
                "page_number": page_num,
                "embedding": embedding,
                "chapter": current_chapter,
                "section": section,
                "topics": topics,
                "tokens": len(chunk_text_content.split())
            })

            chunk_index += 1

    return chunks_data


def ingest_document(db: Session, file_path: str, document_name: str, document_type: str = "manual") -> int:
    """Ingest a single document into PostgreSQL and Qdrant."""
    logger.info(f"Processing document: {document_name}")

    # Remove existing chunks for this document (prevents duplicates on re-upload)
    existing = db.execute(
        text("SELECT COUNT(*) FROM document_chunks WHERE document_name = :name"),
        {"name": document_name}
    ).scalar()
    if existing:
        db.execute(
            text("DELETE FROM document_chunks WHERE document_name = :name"),
            {"name": document_name}
        )
        db.commit()
        logger.info(f"Deleted {existing} existing pgvector chunks for {document_name}")

    delete_by_filter("document_name", document_name)

    # Flush cached answers that may reference this document's old content
    flush_document_caches()

    # Process document
    chunks = process_pdf_document(file_path, document_name, document_type)
    logger.info(f"Extracted {len(chunks)} chunks from {document_name}")

    # Ensure Qdrant collection exists
    ensure_collection()

    # Prepare Qdrant batch
    qdrant_ids = []
    qdrant_vectors = []
    qdrant_payloads = []

    # Insert chunks to PostgreSQL
    inserted = 0
    for chunk in chunks:
        try:
            embedding_str = "[" + ",".join(str(x) for x in chunk["embedding"]) + "]"
            # Format topics array for PostgreSQL
            topics_array = "{" + ",".join(chunk["topics"]) + "}"

            db.execute(
                text("""
                INSERT INTO document_chunks
                (document_name, document_type, chunk_index, content, page_number,
                 embedding, chapter, section, topics, tokens)
                VALUES
                (:document_name, :document_type, :chunk_index, :content, :page_number,
                 CAST(:embedding AS vector), :chapter, :section, CAST(:topics AS text[]), :tokens)
                """),
                {
                    "document_name": chunk["document_name"],
                    "document_type": chunk["document_type"],
                    "chunk_index": chunk["chunk_index"],
                    "content": chunk["content"],
                    "page_number": chunk["page_number"],
                    "embedding": embedding_str,
                    "chapter": chunk["chapter"],
                    "section": chunk["section"],
                    "topics": topics_array,
                    "tokens": chunk["tokens"]
                }
            )
            inserted += 1

            # Prepare Qdrant data
            qdrant_ids.append(str(uuid.uuid4()))
            qdrant_vectors.append(chunk["embedding"])
            qdrant_payloads.append({
                "document_name": chunk["document_name"],
                "document_type": chunk["document_type"],
                "content": chunk["content"],
                "page_number": chunk["page_number"],
                "chunk_index": chunk["chunk_index"],
                "topics": chunk["topics"],
                "chapter": chunk["chapter"],
                "section": chunk["section"],
                "word_count": chunk["tokens"]
            })

        except Exception as e:
            logger.error(f"Error inserting chunk {chunk['chunk_index']}: {e}")
            db.rollback()
            continue

    db.commit()
    logger.info(f"Inserted {inserted} chunks to PostgreSQL for {document_name}")

    # Batch upsert to Qdrant (100 at a time)
    batch_size = 100
    qdrant_success = 0
    for i in range(0, len(qdrant_ids), batch_size):
        batch_ids = qdrant_ids[i:i + batch_size]
        batch_vectors = qdrant_vectors[i:i + batch_size]
        batch_payloads = qdrant_payloads[i:i + batch_size]
        if upsert_vectors(batch_ids, batch_vectors, batch_payloads):
            qdrant_success += len(batch_ids)

    logger.info(f"Upserted {qdrant_success} vectors to Qdrant for {document_name}")

    return inserted


def ingest_all_documents(db: Session, upload_dir: str) -> Dict[str, int]:
    """Ingest all documents from the upload directory into PostgreSQL and Qdrant."""
    results = {}

    if not os.path.exists(upload_dir):
        logger.error(f"Upload directory not found: {upload_dir}")
        return {"error": f"Upload directory not found: {upload_dir}"}

    # Clear existing PostgreSQL chunks
    logger.info("Clearing existing PostgreSQL chunks...")
    db.execute(text("TRUNCATE document_chunks"))
    db.commit()

    # Clear existing Qdrant collection by recreating it
    logger.info("Recreating Qdrant collection...")
    from app.core.qdrant_client import get_qdrant
    from qdrant_client.http import models
    from app.core.config import settings

    try:
        client = get_qdrant()
        collections = [c.name for c in client.get_collections().collections]
        if settings.QDRANT_COLLECTION in collections:
            client.delete_collection(settings.QDRANT_COLLECTION)
            logger.info(f"Deleted existing Qdrant collection: {settings.QDRANT_COLLECTION}")
    except Exception as e:
        logger.warning(f"Could not clear Qdrant collection: {e}")

    # Flush stale LLM and search caches
    flush_document_caches()

    # Find all PDFs
    pdf_files = [f for f in os.listdir(upload_dir) if f.lower().endswith('.pdf')]
    logger.info(f"Found {len(pdf_files)} PDF files in {upload_dir}")

    for filename in pdf_files:
        file_path = os.path.join(upload_dir, filename)
        logger.info(f"Processing: {filename}")

        # Determine document type from filename
        filename_lower = filename.lower()
        if 'qrg' in filename_lower or 'quick' in filename_lower:
            doc_type = "qrg"
        elif 'maintenance' in filename_lower:
            doc_type = "maintenance_report"
        elif 'carfax' in filename_lower:
            doc_type = "vehicle_history"
        elif 'certified' in filename_lower or 'dealer' in filename_lower:
            doc_type = "dealer_listing"
        else:
            doc_type = "manual"

        try:
            # Extract page images first
            logger.info(f"Extracting page images for {filename}...")
            page_results = extract_page_images(file_path, filename)
            logger.info(f"Extracted {len(page_results)} page images for {filename}")

            count = ingest_document(db, file_path, filename, doc_type)
            results[filename] = count
            logger.info(f"Completed {filename}: {count} chunks")
        except Exception as e:
            results[filename] = f"Error: {str(e)}"
            logger.error(f"Error ingesting {filename}: {e}", exc_info=True)

    # Embed maintenance records into the vector store
    try:
        maintenance_count = embed_maintenance_records(db)
        results["Service Records (maintenance)"] = maintenance_count
        logger.info(f"Embedded {maintenance_count} maintenance record chunks")
    except Exception as e:
        logger.error(f"Failed to embed maintenance records: {e}")
        results["Service Records (maintenance)"] = f"Error: {str(e)}"

    logger.info(f"Ingestion complete: {len(results)} documents processed")
    return results


def get_chunks_by_topics(db: Session, topics: List[str], embedding: List[float], limit: int = 5) -> List[Dict]:
    """Retrieve chunks filtered by topics and ranked by embedding similarity."""
    embedding_str = "[" + ",".join(str(x) for x in embedding) + "]"
    topics_array = "{" + ",".join(f'"{t}"' for t in topics) + "}"

    results = db.execute(
        text("""
        SELECT content, document_name, page_number, chapter, section, topics,
               1 - (embedding <=> CAST(:embedding AS vector)) as score
        FROM document_chunks
        WHERE topics && :topics::text[]
        ORDER BY embedding <=> CAST(:embedding AS vector)
        LIMIT :limit
        """),
        {"embedding": embedding_str, "topics": topics_array, "limit": limit}
    ).fetchall()

    return [
        {
            "content": r.content,
            "document_name": r.document_name,
            "page_number": r.page_number,
            "chapter": r.chapter,
            "section": r.section,
            "topics": r.topics,
            "score": float(r.score)
        }
        for r in results
    ]


def compose_maintenance_text(record: dict) -> str:
    """Compose searchable text from a maintenance record."""
    parts = []

    mtype = record.get("maintenance_type") or record.get("service_type") or "Service"
    date = record.get("date_performed") or record.get("date") or "unknown date"
    mileage = record.get("mileage")

    parts.append(f"{mtype} performed on {date}")
    if mileage:
        parts.append(f"at {mileage:,} miles")
    parts.append(".")

    desc = record.get("description")
    if desc:
        parts.append(desc.strip().rstrip(".") + ".")

    provider = record.get("service_provider") or record.get("location")
    if provider:
        parts.append(f"Provider: {provider}.")

    parts_used = record.get("parts_used")
    if parts_used:
        if isinstance(parts_used, str):
            try:
                import json
                parts_used = json.loads(parts_used)
            except (json.JSONDecodeError, TypeError):
                pass
        if isinstance(parts_used, list):
            parts.append(f"Parts: {', '.join(str(p) for p in parts_used)}.")
        elif isinstance(parts_used, str) and parts_used.strip():
            parts.append(f"Parts: {parts_used}.")

    cost = record.get("cost")
    if cost:
        parts.append(f"Cost: ${float(cost):.2f}.")

    notes = record.get("notes")
    if notes:
        parts.append(f"Notes: {notes}.")

    source = record.get("source")
    if source and source != "manual":
        parts.append(f"Source: {source}.")

    return " ".join(parts)


def embed_maintenance_records(db: Session) -> int:
    """
    Embed all maintenance records and service logs into document_chunks and Qdrant.

    Makes maintenance history searchable via RAG so the AI can answer questions
    like "when was my last brake job?" across all history.
    """
    logger.info("Embedding maintenance records...")

    # Delete existing maintenance_record chunks
    existing = db.execute(
        text("SELECT COUNT(*) FROM document_chunks WHERE document_type = 'maintenance_record'")
    ).scalar() or 0
    if existing:
        db.execute(text("DELETE FROM document_chunks WHERE document_type = 'maintenance_record'"))
        db.commit()
        logger.info(f"Deleted {existing} existing maintenance_record chunks")

    delete_by_filter("document_type", "maintenance_record")

    # Query all maintenance_records
    records = []
    try:
        mr_rows = db.execute(
            text("""
            SELECT maintenance_type, description, date_performed, mileage, cost,
                   service_provider, parts_used, notes, location
            FROM maintenance_records
            ORDER BY date_performed DESC
            """)
        ).fetchall()
        for r in mr_rows:
            records.append({
                "maintenance_type": r.maintenance_type,
                "description": r.description,
                "date_performed": str(r.date_performed) if r.date_performed else None,
                "mileage": r.mileage,
                "cost": r.cost,
                "service_provider": r.service_provider,
                "parts_used": r.parts_used,
                "notes": r.notes,
                "location": r.location,
            })
    except Exception as e:
        logger.warning(f"Could not query maintenance_records: {e}")

    # Query all maintenance_logs (CARFAX imports)
    try:
        ml_rows = db.execute(
            text("""
            SELECT service_type, description, date, mileage, category, source, location
            FROM maintenance_logs
            ORDER BY date DESC
            """)
        ).fetchall()
        for r in ml_rows:
            records.append({
                "service_type": r.service_type,
                "description": r.description,
                "date": str(r.date) if r.date else None,
                "mileage": r.mileage,
                "source": r.source,
                "location": r.location,
            })
    except Exception as e:
        logger.warning(f"Could not query maintenance_logs: {e}")

    if not records:
        logger.info("No maintenance records to embed")
        return 0

    logger.info(f"Composing text for {len(records)} maintenance records")

    ensure_collection()

    qdrant_ids = []
    qdrant_vectors = []
    qdrant_payloads = []
    inserted = 0

    for i, record in enumerate(records):
        text_content = compose_maintenance_text(record)
        if len(text_content.strip()) < 10:
            continue

        embedding = generate_embedding(text_content)
        topics = detect_topics(text_content)

        try:
            embedding_str = "[" + ",".join(str(x) for x in embedding) + "]"
            topics_array = "{" + ",".join(topics) + "}" if topics else "{}"

            db.execute(
                text("""
                INSERT INTO document_chunks
                (document_name, document_type, chunk_index, content, page_number,
                 embedding, chapter, section, topics, tokens)
                VALUES
                (:document_name, :document_type, :chunk_index, :content, :page_number,
                 CAST(:embedding AS vector), :chapter, :section, CAST(:topics AS text[]), :tokens)
                """),
                {
                    "document_name": "Service Records",
                    "document_type": "maintenance_record",
                    "chunk_index": i,
                    "content": text_content,
                    "page_number": 0,
                    "embedding": embedding_str,
                    "chapter": None,
                    "section": record.get("maintenance_type") or record.get("service_type"),
                    "topics": topics_array,
                    "tokens": len(text_content.split()),
                }
            )
            inserted += 1

            qdrant_ids.append(str(uuid.uuid4()))
            qdrant_vectors.append(embedding)
            qdrant_payloads.append({
                "document_name": "Service Records",
                "document_type": "maintenance_record",
                "content": text_content,
                "page_number": 0,
                "chunk_index": i,
                "topics": topics,
                "chapter": None,
                "section": record.get("maintenance_type") or record.get("service_type"),
                "word_count": len(text_content.split()),
            })
        except Exception as e:
            logger.error(f"Error inserting maintenance chunk {i}: {e}")
            db.rollback()
            continue

    db.commit()
    logger.info(f"Inserted {inserted} maintenance record chunks to PostgreSQL")

    # Batch upsert to Qdrant
    batch_size = 100
    qdrant_success = 0
    for i in range(0, len(qdrant_ids), batch_size):
        batch_ids = qdrant_ids[i:i + batch_size]
        batch_vectors = qdrant_vectors[i:i + batch_size]
        batch_payloads = qdrant_payloads[i:i + batch_size]
        if upsert_vectors(batch_ids, batch_vectors, batch_payloads):
            qdrant_success += len(batch_ids)

    logger.info(f"Upserted {qdrant_success} maintenance vectors to Qdrant")

    # Flush search caches since new content is now searchable
    flush_document_caches()

    return inserted
