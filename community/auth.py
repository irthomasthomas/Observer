# auth.py

import os
from fastapi import Request, HTTPException, status, Depends
from jose import jwt, JWTError
import requests
import logging
from typing import Annotated

# Setup logger for this module
logger = logging.getLogger('auth_validator')

# --- Configuration ---
AUTH0_DOMAIN = os.environ.get("AUTH0_DOMAIN", "auth.observer-ai.com")
API_AUDIENCE = os.environ.get("API_AUDIENCE", "https://api.observer-ai.com")
ALGORITHMS = ["RS256"]

# --- JWKS (JSON Web Key Set) Caching ---
jwks_url = f"https://{AUTH0_DOMAIN}/.well-known/jwks.json"
try:
    jwks = requests.get(jwks_url).json()
    logger.info("Successfully fetched JWKS from Auth0.")
except Exception as e:
    logger.critical(f"Failed to fetch JWKS from {jwks_url}. Auth will not work. Error: {e}")
    jwks = {}

# --- The FastAPI Dependency ---
async def get_current_user(request: Request) -> str:
    """
    A FastAPI dependency that validates the Authorization token,
    and returns the user's ID (sub) if successful.
    Raises HTTPException if validation fails.
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    
    try:
        auth_header = request.headers.get("Authorization")
        if not auth_header or not auth_header.startswith("Bearer "):
            raise credentials_exception

        token = auth_header.split(" ")[1]

        if 'keys' not in jwks:
            logger.error("JWKS not available for token validation.")
            raise credentials_exception

        unverified_header = jwt.get_unverified_header(token)
        rsa_key = next((key for key in jwks["keys"] if key["kid"] == unverified_header.get("kid")), None)

        if not rsa_key:
            logger.warning("Public key not found for token.")
            raise credentials_exception

        payload = jwt.decode(
            token, rsa_key, algorithms=ALGORITHMS,
            audience=API_AUDIENCE, issuer=f"https://{AUTH0_DOMAIN}/"
        )
        
        user_id = payload.get("sub")
        if user_id is None:
            raise credentials_exception
            
        return user_id

    except JWTError as e:
        logger.warning(f"JWT Validation Failed: {e}")
        raise credentials_exception
    except Exception:
        raise credentials_exception

# A convenient type hint for dependency injection in endpoints
AuthUser = Annotated[str, Depends(get_current_user)]
