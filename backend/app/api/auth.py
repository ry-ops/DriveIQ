"""Authentication API."""
from datetime import timedelta
from fastapi import APIRouter, HTTPException, status, Depends
from pydantic import BaseModel
from app.core.config import settings
from app.core.security import create_access_token, authenticate_user, create_user, get_current_user, init_default_user

router = APIRouter()
init_default_user()

class LoginRequest(BaseModel):
    username: str
    password: str

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"

@router.post("/login", response_model=TokenResponse)
async def login(request: LoginRequest):
    user = authenticate_user(request.username, request.password)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    token = create_access_token(data={"sub": user["username"]})
    return TokenResponse(access_token=token)

@router.post("/register")
async def register(request: LoginRequest):
    if len(request.password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters")
    try:
        return create_user(request.username, request.password)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.get("/me")
async def get_me(current_user: dict = Depends(get_current_user)):
    return {"username": current_user.get("sub")}
