#!/usr/bin/env python3
import os
import json
from datetime import datetime
from pathlib import Path
import logging

logger = logging.getLogger("api_handlers")

# Global registry for API handlers
API_HANDLERS = {}

class BaseAPIHandler:
    """Base class for API handlers."""
    def __init__(self, name):
        self.name = name
        self.models = []  # List of supported models
        API_HANDLERS[name] = self
        logger.info("Registered API handler: '%s'", name)

    def get_models(self):
        """Return the list of models supported by this handler."""
        return self.models

    def handle_request(self, request_handler, request_data):
        """
        Process the request.
        Subclasses must override this method.
        """
        request_handler.send_response(501)
        request_handler.end_headers()
        request_handler.wfile.write(b"Not implemented.")

    def log_conversation(self, prompt, response, model_name, images_count=0):
        """Log conversation details to a file."""
        log_dir = Path("./logs")
        log_dir.mkdir(exist_ok=True)
        log_file = log_dir / f"{self.name}_conversations.log"
        entry = {
            "timestamp": datetime.now().isoformat(),
            "model": model_name,
            "prompt": prompt,
            "response": response,
            "images_count": images_count
        }
        with open(log_file, "a", encoding="utf-8") as f:
            f.write(json.dumps(entry) + "\n")



from gemini_handler import GeminiAPIHandler

# Instantiate and register the Gemini handler.
gemini_handler = GeminiAPIHandler()
logger.info("API_HANDLERS available: %s", list(API_HANDLERS.keys()))
