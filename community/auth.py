# auth.py

import os
from fastapi import Request, HTTPException, status
from jose import jwt, JWTError
import requests
import logging

# Setup logger for this module
logger = logging.getLogger('auth_validator')

# --- Configuration ---
# These values MUST match your Auth0 settings
AUTH0_DOMAIN = os.environ.get("AUTH0_DOMAIN", "dev-mzdd3k678tj1ja86.us.auth0.com")
API_AUDIENCE = os.environ.get("API_AUDIENCE", "https://api.observer-ai.com")
ALGORITHMS = ["RS256"]

# --- JWKS (JSON Web Key Set) Caching ---
# We fetch the public keys from Auth0 and cache them so we don't do it on every request.
jwks_url = f"https://{AUTH0_DOMAIN}/.well-known/jwks.json"
try:
    jwks = requests.get(jwks_url).json()
    logger.info("Successfully fetched JWKS from Auth0.")
except Exception as e:
    logger.critical(f"Failed to fetch JWKS from {jwks_url}. Auth will not work. Error: {e}")
    jwks = {}

# --- The FastAPI Dependency ---
async def verify_token(request: Request):
    """
    A FastAPI dependency that verifies the Authorization token.
    For now, it only logs the result and does not block requests.
    """
    try:
        # 1. Get the token from the Authorization header
        auth_header = request.headers.get("Authorization")
        if not auth_header:
            # No token provided, just move on for now.
            return

        if not auth_header.startswith("Bearer "):
            logger.warning("Invalid Authorization header format. Missing 'Bearer ' prefix.")
            return

        token = auth_header.split(" ")[1]

        # 2. Find the right public key to use from the JWKS
        unverified_header = jwt.get_unverified_header(token)
        rsa_key = {}
        for key in jwks["keys"]:
            if key["kid"] == unverified_header["kid"]:
                rsa_key = {
                    "kty": key["kty"],
                    "kid": key["kid"],
                    "use": key["use"],
                    "n": key["n"],
                    "e": key["e"]
                }
        if not rsa_key:
            raise JWTError("Unable to find the appropriate public key.")

        # 3. Decode and validate the token
        payload = jwt.decode(
            token,
            rsa_key,
            algorithms=ALGORITHMS,
            audience=API_AUDIENCE,
            issuer=f"https://{AUTH0_DOMAIN}/"
        )
        
        # If we get here, the token is valid!
        user_id = payload.get("sub")
        logger.info(f"✅ Successfully validated JWT for user: {user_id}")

    except JWTError as e:
        # This catches all validation errors: bad signature, expired, wrong audience, etc.
        logger.warning(f"🚨 JWT Validation Failed: {e}")
    except Exception as e:
        # Catch any other unexpected errors during the process
        logger.error(f"🚨 An unexpected error occurred during token validation: {e}")

    # In this phase, we always continue, even if validation fails.
    return
