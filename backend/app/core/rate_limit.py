"""Rate limiting middleware for API protection."""
import time
from collections import defaultdict
from typing import Dict, Tuple
from fastapi import Request, HTTPException
from starlette.middleware.base import BaseHTTPMiddleware


class RateLimiter:
    """Simple in-memory rate limiter."""

    def __init__(self, requests_per_minute: int = 60, requests_per_hour: int = 1000):
        self.requests_per_minute = requests_per_minute
        self.requests_per_hour = requests_per_hour
        self.minute_requests: Dict[str, list] = defaultdict(list)
        self.hour_requests: Dict[str, list] = defaultdict(list)

    def _clean_old_requests(self, requests: list, window: int) -> list:
        """Remove requests outside the time window."""
        current_time = time.time()
        return [t for t in requests if current_time - t < window]

    def is_allowed(self, client_id: str) -> Tuple[bool, str]:
        """Check if a request is allowed for the client."""
        current_time = time.time()

        # Clean old requests
        self.minute_requests[client_id] = self._clean_old_requests(
            self.minute_requests[client_id], 60
        )
        self.hour_requests[client_id] = self._clean_old_requests(
            self.hour_requests[client_id], 3600
        )

        # Check minute limit
        if len(self.minute_requests[client_id]) >= self.requests_per_minute:
            return False, f"Rate limit exceeded. Max {self.requests_per_minute} requests per minute."

        # Check hour limit
        if len(self.hour_requests[client_id]) >= self.requests_per_hour:
            return False, f"Rate limit exceeded. Max {self.requests_per_hour} requests per hour."

        # Record request
        self.minute_requests[client_id].append(current_time)
        self.hour_requests[client_id].append(current_time)

        return True, ""


class RateLimitMiddleware(BaseHTTPMiddleware):
    """FastAPI middleware for rate limiting."""

    def __init__(self, app, requests_per_minute: int = 60, requests_per_hour: int = 1000):
        super().__init__(app)
        self.limiter = RateLimiter(requests_per_minute, requests_per_hour)

    async def dispatch(self, request: Request, call_next):
        # Get client identifier (IP or user)
        client_id = request.client.host if request.client else "unknown"

        # Check if request is allowed
        allowed, message = self.limiter.is_allowed(client_id)

        if not allowed:
            raise HTTPException(status_code=429, detail=message)

        response = await call_next(request)
        return response
