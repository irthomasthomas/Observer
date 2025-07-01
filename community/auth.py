# auth.py

import os
from fastapi import Request, HTTPException, status, Depends
# The 'jose' library uses PyJWT under the hood. We can import PyJWKClient from it.
from jose import jwt
from jwt import PyJWKClient, PyJWTError # <-- CORRECT IMPORT
import logging
from typing import Annotated

# Setup logger for this module
logger = logging.getLogger('auth_validator')

# --- Configuration ---
AUTH0_DOMAIN = os.environ.get("AUTH0_DOMAIN", "auth.observer-ai.com")
API_AUDIENCE = os.environ.get("API_AUDIENCE", "https://api.observer-ai.com")
ALGORITHMS = ["RS256"]
ISSUER = f"https://{AUTH0_DOMAIN}/"

# --- JWKS Client (Handles Caching and Fetching Robustly) ---
# This client comes directly from the PyJWT library you already have.
jwks_url = f"https://{AUTH0_DOMAIN}/.well-known/jwks.json"
jwks_client = PyJWKClient(jwks_url, cache_jwk_set=True, lifespan=3600)

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
    
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        logger.warning("Authorization header is missing or does not start with Bearer")
        raise credentials_exception

    token = auth_header.split(" ")[1]

    try:
        # Get the signing key from the JWKS client.
        # This handles caching and refreshing automatically.
        signing_key = jwks_client.get_signing_key_from_jwt(token)

        # Decode the token using the key from the signing_key object
        # NOTE: We use jwt.decode from PyJWT here for consistency with the client.
        payload = jwt.decode(
            token,
            signing_key.key,
            algorithms=ALGORITHMS,
            audience=API_AUDIENCE,
            issuer=ISSUER,
            options={"verify_exp": True} # Explicitly verify expiration
        )
        
        user_id = payload.get("sub")
        if user_id is None:
            logger.warning("Token is valid but 'sub' (user ID) is missing.")
            raise credentials_exception
            
        return user_id

    # The client will raise its own error if it can't fetch keys
    # and PyJWT will raise JWTError for any validation issue (bad signature, expired, etc.)
    except PyJWTError as e:
        logger.warning(f"JWT Validation Failed: {e}")
        raise credentials_exception
    except Exception as e:
        logger.error(f"An unexpected error occurred during auth: {e}", exc_info=True)
        raise credentials_exception

# A convenient type hint for dependency injection in endpoints
AuthUser = Annotated[str, Depends(get_current_user)]
