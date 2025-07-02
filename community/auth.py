# auth.py

import os
from fastapi import Request, HTTPException, status, Depends
from jose import jwt
from jwt import PyJWKClient, PyJWTError
import logging
from typing import Annotated
from pydantic import BaseModel 

# Setup logger for this module
logger = logging.getLogger('auth_validator')

# --- Configuration ---
AUTH0_DOMAIN = os.environ.get("AUTH0_DOMAIN", "auth.observer-ai.com")
API_AUDIENCE = os.environ.get("API_AUDIENCE", "https://api.observer-ai.com")
ALGORITHMS = ["RS256"]
ISSUER = f"https://{AUTH0_DOMAIN}/"
# Define the custom claim namespace from your Auth0 Action
CUSTOM_CLAIM_NAMESPACE = f"https://{os.environ.get('APP_DOMAIN', 'observer-ai.com')}/"


# --- JWKS Client ---
jwks_url = f"https://{AUTH0_DOMAIN}/.well-known/jwks.json"
jwks_client = PyJWKClient(jwks_url, cache_jwk_set=True, lifespan=3600)

# --- Pydantic Model for User Data ---
# This creates a structured object to hold user info from the token.
class AuthenticatedUser(BaseModel):
    id: str
    is_pro: bool = False # Default to False for safety

# --- The Updated FastAPI Dependency ---
async def get_current_user(request: Request) -> AuthenticatedUser:
    """
    A FastAPI dependency that validates the Authorization token,
    and returns an AuthenticatedUser object with the user's ID and pro status.
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
        signing_key = jwks_client.get_signing_key_from_jwt(token)
        
        payload = jwt.decode(
            token,
            signing_key.key,
            algorithms=ALGORITHMS,
            audience=API_AUDIENCE,
            issuer=ISSUER,
            options={"verify_exp": True}
        )
        
        user_id = payload.get("sub")
        if user_id is None:
            logger.warning("Token is valid but 'sub' (user ID) is missing.")
            raise credentials_exception
        
        is_pro_claim = f"{CUSTOM_CLAIM_NAMESPACE}is_pro"
        is_pro_status = payload.get(is_pro_claim, False) # Safely get the value, default to False
        
        # Return the structured user data
        return AuthenticatedUser(id=user_id, is_pro=is_pro_status)

    except PyJWTError as e:
        logger.warning(f"JWT Validation Failed: {e}")
        raise credentials_exception
    except Exception as e:
        logger.error(f"An unexpected error occurred during auth: {e}", exc_info=True)
        raise credentials_exception

# --- UPDATED: The new type hint for dependency injection ---
AuthUser = Annotated[AuthenticatedUser, Depends(get_current_user)]
