import os
import shutil
import re
from pathlib import Path
from fastapi import APIRouter, UploadFile, File, HTTPException, BackgroundTasks, Depends
from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import List, Optional
from pydantic import BaseModel

from app.core.database import get_db, SessionLocal
from app.core.qdrant_client import delete_by_filter
from app.services.document_ingestion import ingest_all_documents, ingest_document
from app.services.page_images import extract_page_images, delete_page_images
import logging

logger = logging.getLogger(__name__)

router = APIRouter()


# Document types to keep on disk after ingestion (reference material)
KEEP_ON_DISK_TYPES = {"manual", "qrg"}


def background_ingest_document(file_path: str, filename: str, document_type: str):
    """Background task to ingest a single document.

    After successful ingestion, non-manual PDFs are deleted from disk.
    The data lives on in pgvector, Qdrant, and page images.
    """
    try:
        logger.info(f"Starting background ingestion for {filename}")

        # Extract page images first
        logger.info(f"Extracting page images for {filename}...")
        page_results = extract_page_images(file_path, filename)
        logger.info(f"Extracted {len(page_results)} page images for {filename}")

        # Create a new database session for background task
        db = SessionLocal()
        try:
            count = ingest_document(db, file_path, filename, document_type)
            logger.info(f"Ingested {filename}: {count} chunks")
        finally:
            db.close()

        # Delete source PDF if it's not a manual/qrg (data is in vectors + page images)
        if document_type not in KEEP_ON_DISK_TYPES:
            file = Path(file_path)
            if file.exists():
                file.unlink()
                logger.info(f"Deleted source PDF after ingestion: {filename}")

    except Exception as e:
        logger.error(f"Background ingestion failed for {filename}: {e}")

# Upload directories - use /app paths in container, relative paths locally
if Path("/app/docs").exists():
    # Running in Docker container
    UPLOAD_DIR = Path("/app/uploads")
    DOCS_DIR = Path("/app/docs")
else:
    # Running locally
    UPLOAD_DIR = Path(__file__).parent.parent.parent.parent / "uploads"
    DOCS_DIR = Path(__file__).parent.parent.parent.parent / "docs"

# Ensure directories exist
UPLOAD_DIR.mkdir(exist_ok=True)
DOCS_DIR.mkdir(exist_ok=True)

# Allowed file types
ALLOWED_EXTENSIONS = {".pdf"}
MAX_FILE_SIZE = 50 * 1024 * 1024  # 50MB


class UploadResponse(BaseModel):
    filename: str
    size: int
    message: str


class DocumentInfo(BaseModel):
    filename: str
    size: int
    path: str
    document_type: str


class IngestedDocumentInfo(BaseModel):
    document_name: str
    document_type: Optional[str] = None
    chunk_count: int
    page_count: int
    topics: List[str]
    on_disk: bool


def get_document_type(filename: str) -> str:
    """Determine document type from filename."""
    lower = filename.lower()
    stem = Path(filename).stem.lower()
    if "carfax" in lower:
        return "carfax"
    elif "manual" in lower or stem.startswith("om"):
        return "manual"
    elif "qrg" in lower or "quick reference" in lower:
        return "qrg"
    elif "maintenance" in lower:
        return "maintenance_report"
    elif "receipt" in lower:
        return "receipt"
    else:
        return "other"


def sanitize_filename(filename: str) -> str:
    """Sanitize filename to prevent path traversal attacks."""
    # Remove any directory components
    filename = os.path.basename(filename)
    # Remove potentially dangerous characters
    filename = re.sub(r'[^\w\s\-\.]', '', filename)
    # Ensure it doesn't start with a dot
    filename = filename.lstrip('.')
    return filename


def validate_pdf_content(content: bytes) -> bool:
    """Validate that content is actually a PDF file."""
    return content[:4] == b'%PDF'


@router.post("", response_model=UploadResponse)
async def upload_document(
    file: UploadFile = File(...),
    background_tasks: BackgroundTasks = None,
):
    """Upload a vehicle document (PDF). Automatically ingests for AI search."""

    # Validate file extension
    ext = Path(file.filename).suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"File type not allowed. Allowed types: {', '.join(ALLOWED_EXTENSIONS)}"
        )

    # Read file content
    content = await file.read()

    # Validate file size
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=400,
            detail=f"File too large. Maximum size: {MAX_FILE_SIZE // (1024*1024)}MB"
        )

    # Validate PDF content
    if not validate_pdf_content(content):
        raise HTTPException(
            status_code=400,
            detail="Invalid PDF file. File content does not match PDF format."
        )

    # Sanitize filename to prevent path traversal
    safe_filename = sanitize_filename(file.filename)
    if not safe_filename:
        raise HTTPException(status_code=400, detail="Invalid filename")

    # Save to docs directory (where ingestion script looks)
    file_path = DOCS_DIR / safe_filename

    with open(file_path, "wb") as f:
        f.write(content)

    # Determine document type from filename
    doc_type = get_document_type(safe_filename)

    # Queue background ingestion task
    if background_tasks:
        background_tasks.add_task(
            background_ingest_document,
            str(file_path),
            safe_filename,
            doc_type
        )
        message = f"File uploaded successfully. AI search ingestion started in background."
    else:
        message = f"File uploaded successfully. Run document ingestion to enable AI search."

    return UploadResponse(
        filename=safe_filename,
        size=len(content),
        message=message
    )


@router.get("", response_model=List[DocumentInfo])
async def list_documents():
    """List all uploaded documents."""
    documents = []

    for file_path in DOCS_DIR.glob("*.pdf"):
        stat = file_path.stat()
        documents.append(DocumentInfo(
            filename=file_path.name,
            size=stat.st_size,
            path=str(file_path),
            document_type=get_document_type(file_path.name)
        ))

    return sorted(documents, key=lambda d: d.filename)


@router.delete("/{filename}")
async def delete_document(
    filename: str,
    db: Session = Depends(get_db),
):
    """Delete an uploaded document and all associated data (chunks, vectors, page images)."""
    safe_filename = sanitize_filename(filename)
    if not safe_filename:
        raise HTTPException(status_code=400, detail="Invalid filename")

    file_path = DOCS_DIR / safe_filename

    # Delete chunks from PostgreSQL
    deleted_chunks = db.execute(
        text("SELECT COUNT(*) FROM document_chunks WHERE document_name = :name"),
        {"name": safe_filename}
    ).scalar() or 0
    if deleted_chunks:
        db.execute(
            text("DELETE FROM document_chunks WHERE document_name = :name"),
            {"name": safe_filename}
        )
        db.commit()

    # Delete vectors from Qdrant
    delete_by_filter("document_name", safe_filename)

    # Delete page images
    deleted_images = delete_page_images(safe_filename)

    # Delete PDF file (may not exist if auto-deleted after ingestion)
    pdf_deleted = False
    if file_path.exists():
        if file_path.resolve().parent != DOCS_DIR.resolve():
            raise HTTPException(status_code=400, detail="Invalid file path")
        file_path.unlink()
        pdf_deleted = True

    return {
        "message": f"Document '{safe_filename}' and all associated data deleted",
        "chunks_deleted": deleted_chunks,
        "images_deleted": deleted_images,
        "pdf_deleted": pdf_deleted,
    }


@router.get("/types")
async def get_document_types():
    """Get list of supported document types."""
    return {
        "types": [
            {"id": "manual", "name": "Owner's Manual", "description": "Vehicle owner's manual"},
            {"id": "qrg", "name": "Quick Reference Guide", "description": "Quick reference guide"},
            {"id": "carfax", "name": "CARFAX Report", "description": "Vehicle history report"},
            {"id": "maintenance_report", "name": "Maintenance Report", "description": "Service/maintenance records"},
            {"id": "other", "name": "Other", "description": "Other vehicle documents"},
        ]
    }


@router.get("/ingested", response_model=List[IngestedDocumentInfo])
async def list_ingested_documents(db: Session = Depends(get_db)):
    """List all documents ingested into the vector database with metadata."""
    results = db.execute(
        text("""
        SELECT
            dc.document_name,
            dc.document_type,
            COUNT(*) as chunk_count,
            COUNT(DISTINCT dc.page_number) as page_count,
            COALESCE(
                (SELECT array_agg(DISTINCT t)
                 FROM document_chunks dc2,
                      LATERAL unnest(dc2.topics) as t
                 WHERE dc2.document_name = dc.document_name),
                ARRAY[]::text[]
            ) as topics
        FROM document_chunks dc
        GROUP BY dc.document_name, dc.document_type
        ORDER BY dc.document_name
        """)
    ).fetchall()

    ingested = []
    for r in results:
        file_path = DOCS_DIR / r.document_name
        ingested.append(IngestedDocumentInfo(
            document_name=r.document_name,
            document_type=r.document_type or get_document_type(r.document_name),
            chunk_count=r.chunk_count,
            page_count=r.page_count,
            topics=r.topics or [],
            on_disk=file_path.exists(),
        ))
    return ingested


@router.post("/ingest")
async def ingest_documents(
    db: Session = Depends(get_db),
):
    """Ingest all uploaded documents into the vector database with topic tagging."""
    results = ingest_all_documents(db, str(DOCS_DIR))

    total_chunks = sum(v for v in results.values() if isinstance(v, int))

    return {
        "message": f"Ingestion complete. {total_chunks} chunks created from {len(results)} documents.",
        "documents": results
    }


@router.get("/ingest/status")
async def get_ingestion_status(
    db: Session = Depends(get_db)
):
    """Get current ingestion status and document chunk statistics."""
    # Get total chunks
    total = db.execute(text("SELECT COUNT(*) FROM document_chunks")).scalar() or 0

    # Get chunks by document
    by_document = db.execute(
        text("""
        SELECT document_name, COUNT(*) as chunks
        FROM document_chunks
        GROUP BY document_name
        ORDER BY document_name
        """)
    ).fetchall()

    # Get chunks by topic
    by_topic = db.execute(
        text("""
        SELECT unnest(topics) as topic, COUNT(*) as chunks
        FROM document_chunks
        GROUP BY topic
        ORDER BY chunks DESC
        """)
    ).fetchall()

    return {
        "total_chunks": total,
        "by_document": {r.document_name: r.chunks for r in by_document},
        "by_topic": {r.topic: r.chunks for r in by_topic}
    }
