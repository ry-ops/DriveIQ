#!/usr/bin/env python3
"""
Script to ingest PDF documents and create vector embeddings.
Uses local sentence-transformers for embeddings (no API key needed).
"""

import os
import sys
from pathlib import Path

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent / "backend"))

from pypdf import PdfReader
from sentence_transformers import SentenceTransformer
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

# Configuration
DOCS_DIR = Path(__file__).parent.parent / "docs"
CHUNK_SIZE = 500  # characters (approximate)
CHUNK_OVERLAP = 50  # characters
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://localhost/driveiq")

# Initialize embedding model
print("Loading embedding model...")
embedding_model = SentenceTransformer('all-MiniLM-L6-v2')
print("Model loaded!")


def chunk_text(text: str, chunk_size: int = CHUNK_SIZE, overlap: int = CHUNK_OVERLAP) -> list[str]:
    """Split text into overlapping chunks by character count."""
    words = text.split()
    chunks = []
    current_chunk = []
    current_length = 0

    for word in words:
        word_length = len(word) + 1  # +1 for space
        if current_length + word_length > chunk_size and current_chunk:
            chunk_text = " ".join(current_chunk)
            chunks.append(chunk_text)

            # Keep overlap
            overlap_words = []
            overlap_length = 0
            for w in reversed(current_chunk):
                if overlap_length + len(w) + 1 > overlap:
                    break
                overlap_words.insert(0, w)
                overlap_length += len(w) + 1

            current_chunk = overlap_words
            current_length = overlap_length

        current_chunk.append(word)
        current_length += word_length

    if current_chunk:
        chunks.append(" ".join(current_chunk))

    return chunks


def extract_pdf_text(pdf_path: Path) -> list[tuple[int, str]]:
    """Extract text from PDF, returning list of (page_number, text) tuples."""
    reader = PdfReader(pdf_path)
    pages = []

    for i, page in enumerate(reader.pages):
        text = page.extract_text()
        if text and text.strip():
            pages.append((i + 1, text.strip()))

    return pages


def extract_markdown_text(md_path: Path) -> list[tuple[int, str]]:
    """Extract text from markdown file, returning list of (section_number, text) tuples."""
    with open(md_path, 'r', encoding='utf-8') as f:
        content = f.read()

    # Split by headers to create logical sections
    sections = []
    current_section = []
    section_num = 1

    for line in content.split('\n'):
        if line.startswith('#') and current_section:
            # Save current section
            section_text = '\n'.join(current_section).strip()
            if section_text:
                sections.append((section_num, section_text))
                section_num += 1
            current_section = [line]
        else:
            current_section.append(line)

    # Don't forget the last section
    if current_section:
        section_text = '\n'.join(current_section).strip()
        if section_text:
            sections.append((section_num, section_text))

    return sections


def get_embedding(text: str) -> list[float]:
    """Get embedding for text using local model."""
    embedding = embedding_model.encode(text, convert_to_numpy=True)
    return embedding.tolist()


def ingest_document(
    file_path: Path,
    document_type: str,
    db_session
):
    """Ingest a single document (PDF or Markdown)."""
    print(f"Processing: {file_path.name}")

    # Extract text based on file type
    if file_path.suffix.lower() == '.pdf':
        pages = extract_pdf_text(file_path)
        print(f"  Extracted {len(pages)} pages")
    elif file_path.suffix.lower() in ['.md', '.markdown']:
        pages = extract_markdown_text(file_path)
        print(f"  Extracted {len(pages)} sections")
    else:
        print(f"  Unsupported file type: {file_path.suffix}")
        return

    # Process each page
    chunk_index = 0
    for page_num, page_text in pages:
        # Chunk the page text
        chunks = chunk_text(page_text)

        for chunk in chunks:
            # Get embedding
            embedding = get_embedding(chunk)
            tokens = len(chunk.split())  # Approximate token count

            # Insert into database
            embedding_str = "[" + ",".join(str(x) for x in embedding) + "]"
            db_session.execute(
                text("""
                INSERT INTO document_chunks
                (document_name, document_type, chunk_index, content, page_number, embedding, tokens)
                VALUES (:name, :type, :idx, :content, :page, CAST(:embedding AS vector), :tokens)
                """),
                {
                    "name": file_path.name,
                    "type": document_type,
                    "idx": chunk_index,
                    "content": chunk,
                    "page": page_num,
                    "embedding": embedding_str,
                    "tokens": tokens
                }
            )

            chunk_index += 1

    db_session.commit()
    print(f"  Created {chunk_index} chunks")


def main():
    """Main ingestion function."""
    # Initialize database connection
    engine = create_engine(DATABASE_URL)
    Session = sessionmaker(bind=engine)
    session = Session()

    # Check for documents directory
    if not DOCS_DIR.exists():
        print(f"Creating docs directory: {DOCS_DIR}")
        DOCS_DIR.mkdir(parents=True, exist_ok=True)

    # Find all PDF and markdown files in docs directory
    doc_files = list(DOCS_DIR.glob("*.pdf")) + list(DOCS_DIR.glob("*.md")) + list(DOCS_DIR.glob("*.markdown"))

    if not doc_files:
        print(f"No document files found in {DOCS_DIR}")
        print("Upload documents using the API or place them in the docs directory.")
        sys.exit(1)

    # Clear existing chunks
    session.execute(text("DELETE FROM document_chunks"))
    session.commit()
    print("Cleared existing document chunks")

    # Ingest each document
    for file_path in doc_files:
        # Determine document type from filename
        lower_name = file_path.name.lower()
        if "carfax" in lower_name:
            doc_type = "carfax"
        elif "manual" in lower_name:
            doc_type = "manual"
        elif "qrg" in lower_name or "quick reference" in lower_name:
            doc_type = "qrg"
        elif "maintenance" in lower_name or "audit" in lower_name:
            doc_type = "maintenance_report"
        else:
            doc_type = "other"

        ingest_document(file_path, doc_type, session)

    session.close()
    print("\nDocument ingestion complete!")


if __name__ == "__main__":
    main()
