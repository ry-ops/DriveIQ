from sqlalchemy import create_engine, event, text
from sqlalchemy.exc import OperationalError, DisconnectionError
from sqlalchemy.orm import sessionmaker, declarative_base
from sqlalchemy.pool import QueuePool
import logging

from app.core.config import settings

logger = logging.getLogger(__name__)

# Create engine with connection pooling
engine = create_engine(
    settings.DATABASE_URL,
    poolclass=QueuePool,
    pool_size=settings.DB_POOL_SIZE,
    max_overflow=settings.DB_MAX_OVERFLOW,
    pool_timeout=settings.DB_POOL_TIMEOUT,
    pool_recycle=settings.DB_POOL_RECYCLE,
    pool_pre_ping=True,  # Verify connections before use
    echo=False,
)


# Connection validation on checkout
@event.listens_for(engine, "connect")
def connect(dbapi_connection, connection_record):
    connection_record.info["pid"] = id(dbapi_connection)
    logger.debug(f"New database connection established: {connection_record.info['pid']}")


@event.listens_for(engine, "checkout")
def checkout(dbapi_connection, connection_record, connection_proxy):
    logger.debug(f"Connection checked out: {connection_record.info.get('pid')}")


@event.listens_for(engine, "checkin")
def checkin(dbapi_connection, connection_record):
    logger.debug(f"Connection checked in: {connection_record.info.get('pid')}")


SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def get_db():
    """Database session dependency with error handling."""
    db = SessionLocal()
    try:
        yield db
    except OperationalError as e:
        logger.error(f"Database operational error: {e}")
        db.rollback()
        raise
    except Exception as e:
        logger.error(f"Database error: {e}")
        db.rollback()
        raise
    finally:
        db.close()


def check_database_health() -> dict:
    """Check database connectivity and return health status."""
    try:
        with engine.connect() as conn:
            # Basic connectivity
            conn.execute(text("SELECT 1"))

            # Check pgvector extension
            result = conn.execute(
                text("SELECT 1 FROM pg_extension WHERE extname = 'vector'")
            )
            pgvector_installed = result.fetchone() is not None

            # Get pool stats
            pool_status = {
                "pool_size": engine.pool.size(),
                "checked_in": engine.pool.checkedin(),
                "checked_out": engine.pool.checkedout(),
                "overflow": engine.pool.overflow(),
            }

            return {
                "status": "healthy",
                "connected": True,
                "pgvector_installed": pgvector_installed,
                "pool": pool_status,
            }
    except OperationalError as e:
        logger.error(f"Database health check failed: {e}")
        return {
            "status": "unhealthy",
            "connected": False,
            "error": str(e),
        }
    except Exception as e:
        logger.error(f"Database health check error: {e}")
        return {
            "status": "error",
            "connected": False,
            "error": str(e),
        }
