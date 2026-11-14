#!/bin/bash
# Database setup script for 4Runner application

set -e

echo "Setting up PostgreSQL database for 4Runner..."

# Check if PostgreSQL is installed
if ! command -v psql &> /dev/null; then
    echo "PostgreSQL not found. Installing via Homebrew..."
    brew install postgresql@16
fi

# Check if pgvector is installed
if ! brew list pgvector &> /dev/null; then
    echo "pgvector not found. Installing via Homebrew..."
    brew install pgvector
fi

# Start PostgreSQL if not running
if ! brew services list | grep postgresql | grep started &> /dev/null; then
    echo "Starting PostgreSQL service..."
    brew services start postgresql@16
    sleep 2
fi

# Create database if it doesn't exist
if ! psql -lqt | cut -d \| -f 1 | grep -qw fourrunner; then
    echo "Creating database 'fourrunner'..."
    createdb fourrunner
else
    echo "Database 'fourrunner' already exists."
fi

# Enable pgvector extension
echo "Enabling pgvector extension..."
psql fourrunner -c "CREATE EXTENSION IF NOT EXISTS vector;" 2>/dev/null || true

# Run initialization script
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INIT_SQL="$SCRIPT_DIR/../database/init.sql"

if [ -f "$INIT_SQL" ]; then
    echo "Running database initialization script..."
    psql fourrunner -f "$INIT_SQL"
else
    echo "Warning: init.sql not found at $INIT_SQL"
fi

echo ""
echo "Database setup complete!"
echo ""
echo "Connection string: postgresql://localhost/fourrunner"
echo ""
echo "Next steps:"
echo "  1. Create a .env file with:"
echo "     DATABASE_URL=postgresql://localhost/fourrunner"
echo "     OPENAI_API_KEY=your-key"
echo "  2. Run the backend: cd backend && uvicorn app.main:app --reload"
echo "  3. Run the frontend: cd frontend && npm run dev"
