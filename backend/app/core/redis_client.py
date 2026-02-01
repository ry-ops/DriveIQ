import json
import logging
from typing import Any, Optional
from functools import wraps
import hashlib

import redis
from redis.exceptions import ConnectionError, TimeoutError

from app.core.config import settings

logger = logging.getLogger(__name__)

# Redis client singleton
_redis_client: Optional[redis.Redis] = None


def get_redis() -> redis.Redis:
    """Get Redis client singleton."""
    global _redis_client
    if _redis_client is None:
        _redis_client = redis.from_url(
            settings.REDIS_URL,
            decode_responses=True,
            socket_timeout=5,
            socket_connect_timeout=5,
            retry_on_timeout=True,
        )
    return _redis_client


def check_redis_health() -> dict:
    """Check Redis connectivity and return health status."""
    try:
        client = get_redis()
        client.ping()
        info = client.info("memory")
        return {
            "status": "healthy",
            "connected": True,
            "used_memory": info.get("used_memory_human", "unknown"),
            "connected_clients": client.info("clients").get("connected_clients", 0),
        }
    except (ConnectionError, TimeoutError) as e:
        logger.error(f"Redis health check failed: {e}")
        return {
            "status": "unhealthy",
            "connected": False,
            "error": str(e),
        }
    except Exception as e:
        logger.error(f"Redis health check error: {e}")
        return {
            "status": "error",
            "connected": False,
            "error": str(e),
        }


class RedisCache:
    """Redis cache helper for common operations."""

    def __init__(self, prefix: str = "driveiq"):
        self.prefix = prefix
        self.client = get_redis()

    def _make_key(self, key: str) -> str:
        return f"{self.prefix}:{key}"

    def get(self, key: str) -> Optional[Any]:
        """Get value from cache."""
        try:
            data = self.client.get(self._make_key(key))
            if data:
                return json.loads(data)
            return None
        except Exception as e:
            logger.warning(f"Redis get error for {key}: {e}")
            return None

    def set(self, key: str, value: Any, ttl: Optional[int] = None) -> bool:
        """Set value in cache with optional TTL."""
        try:
            ttl = ttl or settings.REDIS_CACHE_TTL
            return self.client.setex(
                self._make_key(key), ttl, json.dumps(value)
            )
        except Exception as e:
            logger.warning(f"Redis set error for {key}: {e}")
            return False

    def delete(self, key: str) -> bool:
        """Delete key from cache."""
        try:
            return bool(self.client.delete(self._make_key(key)))
        except Exception as e:
            logger.warning(f"Redis delete error for {key}: {e}")
            return False

    def exists(self, key: str) -> bool:
        """Check if key exists."""
        try:
            return bool(self.client.exists(self._make_key(key)))
        except Exception as e:
            logger.warning(f"Redis exists error for {key}: {e}")
            return False


class EmbeddingCache(RedisCache):
    """Specialized cache for document embeddings."""

    def __init__(self):
        super().__init__(prefix="driveiq:embeddings")

    def _hash_text(self, text: str) -> str:
        return hashlib.sha256(text.encode()).hexdigest()[:16]

    def get_embedding(self, text: str) -> Optional[list]:
        """Get cached embedding for text."""
        key = self._hash_text(text)
        return self.get(key)

    def set_embedding(self, text: str, embedding: list, ttl: int = 86400) -> bool:
        """Cache embedding for text (default 24h TTL)."""
        key = self._hash_text(text)
        return self.set(key, embedding, ttl)


class SearchCache(RedisCache):
    """Cache for search results."""

    def __init__(self):
        super().__init__(prefix="driveiq:search")

    def _hash_query(self, query: str, filters: Optional[dict] = None) -> str:
        data = query + json.dumps(filters or {}, sort_keys=True)
        return hashlib.sha256(data.encode()).hexdigest()[:16]

    def get_results(self, query: str, filters: Optional[dict] = None) -> Optional[list]:
        """Get cached search results."""
        key = self._hash_query(query, filters)
        return self.get(key)

    def set_results(
        self, query: str, results: list, filters: Optional[dict] = None, ttl: int = 300
    ) -> bool:
        """Cache search results (default 5min TTL)."""
        key = self._hash_query(query, filters)
        return self.set(key, results, ttl)


class SessionStore(RedisCache):
    """Redis-backed session storage."""

    def __init__(self):
        super().__init__(prefix="driveiq:sessions")

    def create_session(self, user_id: str, data: dict) -> str:
        """Create a new session and return session ID."""
        import uuid

        session_id = str(uuid.uuid4())
        session_data = {"user_id": user_id, **data}
        self.set(session_id, session_data, ttl=settings.REDIS_SESSION_TTL)
        return session_id

    def get_session(self, session_id: str) -> Optional[dict]:
        """Get session data."""
        return self.get(session_id)

    def delete_session(self, session_id: str) -> bool:
        """Delete session (logout)."""
        return self.delete(session_id)

    def refresh_session(self, session_id: str) -> bool:
        """Refresh session TTL."""
        try:
            key = self._make_key(session_id)
            return bool(self.client.expire(key, settings.REDIS_SESSION_TTL))
        except Exception as e:
            logger.warning(f"Session refresh error: {e}")
            return False


class TokenBlacklist(RedisCache):
    """Blacklist for revoked JWT tokens."""

    def __init__(self):
        super().__init__(prefix="driveiq:blacklist")

    def blacklist_token(self, token: str, ttl: int) -> bool:
        """Add token to blacklist with TTL matching token expiry."""
        token_hash = hashlib.sha256(token.encode()).hexdigest()[:32]
        return self.set(token_hash, {"revoked": True}, ttl)

    def is_blacklisted(self, token: str) -> bool:
        """Check if token is blacklisted."""
        token_hash = hashlib.sha256(token.encode()).hexdigest()[:32]
        return self.exists(token_hash)


class DistributedRateLimiter:
    """Redis-based distributed rate limiter."""

    def __init__(self):
        self.client = get_redis()
        self.prefix = "driveiq:ratelimit"

    def is_allowed(
        self, identifier: str, limit: int, window_seconds: int
    ) -> tuple[bool, int]:
        """
        Check if request is allowed under rate limit.
        Returns (is_allowed, remaining_requests).
        """
        key = f"{self.prefix}:{identifier}:{window_seconds}"
        try:
            pipe = self.client.pipeline()
            pipe.incr(key)
            pipe.expire(key, window_seconds)
            results = pipe.execute()

            current_count = results[0]
            remaining = max(0, limit - current_count)
            return current_count <= limit, remaining
        except Exception as e:
            logger.warning(f"Rate limiter error: {e}")
            return True, limit  # Fail open if Redis is unavailable

    def get_remaining(self, identifier: str, limit: int, window_seconds: int) -> int:
        """Get remaining requests in window."""
        key = f"{self.prefix}:{identifier}:{window_seconds}"
        try:
            current = self.client.get(key)
            if current is None:
                return limit
            return max(0, limit - int(current))
        except Exception as e:
            logger.warning(f"Rate limiter get error: {e}")
            return limit


# Convenience instances
embedding_cache = EmbeddingCache()
search_cache = SearchCache()
session_store = SessionStore()
token_blacklist = TokenBlacklist()
rate_limiter = DistributedRateLimiter()
