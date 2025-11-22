from pydantic_settings import BaseSettings
from typing import List


class Settings(BaseSettings):
    # Database
    DATABASE_URL: str = "postgresql://fourrunner:fourrunner@localhost:5432/fourrunner"

    # Security
    SECRET_KEY: str = "your-secret-key-change-in-production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30

    # OpenAI
    OPENAI_API_KEY: str = ""

    # CORS
    CORS_ORIGINS: List[str] = ["http://localhost:3000", "http://localhost:5173"]

    # Vehicle Info
    VEHICLE_VIN: str = "JTEBU5JR2J5517128"
    VEHICLE_YEAR: int = 2018
    VEHICLE_MAKE: str = "Toyota"
    VEHICLE_MODEL: str = "4Runner"
    VEHICLE_TRIM: str = "SR5 Premium"

    class Config:
        env_file = ".env"
        case_sensitive = True


settings = Settings()
