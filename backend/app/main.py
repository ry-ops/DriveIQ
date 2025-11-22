from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import vehicle, maintenance, reminders, search, uploads, auth, import_data, moe
from app.core.config import settings
from app.core.rate_limit import RateLimitMiddleware

app = FastAPI(
    title="DriveIQ API",
    description="AI-powered vehicle management API for 2018 Toyota 4Runner SR5 Premium",
    version="1.0.0",
)

# Rate limiting middleware
app.add_middleware(RateLimitMiddleware, requests_per_minute=60, requests_per_hour=1000)

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


@app.get("/")
async def root():
    return {"message": "DriveIQ API", "version": "1.0.0"}


@app.get("/health")
async def health_check():
    return {"status": "healthy"}
