import os
import shutil
import re
from pathlib import Path
from fastapi import APIRouter, UploadFile, File, HTTPException, BackgroundTasks, Depends
from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import List
from pydantic import BaseModel

from app.core.security import get_current_user
from app.core.database import get_db
from app.services.document_ingestion import ingest_all_documents, ingest_document

router = APIRouter()

# Upload directories
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


def get_document_type(filename: str) -> str:
    """Determine document type from filename."""
    lower = filename.lower()
    if "carfax" in lower:
        return "carfax"
    elif "manual" in lower:
        return "manual"
    elif "qrg" in lower or "quick reference" in lower:
        return "qrg"
    elif "maintenance" in lower:
        return "maintenance_report"
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
    current_user: dict = Depends(get_current_user)
):
    """Upload a vehicle document (PDF). Requires authentication."""

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

    return UploadResponse(
        filename=safe_filename,
        size=len(content),
        message=f"File uploaded successfully. Run document ingestion to enable AI search."
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
    filename: str
):
    """Delete an uploaded document."""
    # Sanitize filename
    safe_filename = sanitize_filename(filename)
    if not safe_filename:
        raise HTTPException(status_code=400, detail="Invalid filename")

    file_path = DOCS_DIR / safe_filename

    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Document not found")

    # Security: ensure file is within docs directory
    if not file_path.resolve().parent == DOCS_DIR.resolve():
        raise HTTPException(status_code=400, detail="Invalid file path")

    file_path.unlink()

    return {"message": f"Document '{safe_filename}' deleted successfully"}


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


@router.post("/ingest")
async def ingest_documents(
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
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
