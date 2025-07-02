# auth0_manager.py

import requests
import os
import logging
from functools import lru_cache

logger = logging.getLogger(__name__)

# --- Configuration from Environment Variables ---
AUTH0_DOMAIN = os.environ.get("AUTH0_MGMT_DOMAIN") # e.g., your-tenant.us.auth0.com
MGMT_API_CLIENT_ID = os.environ.get("AUTH0_MGMT_CLIENT_ID")
MGMT_API_CLIENT_SECRET = os.environ.get("AUTH0_MGMT_CLIENT_SECRET")
# The audience for the Management API is always the API v2 endpoint
MGMT_API_AUDIENCE = f"https://{AUTH0_DOMAIN}/api/v2/"

@lru_cache(maxsize=1) # Simple in-memory cache to avoid re-fetching the token on every call
def _get_management_api_token() -> str:
    """
    Fetches an access token for the Auth0 Management API.
    The token is cached in memory to improve performance.
    """
    if not all([AUTH0_DOMAIN, MGMT_API_CLIENT_ID, MGMT_API_CLIENT_SECRET]):
        logger.error("Auth0 Management API credentials are not fully configured.")
        raise ValueError("Auth0 Management API credentials are not set in environment.")

    payload = {
        "client_id": MGMT_API_CLIENT_ID,
        "client_secret": MGMT_API_CLIENT_SECRET,
        "audience": MGMT_API_AUDIENCE,
        "grant_type": "client_credentials"
    }
    headers = {'content-type': "application/json"}
    
    try:
        response = requests.post(f"https://{AUTH0_DOMAIN}/oauth/token", json=payload, headers=headers)
        response.raise_for_status() # Raise an exception for HTTP errors (4xx or 5xx)
        logger.info("Successfully fetched Auth0 Management API token.")
        return response.json()["access_token"]
    except requests.exceptions.RequestException as e:
        logger.error(f"Failed to get Auth0 Management API token: {e}")
        raise

async def update_user_to_pro(user_id: str) -> bool:
    """
    Updates a user's app_metadata in Auth0 to set is_pro=true.
    The user_id should be the full Auth0 user ID (e.g., 'auth0|xxxxxxxx').
    """
    try:
        token = _get_management_api_token()
        headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
        url = f"{MGMT_API_AUDIENCE}users/{user_id}"
        
        payload = { "app_metadata": { "is_pro": True } }
        
        response = requests.patch(url, json=payload, headers=headers)
        response.raise_for_status()
        
        logger.info(f"Successfully updated user {user_id} to PRO in Auth0.")
        return True
    except Exception as e:
        logger.error(f"Failed to update user {user_id} in Auth0: {e}")
        # Optionally log response body for more details on failure
        if hasattr(e, 'response') and e.response is not None:
            logger.error(f"Auth0 Response: {e.response.text}")
        return False
