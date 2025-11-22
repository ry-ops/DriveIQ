#!/usr/bin/env python3
"""
Script to ingest PDF documents and create vector embeddings.
"""

import os
import sys
from pathlib import Path

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent / "backend"))

from pypdf import PdfReader
import openai
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
import tiktoken

# Configuration
DOCS_DIR = Path(__file__).parent.parent / "docs"
CHUNK_SIZE = 500  # tokens
CHUNK_OVERLAP = 50  # tokens
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://fourrunner:fourrunner@localhost:5432/fourrunner")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")


def get_token_count(text: str) -> int:
    """Count tokens in text using tiktoken."""
    encoding = tiktoken.encoding_for_model("text-embedding-ada-002")
    return len(encoding.encode(text))


def chunk_text(text: str, chunk_size: int = CHUNK_SIZE, overlap: int = CHUNK_OVERLAP) -> list[str]:
    """Split text into overlapping chunks by token count."""
    encoding = tiktoken.encoding_for_model("text-embedding-ada-002")
    tokens = encoding.encode(text)

    chunks = []
    start = 0

    while start < len(tokens):
        end = start + chunk_size
        chunk_tokens = tokens[start:end]
        chunk_text = encoding.decode(chunk_tokens)
        chunks.append(chunk_text)

        if end >= len(tokens):
            break

        start = end - overlap

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


def get_embedding(text: str, client: openai.OpenAI) -> list[float]:
    """Get embedding for text using OpenAI API."""
    response = client.embeddings.create(
        model="text-embedding-ada-002",
        input=text
    )
    return response.data[0].embedding


def ingest_document(
    pdf_path: Path,
    document_type: str,
    db_session,
    openai_client: openai.OpenAI
):
    """Ingest a single PDF document."""
    print(f"Processing: {pdf_path.name}")

    # Extract text from PDF
    pages = extract_pdf_text(pdf_path)
    print(f"  Extracted {len(pages)} pages")

    # Process each page
    chunk_index = 0
    for page_num, page_text in pages:
        # Chunk the page text
        chunks = chunk_text(page_text)

        for chunk in chunks:
            # Get embedding
            embedding = get_embedding(chunk, openai_client)
            tokens = get_token_count(chunk)

            # Insert into database
            db_session.execute(
                """
                INSERT INTO document_chunks
                (document_name, document_type, chunk_index, content, page_number, embedding, tokens)
                VALUES (:name, :type, :index, :content, :page, :embedding, :tokens)
                """,
                {
                    "name": pdf_path.name,
                    "type": document_type,
                    "index": chunk_index,
                    "content": chunk,
                    "page": page_num,
                    "embedding": str(embedding),
                    "tokens": tokens
                }
            )

            chunk_index += 1

    db_session.commit()
    print(f"  Created {chunk_index} chunks")


def main():
    """Main ingestion function."""
    if not OPENAI_API_KEY:
        print("Error: OPENAI_API_KEY environment variable not set")
        sys.exit(1)

    # Initialize clients
    openai_client = openai.OpenAI(api_key=OPENAI_API_KEY)
    engine = create_engine(DATABASE_URL)
    Session = sessionmaker(bind=engine)
    session = Session()

    # Define documents to ingest
    documents = [
        ("4Runner Manual.pdf", "manual"),
        ("4Runner QRG.pdf", "qrg"),
        ("2018_Toyota_4Runner_Maintenance_Report.pdf", "maintenance_report"),
        ("CARFAX Vehicle History Report for this 2018 TOYOTA 4RUNNER SR5 PREMIUM_ JTEBU5JR2J5517128.pdf", "carfax"),
    ]

    # Clear existing chunks
    session.execute("DELETE FROM document_chunks")
    session.commit()
    print("Cleared existing document chunks")

    # Ingest each document
    for filename, doc_type in documents:
        pdf_path = DOCS_DIR / filename
        if pdf_path.exists():
            ingest_document(pdf_path, doc_type, session, openai_client)
        else:
            print(f"Warning: {filename} not found")

    session.close()
    print("\nDocument ingestion complete!")


if __name__ == "__main__":
    main()
