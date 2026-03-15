<img src="https://github.com/ry-ops/DriveIQ/blob/main/4Runner.png" width="100%">

[![Version](https://img.shields.io/github/v/release/ry-ops/DriveIQ?style=flat-square)](https://github.com/ry-ops/DriveIQ/releases)
[![License](https://img.shields.io/github/license/ry-ops/DriveIQ?style=flat-square)](LICENSE)
[![Python](https://img.shields.io/badge/python-3.11+-blue?style=flat-square&logo=python&logoColor=white)](https://python.org)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.123+-009688?style=flat-square&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)


# DriveIQ

[![Security Scan](https://github.com/ry-ops/DriveIQ/actions/workflows/security-scan.yml/badge.svg)](https://github.com/ry-ops/DriveIQ/actions/workflows/security-scan.yml)

**Intelligent Vehicle Management Application** | v1.3.1

A full-stack application for tracking maintenance, managing service reminders, and consulting your vehicle's documentation using AI-powered search with RAG (Retrieval-Augmented Generation).

---

## Architecture

<p align="center">
  <img src="https://github.com/ry-ops/DriveIQ/blob/main/architecture.svg" width="100%">
</p>

---

## Features

### Core Features
- **Dashboard** - Vehicle overview with mileage tracking, maintenance forecast, CARFAX value estimate, and one-click reindexing
- **Maintenance Log** - Record oil changes, tire rotations, brake service, and more with cost tracking
- **Receipt/Document Uploads** - Attach PDFs, images, and receipts to maintenance records
- **Service Records** - Import CARFAX reports and track complete service history
- **Smart Reminders** - Date and mileage-based alerts with recurring support

### AI-Powered Features
- **Floating Chat Widget** - Ask questions about your vehicle from any page
- **Context-Aware Chat** - "Ask about this" button on maintenance records pre-fills contextual questions
- **Document Search** - Semantic search across owner's manual, QRG, and service records
- **RAG Integration** - Retrieval-Augmented Generation with source thumbnails
- **MoE System** - Mixture of Experts routing to specialized vehicle knowledge domains
- **Local LLM Support** - Run AI queries locally via Docker Model Runner with no cloud API costs

### Visual Features
- **Rich Maintenance Cards** - Expandable cards with related manual page thumbnails
- **Photo Management** - Upload before/after/general photos for maintenance records
- **Document Carousel** - Browse related manual pages in timeline view
- **Full-Size Image Modal** - Click any thumbnail to view full-size document pages

### Caching & Performance
- **LLM Response Cache** - Redis-backed cache for LLM responses to avoid redundant inference
- **Permanent Search Cache** - Vehicle queries and search results cached permanently in Redis
- **Embedding Cache** - Document embeddings cached to skip redundant computation
- **Cache-Aware Reindexing** - Stale LLM and search caches automatically flushed on document changes

### Auto-Ingestion
- **Automatic Document Processing** - Upload PDFs and they're automatically ingested into both PostgreSQL and Qdrant
- **Maintenance Record Embedding** - Service history is embedded into the vector store for RAG search (e.g., "when was my last brake job?")
- **Dual Vector Storage** - pgvector for PostgreSQL + Qdrant for high-performance similarity search
- **Background Processing** - Non-blocking document ingestion and maintenance re-embedding on CRUD operations

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 18, TypeScript, Vite, Tailwind CSS, TanStack Query |
| Backend | FastAPI, Python 3.11+, SQLAlchemy, Pydantic |
| Database | PostgreSQL 15+ with pgvector |
| Vector DB | Qdrant (optional, for high-performance search) |
| Cache | Redis (LLM responses, search results, embeddings, sessions, rate limiting) |
| AI | Docker Model Runner (local LLM), Local Embeddings (sentence-transformers) |
| Observability | Redis Insight (GUI dashboard) |

---

## Quick Start

### 1. Clone and Setup Database

```bash
git clone https://github.com/ry-ops/DriveIQ.git
cd DriveIQ

# Install PostgreSQL (macOS)
brew install postgresql@15
brew services start postgresql@15

# Create database
createdb driveiq
psql driveiq < database/init.sql
```

### 2. Configure Environment

Create `backend/.env`:

```env
# Database
DATABASE_URL=postgresql://localhost/driveiq

# Security
SECRET_KEY=your-secret-key-change-in-production
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30

# AI APIs
# ANTHROPIC_API_KEY=your-anthropic-api-key  # Not needed for local LLM

# Vector Database (optional)
QDRANT_HOST=localhost
QDRANT_PORT=6333
QDRANT_COLLECTION=driveiq_docs

# Redis
REDIS_URL=redis://localhost:6379

# Local LLM
USE_LOCAL_LLM=true
ANTHROPIC_BASE_URL=http://model-runner.docker.internal:12434
LOCAL_LLM_MODEL=ai/qwen3-coder

# Vehicle Info
VEHICLE_VIN=YOUR_VIN_HERE
VEHICLE_YEAR=2018
VEHICLE_MAKE=Toyota
VEHICLE_MODEL=4Runner
VEHICLE_TRIM=SR5 Premium
```

### 3. Start Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

Backend runs at: http://localhost:8000

**Default credentials**: admin / driveiq2024

### 4. Start Frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend runs at: http://localhost:3000

### 5. Ingest Vehicle Documents

```bash
# Place PDFs in /docs directory
python scripts/ingest_documents.py
```

This processes the PDFs in `/docs` and creates vector embeddings for AI search using local sentence-transformers (no API key required for embeddings).

---

## Project Structure

```
DriveIQ/
├── backend/                 # FastAPI application
│   ├── app/
│   │   ├── api/            # Route handlers
│   │   │   ├── auth.py
│   │   │   ├── vehicle.py
│   │   │   ├── maintenance.py  # + photo upload, related docs
│   │   │   ├── reminders.py
│   │   │   ├── search.py
│   │   │   ├── chat.py         # Chat widget endpoint
│   │   │   ├── uploads.py      # Auto-ingestion
│   │   │   ├── moe.py
│   │   │   └── import_data.py
│   │   ├── core/           # Config, database, security
│   │   │   ├── llm_client.py     # LLM abstraction (local inference)
│   │   │   ├── qdrant_client.py  # Qdrant integration
│   │   │   └── redis_client.py   # Caching, sessions, rate limiting
│   │   ├── models/         # SQLAlchemy models
│   │   ├── schemas/        # Pydantic schemas
│   │   └── services/       # Business logic
│   │       └── document_ingestion.py  # Dual vector ingestion
│   └── requirements.txt
├── frontend/               # React application
│   ├── src/
│   │   ├── components/     # Reusable components
│   │   │   ├── ChatWidget.tsx       # Floating chat
│   │   │   ├── MaintenanceCard.tsx  # Rich cards
│   │   │   └── ServiceHistoryTimeline.tsx
│   │   ├── context/
│   │   │   └── ChatContext.tsx      # Global chat state
│   │   ├── pages/          # Page components
│   │   ├── services/       # API client
│   │   └── types/          # TypeScript types
│   └── package.json
├── database/
│   └── init.sql           # Schema + seed data
├── docs/                   # Vehicle PDFs
│   ├── 4Runner Manual.pdf
│   ├── 4Runner QRG.pdf
│   └── CARFAX Report.pdf
└── scripts/
    └── ingest_documents.py # PDF embedding ingestion
```

---

## API Endpoints

### Authentication
- `POST /api/auth/login` - Login with username/password
- `POST /api/auth/register` - Register new user
- `GET /api/auth/me` - Get current user info

### Vehicle
- `GET /api/vehicle` - Get vehicle information
- `PATCH /api/vehicle` - Update vehicle details
- `PATCH /api/vehicle/mileage/{mileage}` - Quick mileage update

### Maintenance
- `GET /api/maintenance` - List all maintenance records
- `POST /api/maintenance` - Create new record (auto-syncs with reminders, re-embeds for RAG)
- `PATCH /api/maintenance/{id}` - Update record (re-embeds for RAG)
- `DELETE /api/maintenance/{id}` - Delete record (re-embeds for RAG)
- `POST /api/maintenance/reindex` - Manually trigger maintenance record re-embedding
- `GET /api/maintenance/types/summary` - Get summary by type
- `GET /api/maintenance/related-docs/{type}` - Get related manual pages (RAG)
- `POST /api/maintenance/{id}/documents` - Upload receipt/document
- `GET /api/maintenance/{id}/documents` - List documents for record
- `POST /api/maintenance/{id}/photos` - Upload photo (before/after/general)
- `GET /api/maintenance/{id}/photos` - List photos for record
- `DELETE /api/maintenance/{id}/photos/{filename}` - Delete photo

### Chat
- `POST /api/chat` - Send message to AI assistant (with session support)
- `DELETE /api/chat/{session_id}` - Clear chat session

### Service Records (CARFAX)
- `POST /api/import/carfax` - Import CARFAX PDF
- `GET /api/import/service-records` - List all service records
- `POST /api/import/service-record` - Add manual service record
- `GET /api/import/kpis` - Get maintenance KPIs

### Reminders
- `GET /api/reminders` - List reminders
- `GET /api/reminders/upcoming` - Get due/upcoming reminders
- `POST /api/reminders` - Create reminder
- `POST /api/reminders/{id}/complete` - Mark complete (handles recurrence)
- `DELETE /api/reminders/{id}` - Delete reminder

### Search & AI
- `POST /api/search` - Semantic search in documents
- `POST /api/search/ask` - AI-powered Q&A with RAG

### Uploads
- `GET /api/uploads` - List uploaded documents
- `POST /api/uploads` - Upload document (auto-ingests)
- `DELETE /api/uploads/{filename}` - Delete document

### MoE (Mixture of Experts)
- `POST /api/moe/ask` - Ask with automatic expert routing
- `POST /api/moe/feedback` - Submit response feedback
- `GET /api/moe/stats` - Get performance statistics
- `GET /api/moe/experts` - List available experts

**API Documentation**: http://localhost:8000/docs

---

## Database Schema

### Tables

- **vehicles** - Vehicle info, VIN, mileage tracking
- **maintenance_records** - Service history with costs, notes, and photos
- **maintenance_logs** - CARFAX imports and manual service records
- **reminders** - Date/mileage-based alerts with recurrence
- **document_chunks** - Vectorized PDF content (384-dim embeddings)

### pgvector

Uses cosine similarity for semantic search:
```sql
SELECT content, 1 - (embedding <=> CAST(:embedding AS vector)) as score
FROM document_chunks
ORDER BY embedding <=> CAST(:embedding AS vector)
LIMIT 5;
```

---

## AI Architecture

### Local Embeddings
- Model: `all-MiniLM-L6-v2` (sentence-transformers)
- Dimensions: 384
- No API key required for embeddings

### LLM Inference
- Docker Model Runner with OpenAI-compatible API (e.g., `ai/qwen3-coder`, `ai/glm-4.7-flash`, `ai/devstral-small-2`)
- Unified `llm_client.py` abstraction with automatic Redis response caching
- All inference runs locally — no cloud API keys or costs

### RAG Pipeline
1. User asks question or clicks "Ask about this"
2. Query embedded using sentence-transformers
3. Similar chunks retrieved from pgvector/Qdrant (includes embedded maintenance records)
4. LLM cache checked for identical prior queries
5. Context + question sent to local LLM via Docker Model Runner
6. Response cached and returned with source thumbnails

### MoE Experts
- **Maintenance Expert** - Service intervals, fluid specs, routine maintenance
- **Technical Expert** - Engine specs, towing capacity, electrical systems
- **Safety Expert** - Safety features, warnings, recalls, emergencies
- **General Assistant** - General vehicle questions

---

## Development

### Prerequisites

- macOS (for Homebrew setup) or manual PostgreSQL installation
- Python 3.11+
- Node.js 18+
- Docker Desktop with Model Runner enabled

### Running Tests

```bash
# Backend
cd backend
pytest

# Frontend
cd frontend
npm test
```

---

## Docker Deployment

```bash
# Start all services
docker-compose --profile local-llm up -d
```

Services:
| Service | URL | Purpose |
|---------|-----|---------|
| **frontend** | http://localhost:3000 | React app (nginx) |
| **backend** | http://localhost:8001 | FastAPI API |
| **postgres** | localhost:5432 | PostgreSQL + pgvector |
| **qdrant** | http://localhost:6333 | Vector similarity search |
| **redis** | localhost:6379 | Caching, sessions, rate limiting |
| **redis-insight** | http://localhost:5540 | Redis GUI dashboard |
| **model-runner** | localhost:12434 | Local LLM (optional, `--profile local-llm`) |

---

## Changelog

### v1.3.1 (2026-03-15)
- Added Docker Model Runner support for local LLM inference (no API key needed)
- Added LLM client abstraction layer (`llm_client.py`) for local inference
- Added Redis LLM response cache to avoid redundant inference calls
- Added Redis Insight GUI dashboard (port 5540)
- Added permanent Redis caching for vehicle queries and search results
- Added maintenance record embedding into vector store for RAG search
- Added dashboard "Reindex Docs" button with background re-embedding
- Added cache-aware reindexing with automatic stale cache flush
- Added `POST /api/maintenance/reindex` endpoint
- Maintenance CRUD operations now trigger background re-embedding
- Fixed chat close button visibility at all viewport sizes

### v1.1.0 (2026-02-03)
- Added floating chat widget with context-aware "Ask about this" integration
- Added rich MaintenanceCard component with related manual page thumbnails
- Added photo upload (before/after/general) for maintenance records
- Added document carousel to timeline view
- Added automatic document ingestion on upload
- Added dual vector storage (PostgreSQL + Qdrant)
- Added Redis session management for chat history
- Updated architecture diagram

### v1.0.0
- Initial release with maintenance tracking, reminders, and AI search

---

## Contributing

This is a personal vehicle management project. Feel free to fork and adapt for your own vehicle!

---

## License

MIT License - see [LICENSE](LICENSE) for details

---

Built with [Commit-Relay](https://github.com/ry-ops/commit-relay) and [Git-Steer](https://github.com/ry-ops/git-steer) by Ry-Ops
