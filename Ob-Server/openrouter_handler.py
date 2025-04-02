#!/usr/bin/env python3
"""
OpenRouter Handler Module - Minimal Version
"""

import os
import json
import urllib.request
import urllib.error
import logging
from api_handlers import BaseAPIHandler

# Set up logging
logger = logging.getLogger("openrouter_handler")

class OpenRouterAPIHandler(BaseAPIHandler):
    def __init__(self):
        super().__init__("openrouter")
        # Define supported models
        self.models = [
            {"name": "deepseek/deepseek-chat-v3-0324:free", "parameters": "70b"}
        ]
        logger.info("OpenRouterAPIHandler registered with models: %s", [m["name"] for m in self.models])

    def handle_request(self, request_handler, request_data):
        # Check for API key
        api_key = os.environ.get("OPENROUTER_API_KEY")
        if not api_key:
            request_handler.send_response(500)
            request_handler.end_headers()
            request_handler.wfile.write(b"OPENROUTER_API_KEY environment variable not set")
            return

        # Extract the last user message for logging
        messages = request_data.get("messages", [])
        prompt_text = ""
        if messages and isinstance(messages[-1].get("content"), str):
            prompt_text = messages[-1].get("content", "")

        # Call OpenRouter API
        openrouter_url = "https://openrouter.ai/api/v1/chat/completions"
        try:
            req = urllib.request.Request(
                openrouter_url,
                data=json.dumps(request_data).encode("utf-8"),
                method="POST"
            )
            req.add_header("Content-Type", "application/json")
            req.add_header("Authorization", f"Bearer {api_key}")
            
            with urllib.request.urlopen(req, timeout=90) as resp:
                response_bytes = resp.read()
                response_data = json.loads(response_bytes)
                
        except (urllib.error.HTTPError, urllib.error.URLError, Exception) as e:
            logger.error(f"OpenRouter API error: {str(e)}")
            request_handler.send_response(502)
            request_handler.end_headers()
            request_handler.wfile.write(f"OpenRouter API Error: {str(e)}".encode())
            return

        # Extract response text for logging
        response_text = ""
        try:
            if 'choices' in response_data and response_data['choices']:
                response_text = response_data['choices'][0]['message']['content']
        except:
            pass

        # Log the conversation
        model_name = request_data.get("model", "unknown")
        self.log_conversation(prompt_text, response_text, model_name)

        # Send the response
        request_handler.send_response(200)
        request_handler.send_header("Content-Type", "application/json")
        request_handler.end_headers()
        request_handler.wfile.write(json.dumps(response_data).encode("utf-8"))

# Register the handler
openrouter_handler = OpenRouterAPIHandler()
