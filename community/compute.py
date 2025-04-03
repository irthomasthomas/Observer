# compute.py (Rewritten for Async Handlers)

from fastapi import APIRouter, Request, HTTPException
from fastapi.responses import Response, JSONResponse
# No httpx needed here anymore
import os
import sqlite3
import logging
import secrets
import json
import datetime


# Setup logging
logging.basicConfig(
    level=logging.INFO, # Or load from config/env var
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)
logger = logging.getLogger('compute_router')



# --- Observer AI Handler Integration ---
try:
    # Import api_handlers to trigger handler registration
    # Assumes api_handlers.py, gemini_handler.py, openrouter_handler.py are accessible
    import api_handlers
    # Import custom exceptions defined in api_handlers
    from api_handlers import HandlerError, ConfigError, BackendAPIError
    logger.info("Successfully imported api_handlers. Available handlers: %s", list(api_handlers.API_HANDLERS.keys()))
    HANDLERS_AVAILABLE = True
except ImportError as e:
    logger.error(f"Could not import api_handlers: {e}. Backend routing will not work.", exc_info=True)
    api_handlers = None # Indicate failure
    HandlerError = Exception # Define fallback exceptions if import fails
    ConfigError = Exception
    BackendAPIError = Exception
    HANDLERS_AVAILABLE = False
# --- End Integration ---

# Create router
compute_router = APIRouter()


# Configuration
DB_PATH = os.environ.get("QUOTA_DB_PATH", "quota.db")
FREE_QUOTA = int(os.environ.get("FREE_QUOTA", 10))

# --- Database and Auth (Simplified - keep your existing robust versions) ---
# Using context manager for DB connections is generally better practice
def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row # Optional: access columns by name
    return conn

def init_db():
    try:
        with get_db() as conn:
            cursor = conn.cursor()
            cursor.execute('CREATE TABLE IF NOT EXISTS request_count (ip TEXT PRIMARY KEY, count INTEGER NOT NULL)')
            cursor.execute('CREATE TABLE IF NOT EXISTS auth_codes (auth_code TEXT PRIMARY KEY)')
            cursor.execute('CREATE TABLE IF NOT EXISTS user_auth_mapping (user_id TEXT PRIMARY KEY, auth_code TEXT NOT NULL)')
            conn.commit()
            logger.info("Database initialized/verified.")
    except sqlite3.Error as e:
        logger.error(f"Database initialization error: {e}", exc_info=True)
        # Depending on severity, you might want to exit or disable quota features
        raise RuntimeError(f"Failed to initialize database at {DB_PATH}") from e

# Initialize DB on startup
try:
    init_db()
except RuntimeError:
     # Handle case where DB init fails if needed (e.g., disable DB-dependent routes)
     logger.critical("Database setup failed. Quota/Auth features may be unavailable.")


def is_valid_auth_code(auth_code: str) -> bool:
    if not auth_code: return False
    try:
        with get_db() as conn:
            cursor = conn.cursor()
            cursor.execute('SELECT 1 FROM auth_codes WHERE auth_code = ?', (auth_code,))
            return cursor.fetchone() is not None
    except sqlite3.Error as e:
        logger.error(f"Database error checking auth code: {e}")
        return False # Fail safe

def get_or_create_auth_code(user_id: str) -> str | None:
     if not user_id: return None
     try:
          with get_db() as conn:
               cursor = conn.cursor()
               # Check existing mapping first
               cursor.execute('SELECT auth_code FROM user_auth_mapping WHERE user_id = ?', (user_id,))
               result = cursor.fetchone()
               if result:
                    return result['auth_code']
               else:
                    # Generate new code and store it
                    new_code = secrets.token_hex(16)
                    # Use transactions for multi-step operations
                    conn.execute('BEGIN')
                    try:
                         conn.execute('INSERT OR IGNORE INTO auth_codes (auth_code) VALUES (?)', (new_code,))
                         conn.execute('INSERT INTO user_auth_mapping (user_id, auth_code) VALUES (?, ?)', (user_id, new_code))
                         conn.commit()
                         logger.info(f"Generated new auth code for user_id: {user_id}")
                         return new_code
                    except sqlite3.Error:
                         conn.rollback()
                         logger.exception(f"Failed to store new auth code for user_id: {user_id}")
                         return None
     except sqlite3.Error as e:
          logger.error(f"Database error getting/creating auth code for user {user_id}: {e}")
          return None


def check_and_increment_quota(ip: str) -> bool:
    """ Returns True if quota is available, False otherwise. Increments if available."""
    if not ip: return False # Cannot check quota without IP
    try:
        with get_db() as conn:
             cursor = conn.cursor()
             cursor.execute('SELECT count FROM request_count WHERE ip = ?', (ip,))
             result = cursor.fetchone()
             count = result['count'] if result else 0

             if count >= FREE_QUOTA:
                  logger.warning(f"Quota exceeded for IP: {ip} (Used: {count}, Limit: {FREE_QUOTA})")
                  return False # Quota exceeded
             else:
                  # Increment count
                  cursor.execute('INSERT OR IGNORE INTO request_count (ip, count) VALUES (?, 0)', (ip,))
                  cursor.execute('UPDATE request_count SET count = count + 1 WHERE ip = ?', (ip,))
                  conn.commit()
                  logger.debug(f"Quota check passed for IP: {ip} (New count: {count + 1})")
                  return True # Quota available
    except sqlite3.Error as e:
         logger.error(f"Database error checking/incrementing quota for IP {ip}: {e}")
         return False # Fail safe (treat as quota exceeded on DB error)

def get_quota_status(ip: str) -> dict:
     if not ip: return {"used": 0, "remaining": FREE_QUOTA, "limit": FREE_QUOTA}
     try:
          with get_db() as conn:
               cursor = conn.cursor()
               cursor.execute('SELECT count FROM request_count WHERE ip = ?', (ip,))
               result = cursor.fetchone()
               count = result['count'] if result else 0
               return {"used": count, "remaining": max(0, FREE_QUOTA - count), "limit": FREE_QUOTA}
     except sqlite3.Error as e:
          logger.error(f"Database error getting quota status for IP {ip}: {e}")
          # Return default/error state
          return {"used": 0, "remaining": 0, "limit": FREE_QUOTA, "error": "Could not query quota"}

def get_client_ip(request: Request):
    """Get client IP, respecting X-Forwarded-For header."""
    x_forwarded_for = request.headers.get("X-Forwarded-For")
    if x_forwarded_for:
        # Take the first IP in the list (client's IP)
        ip = x_forwarded_for.split(",")[0].strip()
    elif request.client:
        ip = request.client.host
    else:
        ip = None # Should not happen with standard ASGI servers
    return ip

# --- API Routes ---

@compute_router.post("/auth/register", summary="Register or retrieve an auth code for a user ID")
async def register_auth_endpoint(request: Request):
    try:
        data = await request.json()
        user_id = data.get("user_id")
        if not user_id or not isinstance(user_id, str):
            raise HTTPException(status_code=400, detail="Missing or invalid 'user_id' (must be a string)")

        auth_code = get_or_create_auth_code(user_id)

        if auth_code:
            return JSONResponse({"auth_code": auth_code})
        else:
            # This indicates a server-side DB issue usually
            raise HTTPException(status_code=500, detail="Auth code registration failed due to a server error.")

    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON body")
    except HTTPException as e:
        raise e # Re-raise known HTTP exceptions
    except Exception as e:
        logger.exception("Error during auth registration")
        raise HTTPException(status_code=500, detail="An unexpected error occurred during registration.")


@compute_router.get("/quota", summary="Check remaining API quota")
async def check_quota_endpoint(request: Request):
    auth_code = request.headers.get("X-Observer-Auth-Code")

    if auth_code and is_valid_auth_code(auth_code):
        # Authenticated users have "unlimited" quota in this model
        return JSONResponse({
            "limit": None, # Indicate no limit applies
            "remaining": None,
            "used": None,
            "authenticated": True
        })
    else:
        # Unauthenticated users are subject to IP-based quota
        ip = get_client_ip(request)
        if not ip:
             raise HTTPException(status_code=400, detail="Could not determine client IP address.")

        quota_info = get_quota_status(ip)
        quota_info["authenticated"] = False
        return JSONResponse(quota_info)


@compute_router.post("/v1/chat/completions", summary="Process chat completion requests")
async def handle_chat_completions_endpoint(request: Request):
    if not HANDLERS_AVAILABLE:
         raise HTTPException(status_code=503, detail="Backend LLM handlers are not configured or available.")

    # 1. Authentication & Quota Check
    auth_code = request.headers.get("X-Observer-Auth-Code")
    is_authenticated = auth_code and is_valid_auth_code(auth_code)

    if not is_authenticated:
        ip = get_client_ip(request)
        if not ip:
             raise HTTPException(status_code=400, detail="Could not determine client IP for quota check.")
        if not check_and_increment_quota(ip):
             # check_and_increment_quota already logged the reason
             raise HTTPException(status_code=429, detail="Free quota exceeded. Please authenticate.") # 429 Too Many Requests

    # 2. Parse Request Data
    try:
        request_data = await request.json()
        model_name = request_data.get("model")
        if not model_name:
            raise HTTPException(status_code=400, detail="Request body must include a 'model' field.")
        if not isinstance(request_data.get("messages"), list) or not request_data["messages"]:
             raise HTTPException(status_code=400, detail="Request body must include a non-empty 'messages' array.")

    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON request body.")
    except Exception as e:
        logger.error(f"Error parsing request body: {e}", exc_info=True)
        raise HTTPException(status_code=400, detail="Could not process request body.")

    # 3. Find the appropriate handler
    selected_handler = None
    if api_handlers: # Check if handlers were loaded
        for handler in api_handlers.API_HANDLERS.values():
            # Simple name match for now, could be more complex (e.g., checking prefixes)
            supported = [m["name"] for m in handler.get_models()]
            if model_name in supported:
                selected_handler = handler
                break

    if not selected_handler:
        logger.warning(f"Request for unsupported model: {model_name}")
        raise HTTPException(status_code=400, detail=f"Model '{model_name}' is not supported by this server.")

    # 4. Execute handler logic DIRECTLY using await
    logger.info(f"Routing request for model '{model_name}' to handler '{selected_handler.name}'.")
    try:
        # Directly await the async handler method
        response_payload = await selected_handler.handle_request(request_data)

        # 5. Return Successful Response
        return JSONResponse(content=response_payload)

    # --- Handle Exceptions Raised by the Handler ---
    except ConfigError as e:
        logger.error(f"Configuration error in handler {selected_handler.name}: {e}")
        # Return 500 as it's a server config issue
        raise HTTPException(status_code=500, detail=f"Server configuration error: {e}")
    except BackendAPIError as e:
        logger.error(f"Backend API error from handler {selected_handler.name} (Status: {e.status_code}): {e}")
        # Use the status code reported by the handler (e.g., 502, 4xx from downstream)
        raise HTTPException(status_code=e.status_code, detail=f"Backend service error: {e}")
    except ValueError as e:
        logger.warning(f"Invalid request data for handler {selected_handler.name}: {e}")
        raise HTTPException(status_code=400, detail=f"Invalid request: {e}")
    except HandlerError as e: # Catch other custom handler errors
         logger.error(f"Handler error in {selected_handler.name} (Status: {e.status_code}): {e}")
         raise HTTPException(status_code=e.status_code, detail=f"Handler error: {e}")
    except NotImplementedError:
        logger.error(f"Handler {selected_handler.name} has not implemented handle_request.")
        raise HTTPException(status_code=501, detail="Handler not implemented.")
    # --- Catch Other Unexpected Errors ---
    except Exception as e:
        logger.exception(f"Unexpected error processing request with handler {selected_handler.name} for model {model_name}")
        raise HTTPException(status_code=500, detail="An internal server error occurred.")


# --- Model Listing Endpoints (Mostly Unchanged) ---

@compute_router.get("/api/models", summary="List all available models")
async def list_models_endpoint():
    if not HANDLERS_AVAILABLE:
         raise HTTPException(status_code=503, detail="Backend handlers are not available.")
    models = []
    # Ensure API_HANDLERS is accessible
    if api_handlers and api_handlers.API_HANDLERS:
        for handler in api_handlers.API_HANDLERS.values():
            try:
                 models.extend(handler.get_models())
            except Exception as e:
                 logger.error(f"Failed to get models from handler {handler.name}: {e}")
                 # Optionally add an error marker for this handler's models
    else:
        logger.warning("/api/models called but no handlers are loaded.")

    return JSONResponse(content={"models": models})


@compute_router.get("/api/tags", summary="List available models (Ollama compatible format)")
async def list_tags_endpoint():
    if not HANDLERS_AVAILABLE:
         raise HTTPException(status_code=503, detail="Backend handlers are not available.")

    ollama_models = []
    if api_handlers and api_handlers.API_HANDLERS:
        for handler in api_handlers.API_HANDLERS.values():
            try:
                for model_info in handler.get_models():
                     # Basic mapping, add more fields if your get_models provides them
                     model_entry = {
                          "name": model_info.get("name", "unknown"),
                          "model": model_info.get("name", "unknown"),
                          "modified_at": model_info.get("modified_at", datetime.datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%S.%fZ")),
                          "size": model_info.get("size_bytes", 0), # Placeholder size
                          "digest": model_info.get("digest", ""), # Placeholder digest
                          "details": {
                               "parameter_size": model_info.get("parameters", "N/A"),
                               "quantization_level": model_info.get("quantization", "N/A"),
                               "family": model_info.get("family", handler.name), # Use handler name as family default
                               "format": model_info.get("format", "N/A")
                          }
                     }
                     ollama_models.append(model_entry)
            except Exception as e:
                 logger.error(f"Failed to get tags from handler {handler.name}: {e}")
    else:
         logger.warning("/api/tags called but no handlers are loaded.")

    return JSONResponse(content={"models": ollama_models})
