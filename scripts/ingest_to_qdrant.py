#!/usr/bin/env python3
"""
Ingest documents into Qdrant vector database.
Creates the driveiq_documents collection and populates it with document chunks.
"""
import os
import sys
import uuid
from pathlib import Path

# Add backend to path
sys.path.insert(0, str(Path(__file__).parent.parent / "backend"))

from pypdf import PdfReader
from typing import List, Dict, Tuple, Optional
from qdrant_client import QdrantClient
from qdrant_client.http import models
from sentence_transformers import SentenceTransformer

# Configuration
# In container, use service name "qdrant"; locally use "localhost"
QDRANT_HOST = os.getenv("QDRANT_HOST", "qdrant" if Path("/app/docs").exists() else "localhost")
QDRANT_PORT = int(os.getenv("QDRANT_PORT", "6333"))
COLLECTION_NAME = "driveiq_documents"
# When running in container, docs are at /app/docs
# When running locally, use relative path
DOCS_DIR = Path("/app/docs") if Path("/app/docs").exists() else Path(__file__).parent.parent / "docs"
EMBEDDING_DIM = 384  # all-MiniLM-L6-v2

# Topic keywords for auto-tagging
TOPIC_KEYWORDS = {
    "maintenance": [
        "oil", "filter", "fluid", "tire", "brake", "coolant", "transmission",
        "maintenance", "service", "interval", "schedule", "inspect", "replace",
        "lubrication", "rotation", "alignment", "battery", "wiper", "belt"
    ],
    "technical": [
        "engine", "horsepower", "torque", "specification", "capacity", "dimension",
        "towing", "payload", "electrical", "fuse", "wiring", "sensor",
        "transmission", "drivetrain", "suspension", "steering", "exhaust"
    ],
    "safety": [
        "warning", "danger", "caution", "airbag", "seatbelt", "abs", "traction",
        "stability", "brake", "emergency", "hazard", "recall", "safety"
    ],
    "operation": [
        "drive", "start", "stop", "park", "shift", "accelerate", "steering",
        "control", "switch", "button", "dial", "display", "meter", "gauge"
    ],
    "features": [
        "navigation", "audio", "bluetooth", "climate", "cruise", "4wd", "awd",
        "crawl control", "multi-terrain", "feature", "system", "mode", "setting"
    ],
    "history": [
        "carfax", "owner", "accident", "damage", "title", "odometer", "mileage",
        "service record", "history", "previous", "inspection"
    ]
}


def detect_topics(text: str) -> List[str]:
    """Detect topics from text content."""
    text_lower = text.lower()
    detected = []

    for topic, keywords in TOPIC_KEYWORDS.items():
        matches = sum(1 for kw in keywords if kw in text_lower)
        if matches >= 2:
            detected.append(topic)

    return detected if detected else ["general"]


def chunk_text(text: str, chunk_size: int = 1000, overlap: int = 200) -> List[str]:
    """Split text into overlapping chunks."""
    if len(text) <= chunk_size:
        return [text.strip()] if text.strip() else []

    chunks = []
    start = 0

    while start < len(text):
        end = start + chunk_size

        # Try to break at sentence boundary
        if end < len(text):
            for punct in ['. ', '.\n', '! ', '? ']:
                last_punct = text.rfind(punct, start, end)
                if last_punct > start + chunk_size // 2:
                    end = last_punct + 1
                    break

        chunk = text[start:end].strip()
        if chunk:
            chunks.append(chunk)

        start = end - overlap

    return chunks


def determine_doc_type(filename: str) -> str:
    """Determine document type from filename."""
    lower = filename.lower()
    if 'qrg' in lower or 'quick' in lower:
        return "quick_reference"
    elif 'carfax' in lower:
        return "vehicle_history"
    elif 'maintenance' in lower:
        return "maintenance_report"
    elif 'manual' in lower:
        return "owners_manual"
    elif 'certified' in lower or 'dealer' in lower:
        return "dealer_listing"
    return "document"


def process_pdf(file_path: Path, model: SentenceTransformer) -> List[Dict]:
    """Process a PDF and return chunks with embeddings."""
    print(f"  Processing: {file_path.name}")

    reader = PdfReader(file_path)
    doc_name = file_path.name
    doc_type = determine_doc_type(doc_name)

    all_chunks = []
    chunk_idx = 0

    for page_num, page in enumerate(reader.pages, 1):
        try:
            text = page.extract_text()
            if not text or len(text.strip()) < 50:
                continue

            page_chunks = chunk_text(text)

            for chunk_content in page_chunks:
                topics = detect_topics(chunk_content)
                embedding = model.encode(chunk_content).tolist()

                all_chunks.append({
                    "id": str(uuid.uuid4()),
                    "vector": embedding,
                    "payload": {
                        "document_name": doc_name,
                        "document_type": doc_type,
                        "content": chunk_content,
                        "page_number": page_num,
                        "chunk_index": chunk_idx,
                        "topics": topics,
                        "word_count": len(chunk_content.split()),
                    }
                })
                chunk_idx += 1

        except Exception as e:
            print(f"    Error on page {page_num}: {e}")
            continue

    print(f"    -> {len(all_chunks)} chunks from {len(reader.pages)} pages")
    return all_chunks


def main():
    print("=" * 60)
    print("DriveIQ Document Ingestion to Qdrant")
    print("=" * 60)

    # Initialize model
    print("\n[1/4] Loading embedding model...")
    model = SentenceTransformer('all-MiniLM-L6-v2')
    print(f"      Model loaded: all-MiniLM-L6-v2 ({EMBEDDING_DIM} dimensions)")

    # Connect to Qdrant
    print(f"\n[2/4] Connecting to Qdrant at {QDRANT_HOST}:{QDRANT_PORT}...")
    client = QdrantClient(host=QDRANT_HOST, port=QDRANT_PORT)

    # Check/create collection
    collections = [c.name for c in client.get_collections().collections]

    if COLLECTION_NAME in collections:
        print(f"      Collection '{COLLECTION_NAME}' exists - recreating...")
        client.delete_collection(COLLECTION_NAME)

    client.create_collection(
        collection_name=COLLECTION_NAME,
        vectors_config=models.VectorParams(
            size=EMBEDDING_DIM,
            distance=models.Distance.COSINE,
        ),
    )

    # Create payload indexes for filtering
    client.create_payload_index(
        collection_name=COLLECTION_NAME,
        field_name="document_type",
        field_schema=models.PayloadSchemaType.KEYWORD,
    )
    client.create_payload_index(
        collection_name=COLLECTION_NAME,
        field_name="topics",
        field_schema=models.PayloadSchemaType.KEYWORD,
    )
    print(f"      Collection '{COLLECTION_NAME}' created with indexes")

    # Process documents
    print(f"\n[3/4] Processing documents from {DOCS_DIR}...")

    if not DOCS_DIR.exists():
        print(f"      ERROR: Directory not found: {DOCS_DIR}")
        return

    pdf_files = list(DOCS_DIR.glob("*.pdf"))
    print(f"      Found {len(pdf_files)} PDF files")

    all_points = []
    for pdf_path in pdf_files:
        chunks = process_pdf(pdf_path, model)
        all_points.extend(chunks)

    # Upsert to Qdrant
    print(f"\n[4/4] Upserting {len(all_points)} vectors to Qdrant...")

    # Batch upsert (100 at a time)
    batch_size = 100
    for i in range(0, len(all_points), batch_size):
        batch = all_points[i:i + batch_size]
        points = [
            models.PointStruct(
                id=p["id"],
                vector=p["vector"],
                payload=p["payload"]
            )
            for p in batch
        ]
        client.upsert(collection_name=COLLECTION_NAME, points=points)
        print(f"      Upserted batch {i // batch_size + 1}/{(len(all_points) - 1) // batch_size + 1}")

    # Summary
    info = client.get_collection(COLLECTION_NAME)
    print("\n" + "=" * 60)
    print("INGESTION COMPLETE")
    print("=" * 60)
    print(f"Collection: {COLLECTION_NAME}")
    print(f"Total vectors: {info.points_count}")
    print(f"Vector dimension: {EMBEDDING_DIM}")
    print(f"\nView at: http://localhost:6333/dashboard")
    print("=" * 60)


if __name__ == "__main__":
    main()
