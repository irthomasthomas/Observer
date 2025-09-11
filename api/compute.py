# compute.py

from fastapi import APIRouter, Request, HTTPException, status
from fastapi.responses import JSONResponse
import logging
import json

# --- Local Imports ---
from auth import AuthUser
# Import the new, specific functions and the QUOTA_LIMITS dictionary
from quota_manager import increment_usage, get_usage_for_service, check_usage, QUOTA_LIMITS

# Setup logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s', datefmt='%Y-%m-%d %H:%M:%S')
logger = logging.getLogger('compute_router')

# --- Observer AI Handler Integration ---
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
async def check_quota_endpoint(current_user: AuthUser): 
    """
    Returns the daily CHAT credit usage for the authenticated user.
    Requires a valid JWT. Pro users will show unlimited credits.
    """
    # Check if the user is a pro member
    if current_user.is_pro:
        return JSONResponse(content={"used": 0, "remaining": "unlimited", "limit": "unlimited", "pro_status": True})

    # Use the new specific function for the 'chat' service
    used = get_usage_for_service(current_user.id, "chat") # <-- Use current_user.id
    limit = QUOTA_LIMITS["chat"]
    remaining = max(0, limit - used)
    
    return JSONResponse(content={"used": used, "remaining": remaining, "limit": limit, "pro_status": False})


@compute_router.post("/v1/chat/completions", summary="Process chat completion requests")
async def handle_chat_completions_endpoint(request: Request, current_user: AuthUser):
    """
    Processes a chat completion request. Requires a valid JWT.
    Each call will consume one daily CHAT credit.
    """
    if not HANDLERS_AVAILABLE:
        raise HTTPException(status_code=503, detail="Backend LLM handlers are not available.")

    # --- NEW: Quota Check Logic ---
    # Check quota for both pro and free users (pro has higher limit as anti-abuse)
    if check_usage(current_user.id, "chat", current_user.is_pro):
        limit_type = "pro" if current_user.is_pro else "free"
        limit_value = 1000 if current_user.is_pro else QUOTA_LIMITS["chat"]
        logger.warning(f"Chat credit limit exceeded for {limit_type} user: {current_user.id} (Limit: {limit_value})")
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"You have exceeded your daily chat quota. Please try again tomorrow."
        )
    
    # If within limit, increment the 'chat' usage.
    usage_count = increment_usage(current_user.id, "chat")
    user_type = "PRO" if current_user.is_pro else "free"
    logger.info(f"Processing chat request for {user_type} user: {current_user.id} (Daily chat request #{usage_count})")
    # --- END of Quota Logic ---

    # 4. Parse Request Data
    try:
        request_data = await request.json()
        model_name = request_data.get("model")
        if not model_name:
            raise HTTPException(status_code=400, detail="Request body must include a 'model' field.")
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON request body.")

    # 5. Find the appropriate handler
    selected_handler = next((h for h in api_handlers.API_HANDLERS.values() if model_name in [m["name"] for m in h.get_models()]), None)

    if not selected_handler:
        logger.warning(f"Request for unsupported model: {model_name}")
        raise HTTPException(status_code=404, detail=f"Model '{model_name}' is not found or supported.")

    # 6. Check pro access control
    model_info = next((m for m in selected_handler.get_models() if m["name"] == model_name), None)
    if model_info and model_info.get("pro", False) and not current_user.is_pro:
        logger.warning(f"Non-pro user {current_user.id} attempted to access pro model: {model_name}")
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Model '{model_name}' requires a pro subscription. Please upgrade to access premium models."
        )

    # 7. Execute handler logic
    try:
        response_payload = await selected_handler.handle_request(request_data)
        return JSONResponse(content=response_payload)
    except (HandlerError, ConfigError, BackendAPIError) as e:
        logger.error(f"Handler error for model '{model_name}': {e}", exc_info=True)
        status_code = getattr(e, 'status_code', 500)
        raise HTTPException(status_code=status_code, detail=str(e))
    except Exception as e:
        logger.exception(f"Unexpected error processing request with handler {selected_handler.name}")
        raise HTTPException(status_code=500, detail="An internal server error occurred.")


@compute_router.get("/api/tags", summary="List available models (Ollama compatible format)")
async def list_tags_endpoint():
    if not HANDLERS_AVAILABLE:
         raise HTTPException(status_code=503, detail="Backend handlers are not available.")
    EXCLUDED = {"gemini-2.0-flash-lite"}

    ollama_models = []
    if api_handlers and api_handlers.API_HANDLERS:
        for handler in api_handlers.API_HANDLERS.values():
            try:
                for model_info in handler.get_models():
                     name = model_info.get("name", "")
                     if name in EXCLUDED:
                         continue
                     is_multimodal = model_info.get("multimodal", False)

                     model_entry = {
                          "name": model_info.get("name", "unknown"),
                          "model": model_info.get("name", "unknown"),
                          "size": model_info.get("size_bytes", 0),
                          "digest": model_info.get("digest", ""),
                          "details": {
                               "parameter_size": model_info.get("parameters", "N/A"),
                               "quantization_level": model_info.get("quantization", "N/A"),
                               "family": model_info.get("family", handler.name),
                               "format": model_info.get("format", "N/A"),
                               "multimodal": is_multimodal,
                               "pro": model_info.get("pro", False)
                          }
                     }
                     ollama_models.append(model_entry)
            except Exception as e:
                 logger.error(f"Failed to get tags from handler {handler.name}: {e}")
    else:
         logger.warning("/api/tags called but no handlers are loaded.")

    return JSONResponse(content={"models": ollama_models})

@compute_router.get("/v1/models", summary="List available models (OpenAI v1 compatible)")
async def list_models_v1_endpoint():
    """
    Provides an OpenAI-compatible /v1/models endpoint.

    This endpoint returns a list of available models in a standardized format,
    while also including custom 'parameter_size' and 'multimodal' fields
    that the Observer AI frontend uses for a richer UI.
    """
    if not HANDLERS_AVAILABLE:
        raise HTTPException(status_code=503, detail="Backend handlers are not available.")

    EXCLUDED = {"gemini-2.0-flash-lite", "gemini-2.0-flash-lite-free"}
    
    # This list will hold the model data in the new format.
    model_data_list = []

    if api_handlers and api_handlers.API_HANDLERS:
        for handler in api_handlers.API_HANDLERS.values():
            try:
                for model_info in handler.get_models():
                    name = model_info.get("name", "")
                    if name in EXCLUDED:
                        continue
                    
                    # Create the new model entry in the OpenAI-compatible format
                    new_model_entry = {
                        "id": name, # The standard uses 'id' for the model name
                        "object": "model",
                        "created": 0, # Placeholder, as it's not strictly needed by the UI
                        "owned_by": handler.name,

                        # --- Custom fields needed by the Observer frontend ---
                        "parameter_size": model_info.get("parameters", "N/A"),
                        "multimodal": model_info.get("multimodal", False),
                        "pro": model_info.get("pro", False)
                    }
                    model_data_list.append(new_model_entry)

            except Exception as e:
                logger.error(f"Failed to get v1/models from handler {handler.name}: {e}")
    else:
        logger.warning("/v1/models called but no handlers are loaded.")

    # The final response must be a dictionary with 'object' and 'data' keys
    return JSONResponse(content={
        "object": "list",
        "data": model_data_list
    })


