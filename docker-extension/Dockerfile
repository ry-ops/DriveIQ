# DriveIQ Docker Desktop Extension
# Multi-stage build: backend (Python/FastAPI) + UI (React/Vite)

# ── Stage 1: Build the UI ────────────────────────────────────────────
FROM node:20-alpine AS ui-builder

WORKDIR /ui
COPY docker-extension/ui/package.json docker-extension/ui/package-lock.json* ./
RUN npm install
COPY docker-extension/ui/ ./
RUN npm run build

# ── Stage 2: Build the backend ───────────────────────────────────────
FROM python:3.11-slim AS backend-builder

WORKDIR /app
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc g++ && rm -rf /var/lib/apt/lists/*

COPY backend/pyproject.toml backend/uv.lock ./
ENV UV_COMPILE_BYTECODE=1
ENV UV_LINK_MODE=copy
RUN uv sync --frozen --no-dev --no-install-project

# ── Stage 3: Final extension image ──────────────────────────────────
FROM python:3.11-slim

# Required Docker Desktop Extension labels
LABEL org.opencontainers.image.title="DriveIQ" \
      org.opencontainers.image.description="Intelligent Vehicle Management — track maintenance, smart reminders, and AI-powered vehicle documentation search" \
      org.opencontainers.image.vendor="ryops" \
      com.docker.desktop.extension.api.version=">= 0.3.3" \
      com.docker.desktop.extension.icon="https://raw.githubusercontent.com/ry-ops/DriveIQ/main/docker-extension/driveiq.svg" \
      com.docker.extension.screenshots='[{"alt":"Dashboard","url":"https://raw.githubusercontent.com/ry-ops/DriveIQ/main/docs/screenshots/dashboard.png"}]' \
      com.docker.extension.detailed-description="<p>DriveIQ brings intelligent vehicle management right into Docker Desktop. Track maintenance history, get smart service reminders based on mileage and time intervals, and ask AI-powered questions about your vehicle using RAG search over owner manuals and service records.</p>" \
      com.docker.extension.publisher-url="https://github.com/ry-ops/DriveIQ" \
      com.docker.extension.changelog="<p>1.0.0 - Initial Docker Desktop Extension release</p>" \
      com.docker.extension.categories='["utility-tools"]'

WORKDIR /app

# Install runtime deps
RUN apt-get update && apt-get install -y --no-install-recommends \
    postgresql-client && rm -rf /var/lib/apt/lists/*

# Copy backend venv and code
COPY --from=backend-builder /app/.venv /opt/venv
COPY backend/ /app/

# Create required directories
RUN mkdir -p /app/docs /app/uploads /app/page_images

# Set backend env
ENV PATH="/opt/venv/bin:$PATH"
ENV PYTHONUNBUFFERED=1
ENV PYTHONDONTWRITEBYTECODE=1

# Copy extension metadata and icon
COPY docker-extension/metadata.json /metadata.json
COPY docker-extension/docker-compose.yaml /docker-compose.yaml
COPY docker-extension/driveiq.svg /driveiq.svg

# Copy built UI
COPY --from=ui-builder /ui/build /ui

# Database init script
COPY database/init.sql /app/database/init.sql

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD /opt/venv/bin/python -c "import requests; requests.get('http://localhost:8000/health')" || exit 1

CMD ["/opt/venv/bin/python", "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
