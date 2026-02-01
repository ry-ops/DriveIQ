from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import logging

from app.api import vehicle, maintenance, reminders, search, uploads, auth, import_data, moe, pages
from app.core.config import settings
from app.core.rate_limit import RateLimitMiddleware
from app.core.database import check_database_health
from app.core.redis_client import check_redis_health
from app.core.qdrant_client import check_qdrant_health

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="DriveIQ API",
    description="AI-powered vehicle management API for 2018 Toyota 4Runner SR5 Premium",
    version="2.0.0",
    redirect_slashes=False,
)

# Rate limiting middleware
app.add_middleware(
    RateLimitMiddleware,
    requests_per_minute=settings.RATE_LIMIT_PER_MINUTE,
    requests_per_hour=settings.RATE_LIMIT_PER_HOUR,
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(auth.router, prefix="/api/auth", tags=["Authentication"])
app.include_router(vehicle.router, prefix="/api/vehicle", tags=["Vehicle"])
app.include_router(maintenance.router, prefix="/api/maintenance", tags=["Maintenance"])
app.include_router(reminders.router, prefix="/api/reminders", tags=["Reminders"])
app.include_router(search.router, prefix="/api/search", tags=["Search"])
app.include_router(uploads.router, prefix="/api/uploads", tags=["Uploads"])
app.include_router(import_data.router, prefix="/api/import", tags=["Import"])
app.include_router(moe.router, prefix="/api/moe", tags=["MoE"])
app.include_router(pages.router, prefix="/api/pages", tags=["Pages"])


@app.get("/")
async def root():
    return {"message": "DriveIQ API", "version": "2.0.0"}


@app.get("/health")
async def health_check():
    """
    Comprehensive health check endpoint.
    Returns status of all services: database, Redis, Qdrant.
    """
    db_health = check_database_health()
    redis_health = check_redis_health()
    qdrant_health = check_qdrant_health()

    # Overall status is unhealthy if any critical service is down
    # Database is critical, Redis and Qdrant are optional (degraded mode)
    if db_health["status"] != "healthy":
        overall_status = "unhealthy"
    elif redis_health["status"] != "healthy" or qdrant_health["status"] != "healthy":
        overall_status = "degraded"
    else:
        overall_status = "healthy"

    # Check API key configuration
    api_keys_configured = bool(settings.ANTHROPIC_API_KEY)

    return {
        "status": overall_status,
        "version": "2.0.0",
        "services": {
            "database": db_health,
            "redis": redis_health,
            "qdrant": qdrant_health,
        },
        "config": {
            "anthropic_api_key": "configured" if api_keys_configured else "missing",
        },
    }


@app.get("/health/live")
async def liveness_check():
    """Simple liveness probe for Kubernetes."""
    return {"status": "alive"}


@app.get("/health/ready")
async def readiness_check():
    """Readiness probe - checks if app can serve requests."""
    db_health = check_database_health()
    if db_health["status"] != "healthy":
        return {"status": "not_ready", "reason": "database_unavailable"}
    return {"status": "ready"}


@app.on_event("startup")
async def startup_event():
    """Application startup tasks."""
    logger.info("DriveIQ API starting up...")
    logger.info(f"Database: {settings.DATABASE_URL.split('@')[1] if '@' in settings.DATABASE_URL else 'localhost'}")
    logger.info(f"Redis: {settings.REDIS_URL}")
    logger.info(f"Qdrant: {settings.QDRANT_HOST}:{settings.QDRANT_PORT}")


@app.on_event("shutdown")
async def shutdown_event():
    """Application shutdown tasks."""
    logger.info("DriveIQ API shutting down...")
