#!/usr/bin/env python3
import os
import json
import time
import re
import base64
import secrets
import logging
import httpx # Use httpx for async requests

# Import base class and custom exceptions
from api_handlers import BaseAPIHandler, ConfigError, BackendAPIError, HandlerError

logger = logging.getLogger("gemini_handler")
# Assuming logging is configured elsewhere (e.g., in main FastAPI app)

class GeminiAPIHandler(BaseAPIHandler):
    """
    Asynchronous handler for Google Gemini API requests using httpx.
    """
    def __init__(self):
        super().__init__("gemini")
        self.models = [
            {"name": "gemma-3-27b-it", "parameters": "27B", "multimodal": True},
            {"name": "gemma-3n-e4b-it", "parameters": "4B", "multimodal": False},
            {"name": "gemini-1.5-flash-8b", "parameters": "8B", "multimodal": True},
            {"name": "gemini-1.5-flash", "parameters": "N/A", "multimodal": True}, 
            {"name": "gemini-2.0-flash-lite", "parameters": "N/A", "multimodal": True},
            {"name": "gemini-2.5-flash-preview-04-17", "parameters": "N/A", "multimodal": True}
            # Add other models if needed, check Gemini docs for current IDs
        ]
        self.api_key = os.environ.get("GEMINI_API_KEY")
        if not self.api_key:
            logger.error("GEMINI_API_KEY environment variable not set. Gemini handler will fail.")
            # Don't raise here, let handle_request fail clearly if called

        logger.info("GeminiAPIHandler registered models: %s", [m["name"] for m in self.models])

    async def handle_request(self, request_data: dict) -> dict:
        """
        Process a /v1/chat/completions request asynchronously for Gemini models.
        """
        if not self.api_key:
             raise ConfigError("GEMINI_API_KEY is not configured on the server.")

        # --- Request Data Validation and Processing ---
        model_name = request_data.get("model")
        if not model_name:
             raise ValueError("Request data must include a 'model' field.")

        # Map internal model name if needed (e.g., if request uses different alias)
        # For now, assume request_data['model'] is the correct Gemini model ID
        target_model = model_name

        messages = request_data.get("messages", [])
        if not messages:
            raise ValueError("Request body must contain a 'messages' array")

        # Simple stream enforcement (Gemini API might support it differently)
        if request_data.get("stream", False):
            logger.warning("Request specified stream=true, but this handler forces non-streaming.")
            # Note: Implementing true streaming requires yielding chunks, changing return type.

        # --- Convert OpenAI format messages to Gemini format ---
        # Gemini expects a 'contents' list. Handle basic user/assistant roles.
        # This is a simplified conversion. Real implementation might need history handling.
        last_message = messages[-1]
        if last_message.get("role") != "user":
            logger.warning("Last message role is not 'user'. Processing with caution.")
            # You might want to raise ValueError here depending on strictness

        content = last_message.get("content")
        gemini_parts = []
        combined_text_prompt = "" # For logging
        image_count = 0

        if isinstance(content, str):
            text = content.strip()
            if text:
                gemini_parts.append({"text": text})
                combined_text_prompt = text
        elif isinstance(content, list): # Handle multimodal input (text + images)
            text_parts_log = []
            for item in content:
                if not isinstance(item, dict): continue
                item_type = item.get("type")
                if item_type == "text":
                    text = item.get("text", "").strip()
                    if text:
                        gemini_parts.append({"text": text})
                        text_parts_log.append(text)
                elif item_type == "image_url":
                    image_url_data = item.get("image_url")
                    if isinstance(image_url_data, dict) and "url" in image_url_data:
                         url = image_url_data["url"]
                         if url.startswith("data:"):
                              try:
                                   header, base64_data = url.split(",", 1)
                                   mime_match = re.match(r"data:(image\/[a-zA-Z+.-]+);base64", header)
                                   if mime_match:
                                        mime_type = mime_match.group(1)
                                        gemini_parts.append({
                                             "inline_data": {"mime_type": mime_type, "data": base64_data}
                                        })
                                        image_count += 1
                                   else:
                                        logger.warning(f"Could not extract MIME type from data URI: {header}")
                              except Exception as e:
                                   logger.error(f"Error processing data URI image: {e}")
                         else:
                              logger.warning(f"Skipping non-data URI image URL: {url[:50]}...")
                    else:
                         logger.warning(f"Skipping invalid image_url item: {item}")
            combined_text_prompt = " ".join(text_parts_log) + f" ({image_count} images)" if image_count else " ".join(text_parts_log)
        else:
            raise ValueError("Invalid 'content' format in the last message.")

        if not gemini_parts:
            raise ValueError("No valid content found to send to Gemini.")

        # --- Prepare Gemini API Call ---
        gemini_url = f"https://generativelanguage.googleapis.com/v1beta/models/{target_model}:generateContent"
        # Simple payload structure
        payload = {"contents": [{"role": "user", "parts": gemini_parts}]}
        # Add generationConfig if needed from request_data (temperature, max_tokens etc.)
        generation_config = {}
        if "temperature" in request_data: generation_config["temperature"] = request_data["temperature"]
        if "max_tokens" in request_data: generation_config["maxOutputTokens"] = request_data["max_tokens"]
        # Add more mappings as needed
        if generation_config: payload["generationConfig"] = generation_config

        headers = {
            "Content-Type": "application/json",
            "x-goog-api-key": self.api_key,
            "User-Agent": "ObserverAI-FastAPI-Client/1.0"
        }

        logger.info(f"Calling Gemini API: model={target_model}, parts={len(gemini_parts)}, images={image_count}")

        # --- Make API Call using httpx ---
        try:
            async with httpx.AsyncClient(timeout=120.0) as client: # Increased timeout
                response = await client.post(gemini_url, headers=headers, json=payload)
                response.raise_for_status() # Raises HTTPStatusError for 4xx/5xx responses
                response_data = response.json()

        except httpx.RequestError as exc:
            logger.error(f"Gemini API request failed (network/connection): {exc}")
            raise BackendAPIError(f"Could not connect to Gemini API: {exc}", status_code=503) from exc # 503 Service Unavailable
        except httpx.HTTPStatusError as exc:
            error_body = exc.response.text
            status_code = exc.response.status_code
            logger.error(f"Gemini API returned error {status_code}: {error_body[:500]}")
            # Try to parse Gemini error message
            try:
                error_json = exc.response.json()
                message = error_json.get("error", {}).get("message", error_body)
            except json.JSONDecodeError:
                message = error_body
            raise BackendAPIError(f"Gemini API Error ({status_code}): {message}", status_code=status_code) from exc
        except Exception as exc:
            logger.exception(f"An unexpected error occurred during Gemini API call for model {target_model}")
            raise HandlerError(f"Unexpected error processing Gemini request: {exc}") from exc


        # --- Process Gemini Response ---
        generated_text = ""
        finish_reason = "stop" # Default

        try:
            # Safer access to potentially missing keys
            candidates = response_data.get("candidates", [])
            if candidates:
                 candidate = candidates[0]
                 content = candidate.get("content", {})
                 parts = content.get("parts", [])
                 if parts:
                      generated_text = "".join(part.get("text", "") for part in parts).strip()

                 # Map finish reason
                 finish_reason_gemini = candidate.get("finishReason", "STOP").upper()
                 # OpenAI reasons: stop, length, content_filter, tool_calls, function_call
                 if finish_reason_gemini == "MAX_TOKENS":
                      finish_reason = "length"
                 elif finish_reason_gemini == "SAFETY":
                      finish_reason = "content_filter"
                 elif finish_reason_gemini not in ["STOP", "UNSPECIFIED"]:
                      # Keep other reasons like RECITATION, etc. or map them if needed
                      finish_reason = finish_reason_gemini.lower()
                      logger.warning(f"Unhandled Gemini finish reason: {finish_reason_gemini}")
            else:
                 logger.warning("Gemini response did not contain candidates.")
                 # Check for promptFeedback for blocked prompts
                 prompt_feedback = response_data.get("promptFeedback")
                 if prompt_feedback and prompt_feedback.get("blockReason"):
                      block_reason = prompt_feedback.get("blockReason")
                      logger.error(f"Gemini request blocked. Reason: {block_reason}")
                      generated_text = f"[Request blocked due to: {block_reason}]"
                      finish_reason = "content_filter" # Treat blocked prompt as content filter finish

        except (AttributeError, KeyError, IndexError, TypeError) as e:
            logger.error(f"Error parsing Gemini response structure: {e}", exc_info=True)
            generated_text = "[Error parsing Gemini response]"
            # Keep finish_reason as 'stop' or set to an error state?

        # --- Log Conversation ---
        self.log_conversation(combined_text_prompt, generated_text, target_model, image_count)

        # --- Format Response (OpenAI Style) ---
        openai_response = {
            "id": "gemini-chatcmpl-" + secrets.token_hex(12),
            "object": "chat.completion",
            "created": int(time.time()),
            "model": target_model, # Return the model actually used
            "choices": [
                {
                    "index": 0,
                    "message": {"role": "assistant", "content": generated_text},
                    "finish_reason": finish_reason
                }
            ],
            "usage": {
                 # Gemini API (v1beta) often returns token counts in usageMetadata
                 "prompt_tokens": response_data.get("usageMetadata", {}).get("promptTokenCount", 0),
                 "completion_tokens": response_data.get("usageMetadata", {}).get("candidatesTokenCount", 0),
                 "total_tokens": response_data.get("usageMetadata", {}).get("totalTokenCount", 0)
            },
            # Add system_fingerprint if available/needed
        }

        logger.info(f"Successfully processed Gemini request for {target_model}. Response length: {len(generated_text)}")
        return openai_response
