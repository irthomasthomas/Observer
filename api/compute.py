# compute.py

from fastapi import APIRouter, Request, HTTPException, status, Depends
from fastapi.responses import JSONResponse, StreamingResponse
import logging
import json
from collections import defaultdict
from datetime import datetime, timedelta
from threading import Lock

# --- Local Imports ---
from auth import AuthUser
from admin_auth import get_admin_access
# Import the new, specific functions and the QUOTA_LIMITS dictionary
from quota_manager import increment_usage, get_usage_for_service, check_usage, QUOTA_LIMITS, PRO_QUOTA_LIMITS, MAX_QUOTA_LIMITS, PLUS_QUOTA_LIMITS
from auth0_manager import get_email_by_id

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

# --- Agent Creator Models Configuration ---
AGENT_CREATOR_MODELS = {
    "gemini-2.0-flash-lite-free",
    "gemini-2.5-flash-lite-free"
}

# --- Metrics Logging System (Memory-Only) ---
# Similar to quota_manager.py pattern - all in memory
_conversation_metrics = []
_metrics_lock = Lock()

# --- Hourly Status Aggregates (for /status endpoint) ---
_hourly_aggregates = defaultdict(dict)  # {model: {hour: {"success": int, "total": int} or float}}
_hourly_lock = Lock()

def update_hourly_stats(model: str, timestamp: str, is_success: bool):
    """
    Update hourly statistics for a model. Freezes past hours into percentages.
    This is called on every model request to maintain up-to-date hourly data.

    Args:
        model: Model name (e.g., "gemini-2.0-flash-exp")
        timestamp: ISO format timestamp of the request
        is_success: Whether the request was successful (status_code < 400)
    """
    with _hourly_lock:
        try:
            dt = datetime.fromisoformat(timestamp)
            hour_bucket = dt.replace(minute=0, second=0, microsecond=0).isoformat()
            current_hour = datetime.now().replace(minute=0, second=0, microsecond=0).isoformat()

            # Freeze any hours that are no longer current (convert counters to percentage)
            for hour, data in list(_hourly_aggregates[model].items()):
                if isinstance(data, dict) and hour != current_hour:
                    # Freeze this hour - convert to percentage
                    if data["total"] > 0:
                        success_rate = round((data["success"] / data["total"]) * 100, 1)
                    else:
                        success_rate = None  # No data for this hour
                    _hourly_aggregates[model][hour] = success_rate

            # Initialize current hour bucket if it doesn't exist
            if hour_bucket not in _hourly_aggregates[model]:
                _hourly_aggregates[model][hour_bucket] = {"success": 0, "total": 0}

            # Update current hour counters (only if it's still a dict, not frozen)
            if isinstance(_hourly_aggregates[model][hour_bucket], dict):
                _hourly_aggregates[model][hour_bucket]["total"] += 1
                if is_success:
                    _hourly_aggregates[model][hour_bucket]["success"] += 1

            # Cleanup: remove hours older than 24h
            cutoff = (datetime.now() - timedelta(hours=24)).replace(minute=0, second=0, microsecond=0).isoformat()
            for hour in list(_hourly_aggregates[model].keys()):
                if hour < cutoff:
                    del _hourly_aggregates[model][hour]

        except Exception as e:
            # Don't crash the request if stats tracking fails
            logger.error(f"Error updating hourly stats for {model}: {e}")

def log_conversation_metrics(user_id: str, prompt_text: str, response_text: str,
                           handler: str, model: str, status_code: int, image_count: int = 0,
                           time_to_first_token: float = None, chunks_per_second: float = None,
                           request_data: dict = None):
    """Log conversation metrics to memory (no disk I/O)."""
    timestamp = datetime.now().isoformat()

    # For Agent Creator models, parse messages array to get clean latest exchange
    if model in AGENT_CREATOR_MODELS and request_data and "messages" in request_data:
        messages = request_data["messages"]

        # Extract the latest user message
        user_message = ""
        for msg in reversed(messages):
            if msg.get("role") == "user":
                content = msg.get("content", "")
                if isinstance(content, str):
                    user_message = content
                elif isinstance(content, list):
                    # Handle multimodal content
                    text_parts = [item.get("text", "") for item in content if isinstance(item, dict) and item.get("type") == "text"]
                    user_message = " ".join(text_parts)
                break

        # Use the extracted user message and full response for Agent Creator
        final_prompt = user_message
        final_response = response_text  # Full response, not truncated
    else:
        # Monitoring agents: keep current [-500:] approach (standalone prompts)
        final_prompt = prompt_text[-500:] if prompt_text else ""
        final_response = response_text[:500] if response_text else ""

    with _metrics_lock:
        entry = {
            "timestamp": timestamp,
            "user_id": user_id,
            "prompt": final_prompt,
            "response": final_response,
            "handler": handler,
            "model": model,
            "status_code": status_code,
            "image_count": image_count,
            "time_to_first_token": time_to_first_token,
            "chunks_per_second": chunks_per_second
        }
        _conversation_metrics.append(entry)

        # Keep only last 1000 entries to prevent memory bloat
        if len(_conversation_metrics) > 1000:
            _conversation_metrics.pop(0)

    # Update hourly status aggregates (for /status endpoint)
    is_success = status_code < 400
    update_hourly_stats(model, timestamp, is_success)

def get_all_conversation_metrics() -> list:
    """Get all conversation metrics (for admin endpoint)."""
    with _metrics_lock:
        metrics_copy = list(_conversation_metrics)  # Return copy
        # Add email to each metric entry
        for metric in metrics_copy:
            user_id = metric.get("user_id")
            if user_id:
                try:
                    metric["email"] = get_email_by_id(user_id)
                except Exception as e:
                    logger.error(f"Failed to fetch email for user {user_id}: {e}")
                    metric["email"] = None
        return metrics_copy

def get_hourly_status() -> dict:
    """
    Generate status page response with hourly uptime data for all models.
    Returns pre-computed success rates for the last 24 hours.
    """
    with _hourly_lock:
        now = datetime.now()
        current_hour = now.replace(minute=0, second=0, microsecond=0)

        # Generate list of last 24 hours
        hours_list = []
        for i in range(24):
            hour = current_hour - timedelta(hours=i)
            hours_list.insert(0, hour)  # Insert at beginning to maintain chronological order

        models_status = []

        for model_name, hourly_data in _hourly_aggregates.items():
            # Skip NULL model from status endpoint
            if model_name == "Skip Model Call":
                continue

            hourly_stats = []
            total_success = 0
            total_requests = 0

            for hour in hours_list:
                hour_key = hour.isoformat()

                if hour_key in hourly_data:
                    data = hourly_data[hour_key]

                    # Current hour is still a dict, compute percentage on the fly
                    if isinstance(data, dict):
                        if data["total"] > 0:
                            success_rate = round((data["success"] / data["total"]) * 100, 1)
                            total_success += data["success"]
                            total_requests += data["total"]
                        else:
                            success_rate = None
                    else:
                        # Frozen percentage
                        success_rate = data
                        # Estimate counts for overall rate (assuming ~100% if high rate)
                        # This is approximate since we don't store counts for frozen hours
                        if data is not None:
                            # Rough estimate: assume 10 requests per hour on average
                            estimated_requests = 10
                            estimated_success = round(estimated_requests * data / 100)
                            total_success += estimated_success
                            total_requests += estimated_requests

                    hourly_stats.append({
                        "hour": hour_key,
                        "success_rate": success_rate
                    })
                else:
                    # No data for this hour
                    hourly_stats.append({
                        "hour": hour_key,
                        "success_rate": None
                    })

            # Compute overall success rate
            overall_success_rate = round((total_success / total_requests) * 100, 1) if total_requests > 0 else None

            models_status.append({
                "name": model_name,
                "overall_success_rate": overall_success_rate,
                "hourly_stats": hourly_stats
            })

        return {
            "checked_at": now.isoformat(),
            "window_hours": 24,
            "models": models_status
        }

async def _log_streaming_response(stream_iterator, user_id: str, prompt_text: str,
                                 handler: str, model: str, image_count: int = 0,
                                 request_data: dict = None):
    """
    Wrapper that logs complete streaming response with timing metrics.
    Accumulates content from OpenAI SSE chunks and logs when stream completes.
    """
    import time

    response_parts = []
    start_time = time.time()
    first_token_time = None
    total_chunks = 0

    try:
        async for chunk in stream_iterator:
            # Yield chunk immediately for streaming
            yield chunk

            # Parse chunk to extract content for logging
            if isinstance(chunk, (str, bytes)):
                chunk_str = chunk.decode() if isinstance(chunk, bytes) else chunk
                if chunk_str.startswith("data: ") and not chunk_str.startswith("data: [DONE]"):
                    try:
                        json_data = chunk_str[6:].strip()  # Remove "data: " prefix
                        if json_data:
                            chunk_json = json.loads(json_data)
                            choices = chunk_json.get("choices", [])
                            if choices and "delta" in choices[0]:
                                content = choices[0]["delta"].get("content")
                                if content:
                                    # Mark time to first token
                                    if first_token_time is None:
                                        first_token_time = time.time()
                                    response_parts.append(content)
                                    total_chunks += 1
                    except (json.JSONDecodeError, KeyError, IndexError):
                        # Skip malformed chunks
                        continue

        # Calculate timing metrics
        end_time = time.time()
        total_duration = end_time - start_time

        time_to_first_token_ms = None
        if first_token_time is not None:
            time_to_first_token_ms = round((first_token_time - start_time) * 1000, 2)

        chunks_per_second = None
        if total_chunks > 0 and total_duration > 0:
            chunks_per_second = round(total_chunks / total_duration, 2)

        # Log complete response when stream finishes
        complete_response = ''.join(response_parts)
        log_conversation_metrics(
            user_id=user_id,
            prompt_text=prompt_text,
            response_text=complete_response,
            handler=handler,
            model=model,
            status_code=200,
            image_count=image_count,
            time_to_first_token=time_to_first_token_ms,
            chunks_per_second=chunks_per_second,
            request_data=request_data
        )

    except Exception as e:
        # Log error if stream fails
        log_conversation_metrics(
            user_id=user_id,
            prompt_text=prompt_text,
            response_text=f"STREAM_ERROR: {str(e)}",
            handler=handler,
            model=model,
            status_code=500,
            image_count=image_count,
            request_data=request_data
        )

# --- API Routes ---

@compute_router.get("/admin/metrics", tags=["Admin"], summary="Get all conversation metrics")
async def get_all_metrics(is_admin: bool = Depends(get_admin_access)):
    """
    (Admin) Returns all conversation metrics including response times, models used, and error rates.
    Requires a valid X-Admin-Key header.
    """
    return get_all_conversation_metrics()

@compute_router.get("/status", tags=["Status"], summary="Get model availability and uptime statistics")
async def get_status():
    """
    Public endpoint showing model availability and hourly uptime statistics.
    Returns success rates for each model over the last 24 hours.
    No authentication required.
    """
    return get_hourly_status()

@compute_router.get("/quota", summary="Check remaining API credits for the authenticated user")
async def check_quota_endpoint(current_user: AuthUser):
    """
    Returns the daily MONITOR credit usage for the authenticated user.
    Requires a valid JWT. Pro and Max users will show their tier limits.
    """
    # Determine user tier and limits
    if current_user.is_max:
        tier = "max"
        limit = MAX_QUOTA_LIMITS["monitor"]
    elif current_user.is_plus:
        tier = "plus"
        limit = PLUS_QUOTA_LIMITS["monitor"]
    elif current_user.is_pro:
        tier = "pro"
        limit = PRO_QUOTA_LIMITS["monitor"]
    else:
        tier = "free"
        limit = QUOTA_LIMITS["monitor"]

    # Use the new specific function for the 'monitor' service
    used = await get_usage_for_service(current_user.id, "monitor")
    remaining = max(0, limit - used)

    return JSONResponse(content={
        "used": used,
        "remaining": remaining,
        "limit": limit,
        "tier": tier
    })


@compute_router.post("/v1/chat/completions", summary="Process chat completion requests")
async def handle_chat_completions_endpoint(request: Request, current_user: AuthUser):
    """
    Processes a chat completion request. Requires a valid JWT.
    Each call will consume one daily MONITOR credit or AGENT_CREATOR credit depending on model.
    """
    if not HANDLERS_AVAILABLE:
        raise HTTPException(status_code=503, detail="Backend LLM handlers are not available.")

    # Parse Request Data first to determine model
    try:
        request_data = await request.json()
        model_name = request_data.get("model")
        if not model_name:
            raise HTTPException(status_code=400, detail="Request body must include a 'model' field.")
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON request body.")

    # --- NEW: Model-based Quota Routing ---
    # Determine which quota to use based on model type
    service_type = "agent_creator" if model_name in AGENT_CREATOR_MODELS else "monitor"

    # Check quota for all users (each tier has limits as anti-abuse)
    if await check_usage(current_user.id, service_type, current_user.is_pro, current_user.is_max, current_user.is_plus):
        # Determine tier and limit for error message
        if current_user.is_max:
            limit_type = "max"
            limit_value = MAX_QUOTA_LIMITS[service_type]
        elif current_user.is_plus:
            limit_type = "plus"
            limit_value = PLUS_QUOTA_LIMITS[service_type]
        elif current_user.is_pro:
            limit_type = "pro"
            limit_value = PRO_QUOTA_LIMITS[service_type]
        else:
            limit_type = "free"
            limit_value = QUOTA_LIMITS[service_type]

        logger.warning(f"{service_type.capitalize()} limit exceeded for {limit_type} user: {current_user.id} (Daily limit: {limit_value})")
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail={
                "message": "Rate limit exceeded. Please slow down your requests or try again later.",
                "quota_type": service_type
            }
        )

    # If within limit, increment the appropriate usage counter
    usage_count = await increment_usage(current_user.id, service_type)
    user_type = "MAX" if current_user.is_max else ("PLUS" if current_user.is_plus else ("PRO" if current_user.is_pro else "free"))
    logger.info(f"Processing {service_type} request for {user_type} user: {current_user.id} (Daily {service_type} request #{usage_count})")
    # --- END of Quota Logic ---

    # 5. Find the appropriate handler
    selected_handler = api_handlers.MODEL_TO_HANDLER.get(model_name)

    if not selected_handler:
        logger.warning(f"Request for unsupported model: {model_name}")
        raise HTTPException(status_code=404, detail=f"Model '{model_name}' is not found or supported.")

    # 6. Check tier-based access control
    model_info = next((m for m in selected_handler.get_models() if m["name"] == model_name), None)
    if model_info:
        # Check if model requires max tier
        if model_info.get("max", False) and not current_user.is_max:
            logger.warning(f"Non-max user {current_user.id} attempted to access max model: {model_name}")
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Model '{model_name}' requires a Max subscription. Please upgrade to access this model."
            )
        # Check if model requires pro tier (or higher)
        elif model_info.get("pro", False) and not (current_user.is_pro or current_user.is_max):
            logger.warning(f"Free user {current_user.id} attempted to access pro model: {model_name}")
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Model '{model_name}' requires a Pro subscription. Please upgrade to access premium models."
            )

    # 7. Execute handler logic with centralized metrics logging
    
    # Extract prompt info for logging
    messages = request_data.get("messages", [])
    prompt_text = ""
    image_count = 0
    
    if messages:
        last_message = messages[-1]
        content = last_message.get("content")
        if isinstance(content, str):
            prompt_text = content
        elif isinstance(content, list):
            # Handle multimodal content (text + images)
            text_parts = []
            for item in content:
                if isinstance(item, dict):
                    if item.get("type") == "text":
                        text_parts.append(item.get("text", ""))
                    elif item.get("type") == "image_url":
                        image_count += 1
            prompt_text = " ".join(text_parts)
            if image_count > 0:
                prompt_text += f" ({image_count} images)"
    
    try:
        response_payload = await selected_handler.handle_request(request_data)

        # Wrap StreamingResponse with logging (all requests are streaming)
        if hasattr(response_payload, '__class__') and response_payload.__class__.__name__ == 'StreamingResponse':
            return StreamingResponse(
                _log_streaming_response(
                    response_payload.body_iterator,
                    current_user.id,
                    prompt_text,
                    selected_handler.name,
                    model_name,
                    image_count,
                    request_data
                ),
                media_type=response_payload.media_type,
                headers=response_payload.headers
            )

        # Fallback for non-streaming responses (shouldn't happen but defensive)
        return JSONResponse(content=response_payload)
        
    except (HandlerError, ConfigError, BackendAPIError) as e:
        status_code = getattr(e, 'status_code', 500)

        # Log error request metrics
        log_conversation_metrics(
            user_id=current_user.id,
            prompt_text=prompt_text,
            response_text=f"ERROR: {str(e)}",
            handler=selected_handler.name,
            model=model_name,
            status_code=status_code,
            image_count=image_count,
            request_data=request_data
        )
        
        logger.error(f"Handler error for model '{model_name}': {e}", exc_info=True)
        raise HTTPException(status_code=status_code, detail=str(e))
        
    except Exception as e:
        # Log unexpected error metrics
        log_conversation_metrics(
            user_id=current_user.id,
            prompt_text=prompt_text,
            response_text=f"INTERNAL_ERROR: {str(e)}",
            handler=selected_handler.name,
            model=model_name,
            status_code=500,
            image_count=image_count,
            request_data=request_data
        )
        
        logger.exception(f"Unexpected error processing request with handler {selected_handler.name}")
        raise HTTPException(status_code=500, detail="An internal server error occurred.")


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

    # Exclude agent creator models and other hidden models from public listing
    EXCLUDED = AGENT_CREATOR_MODELS | {"gemini-2.5-pro"}
    
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


