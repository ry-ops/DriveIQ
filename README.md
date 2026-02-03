<img src="https://github.com/ry-ops/DriveIQ/blob/main/4Runner.png" width="100%">

[\![Version](https://img.shields.io/github/v/release/ry-ops/DriveIQ?style=flat-square)](https://github.com/ry-ops/DriveIQ/releases)
[\![License](https://img.shields.io/github/license/ry-ops/DriveIQ?style=flat-square)](LICENSE)
[\![Python](https://img.shields.io/badge/python-3.11+-blue?style=flat-square&logo=python&logoColor=white)](https://python.org)
[\![FastAPI](https://img.shields.io/badge/FastAPI-0.123+-009688?style=flat-square&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)


# DriveIQ

[![Security Scan](https://github.com/ry-ops/DriveIQ/actions/workflows/security-scan.yml/badge.svg)](https://github.com/ry-ops/DriveIQ/actions/workflows/security-scan.yml)

**Intelligent Vehicle Management Application**

A full-stack application for tracking maintenance, managing service reminders, and consulting your vehicle's documentation using AI-powered search.

---

## Features

- **Dashboard** - Vehicle overview with mileage tracking, maintenance stats, and total spent KPI
- **Maintenance Log** - Record oil changes, tire rotations, brake service, and more with cost tracking
- **Receipt/Document Uploads** - Attach PDFs, images, and receipts to maintenance records
- **Service Records** - Import CARFAX reports and track complete service history
- **Smart Reminders** - Date and mileage-based alerts with recurring support
  - Auto-generate reminders from maintenance schedule
  - Auto-create maintenance log when reminders are completed
  - Auto-sync reminders when maintenance records are created
- **AI Consultation** - Ask questions about your vehicle using natural language
- **Document Search** - Semantic search across owner's manual, QRG, and service records
- **MoE System** - Mixture of Experts routing to specialized vehicle knowledge domains

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 18, TypeScript, Vite, Tailwind CSS, TanStack Query |
| Backend | FastAPI, Python 3.11+, SQLAlchemy, Pydantic |
| Database | PostgreSQL 15+, pgvector |
| AI | Claude AI (Anthropic), Local Embeddings (sentence-transformers) |

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
ANTHROPIC_API_KEY=your-anthropic-api-key

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
│   │   │   ├── maintenance.py
│   │   │   ├── reminders.py
│   │   │   ├── search.py
│   │   │   ├── moe.py
│   │   │   └── import_data.py
│   │   ├── core/           # Config, database, security
│   │   ├── models/         # SQLAlchemy models
│   │   ├── schemas/        # Pydantic schemas
│   │   └── services/       # Business logic
│   └── requirements.txt
├── frontend/               # React application
│   ├── src/
│   │   ├── components/     # Reusable components
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
- `POST /api/maintenance` - Create new record (auto-syncs with reminders)
- `PATCH /api/maintenance/{id}` - Update record
- `DELETE /api/maintenance/{id}` - Delete record
- `GET /api/maintenance/types/summary` - Get summary by type
- `POST /api/maintenance/{id}/documents` - Upload receipt/document
- `GET /api/maintenance/{id}/documents` - List documents for record
- `GET /api/maintenance/{id}/documents/{filename}/download` - Download document
- `DELETE /api/maintenance/{id}/documents/{filename}` - Delete document

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
- `POST /api/search/ask` - AI-powered Q&A with Claude

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
- **maintenance_records** - Service history with costs and notes
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

### Claude AI
- Model: `claude-sonnet-4-20250514`
- Used for: Q&A reasoning, expert responses
- Requires: Anthropic API key

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
- Anthropic API key

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

## Deployment

### Environment Variables (Production)

```env
DATABASE_URL=postgresql://user:pass@host:5432/driveiq
ANTHROPIC_API_KEY=sk-ant-...
SECRET_KEY=<generate-secure-key>
CORS_ORIGINS=["https://yourdomain.com"]
```

---

## Contributing

This is a personal vehicle management project. Feel free to fork and adapt for your own vehicle!

---

## License

MIT License - see [LICENSE](LICENSE) for details

---

Built with Claude Code and Commit-Relay by Ry-Ops
