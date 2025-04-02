#!/usr/bin/env python3
"""
Gemini Handler Module

This module registers a GeminiAPIHandler with the API_HANDLERS registry
to process requests for Gemini models.
"""

import os
import json
import urllib.request
import urllib.error
import time
import re
import base64
import secrets
import logging
from datetime import datetime
from pathlib import Path

# Import BaseAPIHandler from api_handlers module
from api_handlers import BaseAPIHandler

# Set up logging
logger = logging.getLogger("gemini_handler")
logger.setLevel(logging.INFO)
handler = logging.StreamHandler()
formatter = logging.Formatter('%(asctime)s - %(levelname)s - [%(name)s] - %(message)s')
handler.setFormatter(formatter)
logger.addHandler(handler)


class GeminiAPIHandler(BaseAPIHandler):
    """
    Handler for Gemini API requests.
    Implements the handle_request method from BaseAPIHandler.
    """
    def __init__(self):
        super().__init__("gemini")
        # Define supported models with parameter counts where publicly confirmed
        self.models = [
            {"name": "gemini-1.5-flash-8b", "parameters": "8b"},
            {"name": "gemma-3-27b-it", "parameters": "27b"}
        ]
        logger.info("GeminiAPIHandler registered with models: %s", [m["name"] for m in self.models])

    def handle_request(self, request_handler, request_data):
        """
        Process a /v1/chat/completions request for Gemini models.
        
        Args:
            request_handler: The HTTP request handler instance
            request_data: The parsed JSON request data
        """
        # Check that the endpoint is correct
        if request_handler.path != "/v1/chat/completions":
            request_handler.send_response(404)
            request_handler.end_headers()
            request_handler.wfile.write(b"Endpoint not found. Use /v1/chat/completions")
            return

        # Check for API key
        api_key = os.environ.get("GEMINI_API_KEY")
        if not api_key:
            request_handler.send_response(500)
            request_handler.end_headers()
            request_handler.wfile.write(b"GEMINI_API_KEY environment variable not set")
            return

        # Extract and handle model name
        model_name = request_data.get("model", "gemini-1.5-flash")
        # Strip any vendor prefix (e.g., "gemma3:27b" -> "gemini-1.5-flash")
        if ":" in model_name:
            original_model = model_name
            model_name = "gemini-1.5-flash"
            logger.info(f"Remapped model {original_model} to {model_name}")

        # Enforce non-streaming mode
        if request_data.get("stream", False):
            logger.warning("Stream=true requested but forcing non-streaming mode")

        # Process the 'messages' field
        messages = request_data.get("messages", [])
        if not messages:
            request_handler.send_response(400)
            request_handler.end_headers()
            request_handler.wfile.write(b"Request body must contain a 'messages' array")
            return

        # Process the last message (common practice)
        last_message = messages[-1]
        if last_message.get("role") != "user":
            logger.warning("Last message role is not 'user'. Processing anyway")

        content = last_message.get("content")
        gemini_parts = []
        combined_text_prompt = ""
        image_count = 0

        # Process text content
        if isinstance(content, str):
            text = content.strip()
            if text:
                gemini_parts.append({"text": text})
                combined_text_prompt = text
            else:
                logger.warning("Received empty string content")
                
        # Process multimodal content
        elif isinstance(content, list):
            text_parts = []
            for item in content:
                if not isinstance(item, dict):
                    continue
                    
                item_type = item.get("type")
                if item_type == "text":
                    text = item.get("text", "").strip()
                    if text:
                        gemini_parts.append({"text": text})
                        text_parts.append(text)
                        
                elif item_type == "image_url":
                    image_url_data = item.get("image_url")
                    if not isinstance(image_url_data, dict) or "url" not in image_url_data:
                        logger.warning(f"Skipping invalid image_url item: {item}")
                        continue
                        
                    url = image_url_data["url"]
                    # Handle data URI
                    if url.startswith("data:"):
                        try:
                            header, base64_data = url.split(",", 1)
                            mime_match = re.match(r"data:(image\/[a-zA-Z+.-]+);base64", header)
                            if mime_match:
                                mime_type = mime_match.group(1)
                                gemini_parts.append({
                                    "inline_data": {
                                        "mime_type": mime_type,
                                        "data": base64_data
                                    }
                                })
                                image_count += 1
                                logger.debug(f"Successfully parsed image: type={mime_type}")
                            else:
                                logger.warning(f"Could not extract MIME type from data URI: {header}")
                        except Exception as e:
                            logger.error(f"Error processing image: {e}")
            
            combined_text_prompt = " ".join(text_parts)
        else:
            request_handler.send_response(400)
            request_handler.end_headers()
            request_handler.wfile.write(b"Invalid 'content' format in message")
            return

        if not gemini_parts:
            request_handler.send_response(400)
            request_handler.end_headers()
            request_handler.wfile.write(b"No valid content found in the message")
            return

        # Build Gemini API URL and payload
        gemini_url = f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent?key={api_key}"
        payload = {"contents": [{"parts": gemini_parts}]}
        
        logger.info(f"Calling Gemini API for model {model_name} with {len(gemini_parts)} parts ({image_count} images)")
        
        # Call Gemini API
        try:
            req = urllib.request.Request(
                gemini_url,
                data=json.dumps(payload).encode("utf-8"),
                method="POST"
            )
            req.add_header("Content-Type", "application/json")
            req.add_header("User-Agent", "ObserverAI-Gemini-Proxy/0.2.0")
            
            with urllib.request.urlopen(req, timeout=90) as resp:
                response_status = resp.status
                response_bytes = resp.read()
                
                if response_status < 200 or response_status >= 300:
                    logger.error(f"Gemini API returned error status {response_status}")
                    request_handler.send_response(502)
                    request_handler.end_headers()
                    request_handler.wfile.write(f"Gemini API Error: Status {response_status}".encode())
                    return
                
                response_data = json.loads(response_bytes)
                
        except urllib.error.HTTPError as e:
            error_body = e.read().decode('utf-8', errors='replace')
            logger.error(f"Gemini API HTTP error: {e.code} - {error_body[:500]}")
            
            try:
                error_json = json.loads(error_body)
                error_message = error_json.get('error', {}).get('message', error_body)
            except json.JSONDecodeError:
                error_message = error_body
                
            request_handler.send_response(e.code if e.code >= 400 else 502)
            request_handler.send_header('Content-Type', 'application/json')
            self.send_cors_headers(request_handler)
            request_handler.end_headers()
            error_resp = {"error": {"message": f"Gemini API Error: {error_message}", "type": "gemini_api_error", "code": e.code}}
            request_handler.wfile.write(json.dumps(error_resp).encode())
            return
            
        except urllib.error.URLError as e:
            logger.error(f"Gemini API URL error: {str(e)}")
            request_handler.send_response(504)
            request_handler.end_headers()
            request_handler.wfile.write(f"Gateway Timeout: Could not connect to Gemini API - {str(e)}".encode())
            return
            
        except Exception as e:
            logger.error(f"Unexpected error: {str(e)}")
            request_handler.send_response(500)
            request_handler.end_headers()
            request_handler.wfile.write(b"Internal Server Error")
            return

        # Process Gemini response
        generated_text = ""
        finish_reason = "stop"  # Default finish reason
        
        try:
            candidate = response_data["candidates"][0]
            if "content" in candidate and "parts" in candidate["content"]:
                generated_text = "".join(part.get("text", "") for part in candidate["content"]["parts"])
                
            # Map finish reason
            finish_reason_gemini = candidate.get("finishReason", "STOP").lower()
            if finish_reason_gemini not in ['stop', 'max_tokens']:
                finish_reason = finish_reason_gemini
                logger.warning(f"Gemini finish reason: {finish_reason_gemini}")
                
        except (KeyError, IndexError, TypeError) as e:
            logger.error(f"Error extracting text from Gemini response: {e}")
            generated_text = "[Error extracting response text]"

        # Log conversation
        self.log_conversation(combined_text_prompt, generated_text, model_name, image_count)

        # Format response in OpenAI style
        openai_response = {
            "id": "gemini-chatcmpl-" + secrets.token_hex(12),
            "object": "chat.completion",
            "created": int(time.time()),
            "model": model_name,
            "choices": [
                {
                    "index": 0,
                    "message": {"role": "assistant", "content": generated_text},
                    "finish_reason": finish_reason
                }
            ],
            "usage": {
                "prompt_tokens": len(combined_text_prompt) // 4 + (image_count * 256),  # Approximate
                "completion_tokens": len(generated_text) // 4,
                "total_tokens": (len(combined_text_prompt) // 4) + (image_count * 256) + (len(generated_text) // 4)
            }
        }

        # Send response
        request_handler.send_response(200)
        request_handler.send_header("Content-Type", "application/json")
        self.send_cors_headers(request_handler)
        request_handler.end_headers()
        request_handler.wfile.write(json.dumps(openai_response).encode("utf-8"))
        logger.info(f"Successfully processed request. Response length: {len(generated_text)}")

    def send_cors_headers(self, request_handler):
        """Add CORS headers to the response"""
        # For development: allow all origins
        request_handler.send_header("Access-Control-Allow-Origin", "*")
        request_handler.send_header("Access-Control-Allow-Methods", "POST, GET, OPTIONS")
        request_handler.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization, User-Agent, X-Observer-Auth-Code")
        request_handler.send_header("Access-Control-Allow-Credentials", "true")
        request_handler.send_header("Access-Control-Max-Age", "86400")


# Register the handler for module mode
gemini_handler = GeminiAPIHandler()

