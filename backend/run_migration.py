"""Run database migrations."""
import sys
sys.path.insert(0, '/Users/ryandahlberg/Projects/DriveIQ/backend')

from sqlalchemy import create_engine, text
from app.core.config import settings

def add_tags_column():
    """Add tags column to maintenance_logs table."""
    engine = create_engine(settings.DATABASE_URL)

    with engine.connect() as conn:
        # Check if column exists
        result = conn.execute(text("""
            SELECT column_name FROM information_schema.columns
            WHERE table_name = 'maintenance_logs' AND column_name = 'tags'
        """))
        if result.fetchone():
            print("Tags column already exists")
            return

        # Add tags column
        conn.execute(text("ALTER TABLE maintenance_logs ADD COLUMN tags VARCHAR(500)"))
        conn.commit()
        print("Added tags column to maintenance_logs")

def run_migration():
    # Connect to database
    engine = create_engine(settings.DATABASE_URL)

    with engine.connect() as conn:
        # Drop and recreate table with new schema
        conn.execute(text("DROP TABLE IF EXISTS document_chunks"))

        conn.execute(text("""
        CREATE TABLE document_chunks (
            id SERIAL PRIMARY KEY,
            document_name VARCHAR(255) NOT NULL,
            document_type VARCHAR(50),
            chunk_index INTEGER NOT NULL,
            content TEXT NOT NULL,
            page_number INTEGER,
            embedding vector(384),
            chapter VARCHAR(255),
            section VARCHAR(255),
            topics TEXT[],
            tokens INTEGER,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )
        """))

        # Create indexes
        conn.execute(text("CREATE INDEX idx_document_chunks_document_name ON document_chunks(document_name)"))
        conn.execute(text("CREATE INDEX idx_document_chunks_document_type ON document_chunks(document_type)"))
        conn.execute(text("CREATE INDEX idx_document_chunks_topics ON document_chunks USING GIN(topics)"))

        conn.commit()
        print("Migration completed successfully!")

        # Check result
        result = conn.execute(text("SELECT column_name FROM information_schema.columns WHERE table_name = 'document_chunks'"))
        columns = [row[0] for row in result]
        print(f"Table columns: {columns}")

if __name__ == "__main__":
    run_migration()
