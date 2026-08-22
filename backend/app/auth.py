from fastapi import HTTPException, Security
from fastapi.security import APIKeyHeader

from app.config import settings

api_key_header = APIKeyHeader(name="X-API-Key", auto_error=False)


async def require_api_key(key: str = Security(api_key_header)):
    if not settings.api_key or key != settings.api_key:
        raise HTTPException(status_code=401, detail="Invalid or missing API key")
