#!/usr/bin/env python3
import os
import json
import logging
import httpx  # Use httpx for async requests
from fastapi.responses import StreamingResponse

# Import base class and custom exceptions
from api_handlers import BaseAPIHandler, ConfigError, BackendAPIError, HandlerError

logger = logging.getLogger("fireworks_handler")

class FireworksAPIHandler(BaseAPIHandler):
    """
    Asynchronous handler for Fireworks AI API requests using httpx,
    with mapping for user-friendly model names.
    """
    FIREWORKS_API_URL = "https://api.fireworks.ai/inference/v1/chat/completions"

    def __init__(self):
        super().__init__("fireworks")

        # --- Model Mapping ---
        # Dictionary mapping display names to actual model IDs and parameters
        self.model_map = {
            # Simple mapping with just two models
            "llama4-scout": {
                "model_id": "accounts/fireworks/models/llama4-scout-instruct-basic",
                "parameters": "109B",
                "multimodal": True
            },
            "llama4-maverick": {
                "model_id": "accounts/fireworks/models/llama4-maverick-instruct-basic",
                "parameters": "400B",
                "multimodal": True
            },
            "gpt-oss-120b": {
                "model_id": "accounts/fireworks/models/gpt-oss-120b",
                "parameters": "120B",
                "multimodal": False 
            },
        }

        # Define supported models for display using the pretty names from the map
        self.models = [
            {"name": display_name, "parameters": model_info.get("parameters", "N/A"),
            "multimodal": model_info.get("multimodal", False), "pro": True}
            for display_name, model_info in self.model_map.items()
        ]
        # --- End Model Mapping ---

        self.api_key = os.environ.get("FIREWORKS_API_KEY")
        if not self.api_key:
            logger.error("FIREWORKS_API_KEY environment variable not set. Fireworks handler will fail.")

        # Log the DISPLAY names that will be shown to the user
        logger.info("FireworksAPIHandler registered display models: %s", [m["name"] for m in self.models])

        # Base headers
        self.base_headers = {
            "Authorization": f"Bearer {self.api_key}" if self.api_key else "",
            "Content-Type": "application/json",
            "Accept": "application/json"
        }

    async def handle_request(self, request_data: dict):
        """
        Process a /v1/chat/completions request asynchronously via Fireworks AI.
        Translates display model name to actual Fireworks model ID.
        Returns either dict (non-streaming) or StreamingResponse (streaming).
        """
        if not self.api_key:
            raise ConfigError("FIREWORKS_API_KEY is not configured on the server.")

        # --- Get Display Name and Translate to Actual Model ID ---
        display_model_name = request_data.get("model")
        if not display_model_name:
            raise ValueError("Request data must include a 'model' field (using the display name).")

        # Look up the display name in our map
        model_info = self.model_map.get(display_model_name)
        if not model_info:
            # If the display name isn't found, the model is unsupported by this mapping
            logger.warning(f"Received request for unmapped Fireworks model display name: {display_model_name}")
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
        # Set the 'model' in the payload to the ACTUAL Fireworks ID
        payload["model"] = actual_model_id

        # Default values from the curl example
        if "max_tokens" not in payload:
            payload["max_tokens"] = 16384
        if "top_p" not in payload:
            payload["top_p"] = 1
        if "top_k" not in payload:
            payload["top_k"] = 40
        if "presence_penalty" not in payload:
            payload["presence_penalty"] = 0
        if "frequency_penalty" not in payload:
            payload["frequency_penalty"] = 0
        if "temperature" not in payload:
            payload["temperature"] = 0.6

        # Update headers (in case API key was missing during init)
        headers = self.base_headers.copy()
        headers["Authorization"] = f"Bearer {self.api_key}"

        logger.info(f"Calling Fireworks API: display_model='{display_model_name}', actual_model='{actual_model_id}', streaming={payload.get('stream', False)}")

        # --- Check for streaming ---
        if payload.get("stream", False):
            return StreamingResponse(
                self._stream_fireworks_response(headers, payload, display_model_name, actual_model_id),
                media_type="text/event-stream"
            )

        # --- Make Non-Streaming API Call using httpx ---
        try:
            async with httpx.AsyncClient(timeout=120.0) as client:
                response = await client.post(self.FIREWORKS_API_URL, headers=headers, json=payload)
                response.raise_for_status()
                response_data = response.json()

        # --- Error Handling ---
        except httpx.RequestError as exc:
            logger.error(f"Fireworks API request failed (network/connection): {exc}")
            raise BackendAPIError(f"Could not connect to Fireworks API: {exc}", status_code=503) from exc
        except httpx.HTTPStatusError as exc:
            error_body = exc.response.text
            status_code = exc.response.status_code
            logger.error(f"Fireworks API returned error {status_code} for model {actual_model_id}: {error_body[:500]}")
            try:
                error_json = exc.response.json()
                message = error_json.get("error", {}).get("message", error_body)
            except json.JSONDecodeError:
                message = error_body
            raise BackendAPIError(f"Fireworks API Error ({status_code}): {message}", status_code=status_code) from exc
        except Exception as exc:
            logger.exception(f"An unexpected error occurred during Fireworks API call for model {actual_model_id}")
            raise HandlerError(f"Unexpected error processing Fireworks request: {exc}") from exc

        # --- Log Conversation (using display name for consistency) ---
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

        # --- Conversation logging now handled centrally in compute.py ---

        # --- Return Response ---
        # Replace actual ID with display name in response
        if "model" in response_data:
            response_data["model"] = display_model_name

        logger.info(f"Successfully processed Fireworks request for display model '{display_model_name}'.")
        return response_data

    async def _stream_fireworks_response(self, headers: dict, payload: dict, display_model_name: str, actual_model_id: str):
        """Stream SSE chunks from Fireworks API."""
        try:
            async with httpx.AsyncClient(timeout=120.0) as client:
                async with client.stream("POST", self.FIREWORKS_API_URL, headers=headers, json=payload) as response:
                    response.raise_for_status()
                    async for line in response.aiter_lines():
                        if line.startswith("data: "):
                            # Replace actual model ID with display name in streaming chunks
                            chunk_data = line[6:]  # Remove "data: " prefix
                            if chunk_data != "[DONE]":
                                try:
                                    chunk_json = json.loads(chunk_data)
                                    if "model" in chunk_json:
                                        chunk_json["model"] = display_model_name
                                    yield f"data: {json.dumps(chunk_json)}\n\n"
                                except json.JSONDecodeError:
                                    # If we can't parse, just forward as-is
                                    yield f"data: {chunk_data}\n\n"
                            else:
                                yield f"data: {chunk_data}\n\n"
        except httpx.RequestError as exc:
            logger.error(f"Fireworks streaming API request failed: {exc}")
            yield f"data: {json.dumps({'error': f'Connection error: {exc}'})}\n\n"
        except httpx.HTTPStatusError as exc:
            error_body = exc.response.text
            logger.error(f"Fireworks streaming API error {exc.response.status_code}: {error_body[:500]}")
            yield f"data: {json.dumps({'error': f'API error ({exc.response.status_code}): {error_body}'})}\n\n"
        except Exception as exc:
            logger.exception(f"Unexpected error in Fireworks streaming for model {actual_model_id}")
            yield f"data: {json.dumps({'error': f'Unexpected error: {exc}'})}\n\n"
