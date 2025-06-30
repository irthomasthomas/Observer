# compute.py

from fastapi import APIRouter, Request, HTTPException
from fastapi.responses import JSONResponse
import logging
import json
from datetime import datetime

# --- Local Imports ---
from auth import AuthUser
from quota_manager import increment_usage, get_usage, DAILY_CREDIT_LIMIT 

# Setup logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s', datefmt='%Y-%m-%d %H:%M:%S')
logger = logging.getLogger('compute_router')

# --- Observer AI Handler Integration ---
# (This section remains unchanged, it's good as is)
try:
    import api_handlers
    from api_handlers import HandlerError, ConfigError, BackendAPIError
    logger.info("Successfully imported api_handlers. Available handlers: %s", list(api_handlers.API_HANDLERS.keys()))
    HANDLERS_AVAILABLE = True
except ImportError as e:
    logger.error(f"Could not import api_handlers: {e}. Backend routing will not work.", exc_info=True)
    api_handlers, HandlerError, ConfigError, BackendAPIError, HANDLERS_AVAILABLE = (None, Exception, Exception, Exception, False)
# --- End Integration ---

compute_router = APIRouter()

# --- API Routes ---

@compute_router.get("/quota", summary="Check remaining API credits for the authenticated user")
async def check_quota_endpoint(user_id: AuthUser):
    """
    Returns the daily credit usage for the authenticated user.
    Requires a valid JWT.
    """
    quota_info = get_usage(user_id)
    return JSONResponse(quota_info)


@compute_router.post("/v1/chat/completions", summary="Process chat completion requests")
async def handle_chat_completions_endpoint(request: Request, user_id: AuthUser):
    """
    Processes a chat completion request. Requires a valid JWT.
    Each call will consume one daily credit.
    """
    if not HANDLERS_AVAILABLE:
        raise HTTPException(status_code=503, detail="Backend LLM handlers are not available.")

    current_usage = get_usage(user_id)
    
    # 2. Enforce the limit.
    if current_usage["used"] >= DAILY_CREDIT_LIMIT:
        logger.warning(f"Credit limit exceeded for user: {user_id} (Limit: {DAILY_CREDIT_LIMIT})")
        # Return a 429 Too Many Requests error. This is the standard.
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"You have used all your {DAILY_CREDIT_LIMIT} daily credits. Please try again tomorrow or upgrade for unlimited access."
        )

    # 3. If the user is within their limit, increment the usage.
    usage_count = increment_usage(user_id)
    logger.info(f"Processing request for user: {user_id} (Daily request #{usage_count})")

    # 2. Parse Request Data
    try:
        request_data = await request.json()
        model_name = request_data.get("model")
        if not model_name:
            raise HTTPException(status_code=400, detail="Request body must include a 'model' field.")
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON request body.")

    # 3. Find the appropriate handler
    selected_handler = next((h for h in api_handlers.API_HANDLERS.values() if model_name in [m["name"] for m in h.get_models()]), None)

    if not selected_handler:
        logger.warning(f"Request for unsupported model: {model_name}")
        raise HTTPException(status_code=404, detail=f"Model '{model_name}' is not found or supported.")

    # 4. Execute handler logic
    try:
        response_payload = await selected_handler.handle_request(request_data)
        return JSONResponse(content=response_payload)
    except (HandlerError, ConfigError, BackendAPIError) as e:
        logger.error(f"Handler error for model '{model_name}': {e}", exc_info=True)
        # Re-raise with appropriate status code if the error object has one
        status_code = getattr(e, 'status_code', 500)
        raise HTTPException(status_code=status_code, detail=str(e))
    except Exception as e:
        logger.exception(f"Unexpected error processing request with handler {selected_handler.name}")
        raise HTTPException(status_code=500, detail="An internal server error occurred.")

# (The model listing endpoints /api/models and /api/tags can remain as they are)

@compute_router.get("/api/tags", summary="List available models (Ollama compatible format)")
async def list_tags_endpoint():
    if not HANDLERS_AVAILABLE:
         raise HTTPException(status_code=503, detail="Backend handlers are not available.")
    EXCLUDED = {"gemini-2.5-flash-preview-04-17"}

    ollama_models = []
    if api_handlers and api_handlers.API_HANDLERS:
        for handler in api_handlers.API_HANDLERS.values():
            try:
                for model_info in handler.get_models():
                     # Basic mapping, add more fields if your get_models provides them
                     name = model_info.get("name", "")
                     if name in EXCLUDED:
                         continue
                     is_multimodal = model_info.get("multimodal", False)

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
                               "format": model_info.get("format", "N/A"),
                               "multimodal": is_multimodal
                          }
                     }
                     ollama_models.append(model_entry)
            except Exception as e:
                 logger.error(f"Failed to get tags from handler {handler.name}: {e}")
    else:
         logger.warning("/api/tags called but no handlers are loaded.")

    return JSONResponse(content={"models": ollama_models})
