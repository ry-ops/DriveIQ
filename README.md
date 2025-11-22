<img src="https://github.com/ry-ops/4Runner/blob/main/4Runner.png" width="100%">

# DriveIQ

**Intelligent Vehicle Management Application**

A full-stack application for tracking maintenance, managing service reminders, and consulting your vehicle's documentation using AI-powered search.

---

## Features

- **Dashboard** - Vehicle overview with mileage tracking and maintenance stats
- **Maintenance Log** - Record oil changes, tire rotations, brake service, and more
- **Smart Reminders** - Date and mileage-based alerts with recurring support
- **AI Consultation** - Ask questions about your vehicle using natural language
- **Document Search** - Semantic search across owner's manual, QRG, and service records

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 18, TypeScript, Vite, Tailwind CSS, TanStack Query |
| Backend | FastAPI, Python 3.11+, SQLAlchemy, Pydantic |
| Database | PostgreSQL 16, pgvector |
| AI | OpenAI Embeddings (text-embedding-ada-002), GPT-4 |

---

## Quick Start

### 1. Clone and Setup Database

```bash
git clone https://github.com/ry-ops/4Runner.git
cd 4Runner

# Run database setup (installs PostgreSQL + pgvector if needed)
./scripts/setup-db.sh
```

### 2. Configure Environment

```bash
cp .env.example .env
# Edit .env with your OpenAI API key
```

Or create `.env` manually:
```env
DATABASE_URL=postgresql://localhost/fourrunner
OPENAI_API_KEY=sk-your-openai-api-key
SECRET_KEY=your-secret-key-for-jwt
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

### 4. Start Frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend runs at: http://localhost:3000

### 5. Ingest Vehicle Documents (Optional)

```bash
# Requires OPENAI_API_KEY in .env
python scripts/ingest_documents.py
```

This processes the PDFs in `/docs` and creates vector embeddings for AI search.

---

## Project Structure

```
4Runner/
├── backend/                 # FastAPI application
│   ├── app/
│   │   ├── api/            # Route handlers
│   │   │   ├── vehicle.py
│   │   │   ├── maintenance.py
│   │   │   ├── reminders.py
│   │   │   └── search.py
│   │   ├── core/           # Config, database
│   │   ├── models/         # SQLAlchemy models
│   │   └── schemas/        # Pydantic schemas
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
    ├── setup-db.sh        # Database setup
    └── ingest_documents.py # PDF embedding ingestion
```

---

## API Endpoints

### Vehicle
- `GET /api/vehicle` - Get vehicle information
- `PATCH /api/vehicle` - Update vehicle details
- `PATCH /api/vehicle/mileage/{mileage}` - Quick mileage update

### Maintenance
- `GET /api/maintenance` - List all maintenance records
- `POST /api/maintenance` - Create new record
- `PATCH /api/maintenance/{id}` - Update record
- `DELETE /api/maintenance/{id}` - Delete record
- `GET /api/maintenance/types/summary` - Get summary by type

### Reminders
- `GET /api/reminders` - List reminders
- `GET /api/reminders/upcoming` - Get due/upcoming reminders
- `POST /api/reminders` - Create reminder
- `POST /api/reminders/{id}/complete` - Mark complete (handles recurrence)
- `DELETE /api/reminders/{id}` - Delete reminder

### Search
- `POST /api/search` - Semantic search in documents
- `POST /api/search/ask` - AI-powered Q&A

**API Documentation**: http://localhost:8000/docs

---

## Vehicle Information

| Field | Value |
|-------|-------|
| VIN | XXXXXXXXXXXXXXXXX |
| Year | 2018 |
| Make | Toyota |
| Model | 4Runner |
| Trim | SR5 Premium |
| Engine | 4.0L V6 DOHC 24V |
| Transmission | 5-Speed Automatic |
| Drivetrain | 4WD |

---

## Database Schema

### Tables

- **vehicles** - Vehicle info, VIN, mileage tracking
- **maintenance_records** - Service history with costs and notes
- **reminders** - Date/mileage-based alerts with recurrence
- **document_chunks** - Vectorized PDF content (1536-dim embeddings)

### pgvector

Uses cosine similarity for semantic search:
```sql
SELECT content, 1 - (embedding <=> query_embedding) as score
FROM document_chunks
ORDER BY embedding <=> query_embedding
LIMIT 5;
```

---

## Development

### Prerequisites

- macOS (for Homebrew setup) or manual PostgreSQL installation
- Python 3.11+
- Node.js 18+
- OpenAI API key

### Running Tests

```bash
# Backend
cd backend
pytest

# Frontend
cd frontend
npm test
```

### Code Style

- **Backend**: Black, isort, mypy
- **Frontend**: ESLint, Prettier

---

## Deployment

### Environment Variables (Production)

```env
DATABASE_URL=postgresql://user:pass@host:5432/fourrunner
OPENAI_API_KEY=sk-...
SECRET_KEY=<generate-secure-key>
CORS_ORIGINS=["https://yourdomain.com"]
```

### Docker (Optional)

```bash
docker-compose up -d
```

---

## Contributing

This is a personal vehicle management project. Feel free to fork and adapt for your own vehicle!

---

## License

MIT License - see [LICENSE](LICENSE) for details

---

Built with Claude Code and commit-relay
