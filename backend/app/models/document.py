from sqlalchemy import Column, Integer, String, Text, DateTime
from sqlalchemy.sql import func
from pgvector.sqlalchemy import Vector
from app.core.database import Base


class DocumentChunk(Base):
    __tablename__ = "document_chunks"

    id = Column(Integer, primary_key=True, index=True)

    # Document info
    document_name = Column(String(255), nullable=False)
    document_type = Column(String(50))  # manual, qrg, maintenance_report

    # Chunk details
    chunk_index = Column(Integer, nullable=False)
    content = Column(Text, nullable=False)
    page_number = Column(Integer)

    # Vector embedding (OpenAI ada-002 uses 1536 dimensions)
    embedding = Column(Vector(1536))

    # Metadata
    tokens = Column(Integer)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
