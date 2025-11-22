from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import vehicle, maintenance, reminders, search
from app.core.config import settings

app = FastAPI(
    title="4Runner API",
    description="Vehicle management API for 2018 Toyota 4Runner SR5 Premium",
    version="1.0.0",
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
app.include_router(vehicle.router, prefix="/api/vehicle", tags=["Vehicle"])
app.include_router(maintenance.router, prefix="/api/maintenance", tags=["Maintenance"])
app.include_router(reminders.router, prefix="/api/reminders", tags=["Reminders"])
app.include_router(search.router, prefix="/api/search", tags=["Search"])


@app.get("/")
async def root():
    return {"message": "4Runner API", "version": "1.0.0"}


@app.get("/health")
async def health_check():
    return {"status": "healthy"}
