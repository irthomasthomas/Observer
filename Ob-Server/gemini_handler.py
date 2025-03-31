#!/usr/bin/env python3
"""
Gemini Handler Module

This module can work in two modes:
1. Module Mode: When imported, it registers itself (via gemini_handler) with its supported model list.
2. Standalone Mode: When run directly, it starts an HTTP server (no SSL) on a specified port to handle
   /v1/chat/completions POST requests.
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
import http.server
import socketserver
import argparse

# Import BaseAPIHandler from your api_handlers module.
# (Ensure that api_handlers.py is in your PYTHONPATH)
from api_handlers import BaseAPIHandler

# Set up basic logging.
logger = logging.getLogger("gemini_handler")
logger.setLevel(logging.INFO)
handler = logging.StreamHandler()
formatter = logging.Formatter('%(asctime)s - %(levelname)s - [%(name)s] - %(message)s')
handler.setFormatter(formatter)
logger.addHandler(handler)


class GeminiAPIHandler(BaseAPIHandler):
    def __init__(self):
        super().__init__("gemini")
        # Define supported models.
        self.models = [
            {"name": "gemini-1.5-flash", "description": "Default Gemini model"}
        ]
        logger.info("GeminiAPIHandler models registered: %s", self.models)

    def handle_request(self, request_handler, request_data):
        """
        Process a /v1/chat/completions request.
        Enforces non-streaming mode, parses text/multimodal content,
        calls the Gemini API, and returns a response in OpenAI style.
        """
        # Check that the endpoint is correct.
        if request_handler.path != "/v1/chat/completions":
            request_handler.send_response(404)
            request_handler.end_headers()
            request_handler.wfile.write(b"Endpoint not found.")
            return

        # Check for API key.
        api_key = os.environ.get("GEMINI_API_KEY")
        if not api_key:
            request_handler.send_response(500)
            request_handler.end_headers()
            request_handler.wfile.write(b"GEMINI_API_KEY not set.")
            return

        # Extract and remap model name.
        model_name = request_data.get("model", "gemini-1.5-flash")
        if ":" in model_name:
            logger.debug("Model '%s' remapped to 'gemini-1.5-flash'", model_name)
            model_name = "gemini-1.5-flash"

        # Enforce non-streaming mode.
        if request_data.get("stream", False):
            logger.warning("Received stream=true; forcing non-streaming mode.")

        # Process the 'messages' field.
        messages = request_data.get("messages", [])
        if not messages:
            request_handler.send_response(400)
            request_handler.end_headers()
            request_handler.wfile.write(b"'messages' field is required.")
            return

        last_message = messages[-1]
        content = last_message.get("content")
        gemini_parts = []
        prompt_text = ""
        image_count = 0

        if isinstance(content, str):
            text = content.strip()
            if text:
                gemini_parts.append({"text": text})
                prompt_text = text
        elif isinstance(content, list):
            text_parts = []
            for item in content:
                if isinstance(item, dict):
                    if item.get("type") == "text":
                        text = item.get("text", "").strip()
                        if text:
                            gemini_parts.append({"text": text})
                            text_parts.append(text)
                    elif item.get("type") == "image_url":
                        url = item.get("image_url", {}).get("url", "")
                        if url.startswith("data:"):
                            try:
                                header, b64data = url.split(",", 1)
                                if re.match(r"data:(image\/[a-zA-Z+.-]+);base64", header):
                                    gemini_parts.append({"inline_data": {"data": b64data}})
                                    image_count += 1
                            except Exception as e:
                                logger.error("Error processing image: %s", e)
            prompt_text = " ".join(text_parts)
        else:
            request_handler.send_response(400)
            request_handler.end_headers()
            request_handler.wfile.write(b"Invalid 'content' format.")
            return

        if not gemini_parts:
            request_handler.send_response(400)
            request_handler.end_headers()
            request_handler.wfile.write(b"No valid content found.")
            return

        # Build Gemini API URL and payload.
        gemini_url = f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent?key={api_key}"
        payload = {"contents": [{"parts": gemini_parts}]}
        logger.info("Calling Gemini API at URL: %s", gemini_url)
        logger.debug("Payload: %s", json.dumps(payload))

        try:
            req = urllib.request.Request(
                gemini_url,
                data=json.dumps(payload).encode("utf-8"),
                method="POST"
            )
            req.add_header("Content-Type", "application/json")
            req.add_header("User-Agent", "ObserverAI-Gemini-Proxy/0.2.0")
            with urllib.request.urlopen(req, timeout=90) as resp:
                response_bytes = resp.read()
                response_data = json.loads(response_bytes)
        except Exception as e:
            error_msg = f"Error calling Gemini API: {str(e)}"
            logger.error(error_msg)
            request_handler.send_response(502)
            request_handler.end_headers()
            request_handler.wfile.write(error_msg.encode("utf-8"))
            return

        generated_text = ""
        finish_reason = "stop"
        try:
            candidate = response_data["candidates"][0]
            if "content" in candidate and "parts" in candidate["content"]:
                generated_text = "".join(part.get("text", "") for part in candidate["content"]["parts"])
            finish_reason = candidate.get("finishReason", "stop").lower()
        except Exception as e:
            logger.error("Error processing Gemini response: %s", e)
            generated_text = "[Error processing response]"

        # Log the conversation.
        self.log_conversation(prompt_text, generated_text, model_name, image_count)

        # Format the response in OpenAI style.
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
                "prompt_tokens": len(prompt_text) // 4,
                "completion_tokens": len(generated_text) // 4,
                "total_tokens": (len(prompt_text) + len(generated_text)) // 4
            }
        }

        request_handler.send_response(200)
        request_handler.send_header("Content-Type", "application/json")
        request_handler.end_headers()
        request_handler.wfile.write(json.dumps(openai_response).encode("utf-8"))
        logger.info("Successfully processed request.")

    def log_conversation(self, prompt, response, model_name, images_count=0):
        """Log the conversation details to a file."""
        from datetime import datetime
        from pathlib import Path

        log_dir = Path("./logs")
        log_dir.mkdir(exist_ok=True)
        log_file = log_dir / "gemini_conversations.log"
        entry = {
            "timestamp": datetime.now().isoformat(),
            "model": model_name,
            "prompt": prompt,
            "response": response,
            "images_count": images_count
        }
        with open(log_file, "a", encoding="utf-8") as f:
            f.write(json.dumps(entry) + "\n")


# Register the handler for module mode.
gemini_handler = GeminiAPIHandler()


# ---------------- Standalone Mode ----------------

if __name__ == "__main__":
    class StandaloneHandler(http.server.BaseHTTPRequestHandler):
        def log_message(self, format, *args):
            logger.info("%s - %s", self.address_string(), format % args)

        def do_POST(self):
            if self.path != "/v1/chat/completions":
                self.send_response(404)
                self.end_headers()
                self.wfile.write(b"Endpoint not found.")
                return
            try:
                length = int(self.headers.get("Content-Length", 0))
                body = self.rfile.read(length) if length > 0 else b""
                request_data = json.loads(body)
            except Exception as e:
                self.send_response(400)
                self.end_headers()
                self.wfile.write(b"Invalid JSON.")
                return

            gemini_handler.handle_request(self, request_data)

        def do_GET(self):
            # Provide a simple status/version endpoint.
            if self.path in ["/", "/api/version"]:
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                resp = {
                    "version": "0.2.0",
                    "notice": "Gemini API Handler Standalone Mode",
                    "supported_endpoint": "/v1/chat/completions"
                }
                self.wfile.write(json.dumps(resp).encode("utf-8"))
            else:
                self.send_response(404)
                self.end_headers()
                self.wfile.write(b"Not Found.")

    def run_standalone_server(port):
        with socketserver.TCPServer(("", port), StandaloneHandler) as httpd:
            logger.info("Gemini Handler Standalone Server running on port %s", port)
            try:
                httpd.serve_forever()
            except KeyboardInterrupt:
                logger.info("Server stopped.")

    parser = argparse.ArgumentParser(description="Gemini API Handler Standalone Server")
    parser.add_argument("--port", type=int, default=3838, help="Port to run the server on")
    parser.add_argument("--debug", action="store_true", help="Enable debug logging")
    args = parser.parse_args()

    if args.debug:
        logger.setLevel(logging.DEBUG)
        logger.debug("Debug logging enabled.")

    run_standalone_server(args.port)

