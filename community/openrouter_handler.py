#!/usr/bin/env python3
import os
import json
import logging
import httpx # Use httpx for async requests

# Import base class and custom exceptions
from api_handlers import BaseAPIHandler, ConfigError, BackendAPIError, HandlerError

logger = logging.getLogger("openrouter_handler")

class OpenRouterAPIHandler(BaseAPIHandler):
    """
    Asynchronous handler for OpenRouter API requests using httpx,
    with mapping for user-friendly model names.
    """
    OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions"

    def __init__(self):
        super().__init__("openrouter")

        # {"name": "google/gemini-2.0-flash-exp:free", "parameters": "unknown"},
        # {"name": "google/gemma-3-27b-it:free", "parameters": "27B"},
        # {"name": "deepseek/deepseek-r1-zero:free", "parameters": "671B"},
        # {"name": "deepseek/deepseek-v3-base:free", "parameters": "671B"}, # Example model ID

        # --- Model Mapping ---
        # Dictionary mapping display names to actual model IDs and parameter sizes
        self.model_map = {
            # --- Add your desired mappings here ---
            # "gemma-3-27b-or": {
            #     "model_id": "google/gemma-3-27b-it:free",
            #     "parameters": "27B",
            #     "multimodal": True
            # },
            "deepseek-r1": {
                "model_id": "deepseek/deepseek-r1:free", # Example
                "parameters": "671B",
                "multimodal": False
            },
            "deepseek-v3": {
                "model_id": "deepseek/deepseek-chat:free", # Example
                "parameters": "671B",
                "multimodal": False
            },
             "qwq": {
                 "model_id": "qwen/qwq-32b:free", # Example
                 "parameters": "32B",
                 "multimodal": False
            },
            "deepseek-llama-70b": {
                "model_id": "deepseek/deepseek-r1-distill-llama-70b:free",
                "parameters": "70b",
                "multimodal": False
            }
            # Add more models following this pattern
            # "your-pretty-name": { "model_id": "actual/openrouter-model-id:tag", "parameters": "..."}
        }

        # Define supported models for display using the pretty names from the map
        self.models = [
            {"name": display_name, "parameters": model_info.get("parameters", "N/A"),
            "multimodal": model_info.get("multimodal", False)}
            for display_name, model_info in self.model_map.items()
        ]
        # --- End Model Mapping ---


        self.api_key = os.environ.get("OPENROUTER_API_KEY")
        if not self.api_key:
            logger.error("OPENROUTER_API_KEY environment variable not set. OpenRouter handler will fail.")

        # Log the DISPLAY names that will be shown to the user
        logger.info("OpenRouterAPIHandler registered display models: %s", [m["name"] for m in self.models])

        # Base headers
        self.base_headers = {
            "Authorization": f"Bearer {self.api_key}" if self.api_key else "",
            "Content-Type": "application/json",
            "HTTP-Referer": os.environ.get("OPENROUTER_SITE_URL", "http://localhost"),
            "X-Title": os.environ.get("OPENROUTER_APP_TITLE", "ObserverAI-FastAPI"),
            "User-Agent": "ObserverAI-FastAPI-Client/1.0"
        }

    async def handle_request(self, request_data: dict) -> dict:
        """
        Process a /v1/chat/completions request asynchronously via OpenRouter.
        Translates display model name to actual OpenRouter model ID.
        """
        if not self.api_key:
            raise ConfigError("OPENROUTER_API_KEY is not configured on the server.")

        # --- Get Display Name and Translate to Actual Model ID ---
        display_model_name = request_data.get("model")
        if not display_model_name:
            raise ValueError("Request data must include a 'model' field (using the display name).")

        # Look up the display name in our map
        model_info = self.model_map.get(display_model_name)
        if not model_info:
            # If the display name isn't found, the model is unsupported by this mapping
            logger.warning(f"Received request for unmapped OpenRouter model display name: {display_model_name}")
            raise ValueError(f"Model display name '{display_model_name}' is not recognized or supported.")

        actual_model_id = model_info.get("model_id")
        if not actual_model_id:
             # Should not happen if map is defined correctly, but good practice to check
             logger.error(f"Internal configuration error: Missing 'model_id' for display name '{display_model_name}' in model_map.")
             raise ConfigError(f"Internal mapping error for model '{display_model_name}'.")
        # --- End Translation ---


        # --- Prepare API Call ---
        # Create a copy of the request data to modify
        payload = request_data.copy()
        # *** IMPORTANT: Set the 'model' in the payload to the ACTUAL OpenRouter ID ***
        payload["model"] = actual_model_id

        # Update headers (in case API key was missing during init)
        headers = self.base_headers.copy()
        headers["Authorization"] = f"Bearer {self.api_key}"

        logger.info(f"Calling OpenRouter API: display_model='{display_model_name}', actual_model='{actual_model_id}'")

        # --- Make API Call using httpx ---
        try:
            async with httpx.AsyncClient(timeout=120.0) as client:
                response = await client.post(self.OPENROUTER_API_URL, headers=headers, json=payload)
                response.raise_for_status()
                response_data = response.json()

        # --- Error Handling (keep as before) ---
        except httpx.RequestError as exc:
            logger.error(f"OpenRouter API request failed (network/connection): {exc}")
            raise BackendAPIError(f"Could not connect to OpenRouter API: {exc}", status_code=503) from exc
        except httpx.HTTPStatusError as exc:
            error_body = exc.response.text
            status_code = exc.response.status_code
            logger.error(f"OpenRouter API returned error {status_code} for model {actual_model_id}: {error_body[:500]}")
            try:
                error_json = exc.response.json()
                message = error_json.get("error", {}).get("message", error_body)
            except json.JSONDecodeError:
                message = error_body
            raise BackendAPIError(f"OpenRouter API Error ({status_code}): {message}", status_code=status_code) from exc
        except Exception as exc:
            logger.exception(f"An unexpected error occurred during OpenRouter API call for model {actual_model_id}")
            raise HandlerError(f"Unexpected error processing OpenRouter request: {exc}") from exc


        # --- Log Conversation (using display name for consistency if desired) ---
        prompt_text = ""
        response_text = ""
        try:
            messages = request_data.get("messages", [])
            if messages and isinstance(messages[-1].get("content"), str):
                prompt_text = messages[-1].get("content", "")[:500]
            if 'choices' in response_data and response_data['choices']:
                 choice = response_data['choices'][0]
                 if 'message' in choice and 'content' in choice['message']:
                      response_text = choice['message']['content'][:500]
        except Exception as log_parse_err:
            logger.warning(f"Could not parse prompt/response for logging: {log_parse_err}")

        # Log using the display name the user requested
        self.log_conversation(prompt_text, response_text, display_model_name)


        # --- Return Response ---
        # Modify the response payload to show the *display name* instead of the actual ID? Optional.
        # If you want the client to see the pretty name in the response:
        if "model" in response_data:
             response_data["model"] = display_model_name # Replace actual ID with display name

        logger.info(f"Successfully processed OpenRouter request for display model '{display_model_name}'.")
        return response_data
