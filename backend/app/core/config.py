from pydantic_settings import BaseSettings
from typing import List, Optional


class Settings(BaseSettings):
    # Database
    DATABASE_URL: str = "postgresql://driveiq:driveiq@localhost:5432/driveiq"
    DB_POOL_SIZE: int = 5
    DB_MAX_OVERFLOW: int = 10
    DB_POOL_TIMEOUT: int = 30
    DB_POOL_RECYCLE: int = 1800  # 30 minutes

    # Redis
    REDIS_URL: str = "redis://localhost:6379/0"
    REDIS_CACHE_TTL: int = 3600  # 1 hour default
    REDIS_SESSION_TTL: int = 86400  # 24 hours

    # Qdrant
    QDRANT_HOST: str = "localhost"
    QDRANT_PORT: int = 6333
    QDRANT_COLLECTION: str = "driveiq_documents"
    USE_QDRANT: bool = True  # Query Qdrant in addition to pgvector for RAG search

    # Security
    SECRET_KEY: str = "your-secret-key-change-in-production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30

    # AI APIs
    ANTHROPIC_API_KEY: str = ""  # Claude AI for reasoning (required for cloud, optional for local)
    ANTHROPIC_BASE_URL: str = ""  # Custom API endpoint (e.g., Docker Model Runner)
    USE_LOCAL_LLM: bool = False  # Use local LLM via Docker Model Runner
    LOCAL_LLM_MODEL: str = "ai/qwen3-coder"  # Default local model
    # Local embeddings - no API key needed (using sentence-transformers)

    # CORS
    CORS_ORIGINS: List[str] = ["http://localhost:3000", "http://localhost:5173"]

    # Vehicle Info
    VEHICLE_VIN: str = "JTEBU5JR2J5517128"
    VEHICLE_YEAR: int = 2018
    VEHICLE_MAKE: str = "Toyota"
    VEHICLE_MODEL: str = "4Runner"
    VEHICLE_TRIM: str = "SR5 Premium"

    # Rate Limiting
    RATE_LIMIT_PER_MINUTE: int = 60
    RATE_LIMIT_PER_HOUR: int = 1000

    class Config:
        env_file = ".env"
        case_sensitive = True


settings = Settings()
