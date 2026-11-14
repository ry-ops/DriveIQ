from sqlalchemy import Column, Integer, String, Text, DateTime
from sqlalchemy.dialects.postgresql import JSONB, ARRAY
from sqlalchemy.sql import func
from pgvector.sqlalchemy import Vector
from app.core.database import Base


class DocumentChunk(Base):
    __tablename__ = "document_chunks"

    id = Column(Integer, primary_key=True, index=True)

    # Document info
    document_name = Column(String(255), nullable=False, index=True)
    document_type = Column(String(50), index=True)  # manual, qrg, maintenance_report

    # Chunk details
    chunk_index = Column(Integer, nullable=False)
    content = Column(Text, nullable=False)
    page_number = Column(Integer)

    # Vector embedding (sentence-transformers all-MiniLM-L6-v2 uses 384 dimensions)
    embedding = Column(Vector(384))

    # Topic metadata for filtered retrieval
    chapter = Column(String(255))  # Chapter/section name from PDF
    section = Column(String(255))  # Subsection name
    topics = Column(ARRAY(String))  # Array of topic tags for filtering

    # Metadata
    tokens = Column(Integer)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
