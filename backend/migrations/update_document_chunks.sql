-- Migration: Update document_chunks table for topic-filtered retrieval
-- Run this migration to update the schema for the enhanced MoE system

-- Drop and recreate the table with new schema
-- Note: This will delete existing data. Re-ingest documents after running this migration.

DROP TABLE IF EXISTS document_chunks;

CREATE TABLE document_chunks (
    id SERIAL PRIMARY KEY,

    -- Document info
    document_name VARCHAR(255) NOT NULL,
    document_type VARCHAR(50),

    -- Chunk details
    chunk_index INTEGER NOT NULL,
    content TEXT NOT NULL,
    page_number INTEGER,

    -- Vector embedding (sentence-transformers all-MiniLM-L6-v2 uses 384 dimensions)
    embedding vector(384),

    -- Topic metadata for filtered retrieval
    chapter VARCHAR(255),
    section VARCHAR(255),
    topics TEXT[],  -- Array of topic tags

    -- Metadata
    tokens INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better query performance
CREATE INDEX idx_document_chunks_document_name ON document_chunks(document_name);
CREATE INDEX idx_document_chunks_document_type ON document_chunks(document_type);
CREATE INDEX idx_document_chunks_topics ON document_chunks USING GIN(topics);

-- Create index for vector similarity search
CREATE INDEX idx_document_chunks_embedding ON document_chunks USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- Grant permissions
GRANT ALL PRIVILEGES ON document_chunks TO driveiq_user;
GRANT USAGE, SELECT ON SEQUENCE document_chunks_id_seq TO driveiq_user;
