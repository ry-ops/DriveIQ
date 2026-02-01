# DriveIQ - Intelligent Vehicle Management Application

## Project Overview

An intelligent web application for vehicle management. Features include maintenance tracking, service reminders, mileage updates, CARFAX import, and AI-powered consultation using the vehicle's owner manual with RAG (Retrieval Augmented Generation).

## Tech Stack

- **Frontend**: React + TypeScript + Vite + Tailwind CSS
- **Backend**: FastAPI (Python 3.11+)
- **Database**: PostgreSQL with pgvector extension
- **Cache**: Redis (sessions, rate limiting, embedding cache)
- **Vector DB**: Qdrant (semantic search)
- **AI**: Anthropic Claude for RAG, sentence-transformers for local embeddings
- **Container**: Docker Compose

## Project Structure

```
DriveIQ/
├── backend/           # FastAPI application
│   ├── app/
│   │   ├── api/       # API route handlers
│   │   ├── core/      # Config, database, redis, qdrant clients
│   │   ├── models/    # SQLAlchemy models
│   │   ├── schemas/   # Pydantic request/response schemas
│   │   ├── services/  # Business logic, embeddings, vector search
│   │   └── data/      # Static data (maintenance schedules)
│   └── requirements.txt
├── frontend/          # React application
│   ├── src/
│   │   ├── components/ # Reusable UI components
│   │   ├── pages/      # Page components
│   │   ├── services/   # API client
│   │   └── types/      # TypeScript interfaces
│   └── package.json
├── docker/            # Dockerfiles
│   ├── backend.Dockerfile
│   ├── frontend.Dockerfile
│   └── nginx.conf
├── mcp/               # MCP Server for Claude integration
│   └── server.py
├── database/          # SQL migrations and seeds
│   └── init.sql
├── docs/              # Vehicle PDFs (gitignored - PI data)
├── scripts/           # Utility scripts
│   └── ingest_documents.py
└── docker-compose.yml
```

## Services (Docker)

| Service | Port | Purpose |
|---------|------|---------|
| backend | 8001 | FastAPI API |
| frontend | 3000 | React app (nginx) |
| postgres | 5432 | PostgreSQL + pgvector |
| redis | 6379 | Caching, sessions |
| qdrant | 6333 | Vector similarity search |

## Key APIs

- `GET /health` - Comprehensive health check (DB, Redis, Qdrant)
- `GET/PATCH /api/vehicle` - Vehicle info and mileage updates
- `GET/POST/PATCH/DELETE /api/maintenance` - Maintenance records CRUD
- `GET/POST /api/reminders` - Service reminders with recurrence
- `POST /api/search` - Semantic search in documentation
- `POST /api/search/ask` - AI-powered Q&A with RAG
- `POST /api/import/carfax` - Import CARFAX PDF
- `POST /api/moe/ask` - Mixture of Experts routing

## Database Models

- **Vehicle**: VIN, make/model, mileage tracking
- **MaintenanceRecord**: Service history with costs, receipts
- **Reminder**: Date/mileage-based notifications with recurrence
- **DocumentChunk**: Vectorized PDF content (384-dim embeddings)

## MCP Server

The MCP server (`mcp/server.py`) exposes 10 tools for Claude Desktop:
- `driveiq_search` - Semantic document search
- `driveiq_ask` - RAG question answering
- `driveiq_get_vehicle` / `driveiq_update_mileage`
- `driveiq_get_maintenance` / `driveiq_add_maintenance`
- `driveiq_get_reminders` / `driveiq_smart_reminders`
- `driveiq_complete_reminder`
- `driveiq_moe_ask` - Expert routing

## Development Commands

```bash
# Start all services
docker-compose up -d

# Rebuild after changes
docker-compose up -d --build

# View logs
docker-compose logs -f backend

# Stop services
docker-compose down

# Ingest documents
docker-compose exec backend python scripts/ingest_documents.py
```

## Environment Variables

Required in `.env`:
- `ANTHROPIC_API_KEY` - For Claude AI (RAG)
- `DATABASE_URL` - PostgreSQL connection
- `REDIS_URL` - Redis connection
- `QDRANT_HOST` / `QDRANT_PORT` - Qdrant connection
- `SECRET_KEY` - JWT signing key

## Vehicle Data

- VIN: JTEBU5JR2J5517128
- Year: 2018
- Make: Toyota
- Model: 4Runner
- Trim: SR5 Premium

## Coding Standards

- FastAPI with type hints and Pydantic validation
- React functional components with hooks
- TanStack Query for server state management
- Tailwind CSS for styling (toyota-red theme)
- Redis caching for embeddings and search results
- Graceful degradation if Qdrant/Redis unavailable
