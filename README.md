# 4Runner

Vehicle management application for 2018 Toyota 4Runner SR5 Premium.

## Features

- **Vehicle Dashboard** - Overview of vehicle status and key metrics
- **Maintenance Tracking** - Log oil changes, tire rotations, and other maintenance
- **Reminder System** - Get notified for upcoming maintenance milestones
- **AI Consultation** - Query the owner's manual using natural language
- **Service History** - Pre-populated with CARFAX data

## Tech Stack

- **Frontend**: React + TypeScript
- **Backend**: FastAPI (Python)
- **Database**: PostgreSQL with pgvector
- **AI/ML**: OpenAI embeddings for document search

## Project Structure

```
4Runner/
├── backend/           # FastAPI application
│   ├── app/
│   │   ├── api/       # API routes
│   │   ├── core/      # Configuration and utilities
│   │   ├── models/    # SQLAlchemy models
│   │   ├── schemas/   # Pydantic schemas
│   │   └── services/  # Business logic
│   └── tests/
├── frontend/          # React application
│   └── src/
│       ├── components/
│       ├── pages/
│       ├── hooks/
│       ├── services/
│       └── types/
├── database/          # SQL migrations and seeds
├── docs/              # Vehicle manuals and documentation
├── scripts/           # Utility scripts
└── data/              # Data files
```

## Getting Started

### Prerequisites

- Python 3.11+
- Node.js 18+
- PostgreSQL 15+ with pgvector extension
- Docker (optional)

### Backend Setup

```bash
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

### Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

### Database Setup

```bash
# Using Docker
docker-compose up -d postgres

# Or install pgvector manually
# https://github.com/pgvector/pgvector
```

## Environment Variables

Create a `.env` file in the project root:

```env
DATABASE_URL=postgresql://user:password@localhost:5432/fourrunner
OPENAI_API_KEY=your-openai-key
SECRET_KEY=your-secret-key
```

## API Documentation

Once the backend is running, visit:
- Swagger UI: http://localhost:8000/docs
- ReDoc: http://localhost:8000/redoc

## License

Private project - All rights reserved
