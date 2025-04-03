#!/usr/bin/env python3
import os
import json
from datetime import datetime
from pathlib import Path
import logging
import httpx # Import httpx here if base class needs it, or just in subclasses

logger = logging.getLogger("api_handlers")
# Basic logging setup if not configured elsewhere
# logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - [%(name)s] - %(message)s')

# Global registry for API handlers
API_HANDLERS = {}

class HandlerError(Exception):
    """Custom exception for handler-specific errors."""
    def __init__(self, message, status_code=500):
        super().__init__(message)
        self.status_code = status_code

class ConfigError(HandlerError):
    """Error for configuration issues like missing API keys."""
    def __init__(self, message):
        super().__init__(message, status_code=500) # Internal server error as config is wrong

class BackendAPIError(HandlerError):
    """Error originating from the downstream AI API."""
    def __init__(self, message, status_code=502): # Bad Gateway by default
        super().__init__(message, status_code)


class BaseAPIHandler:
    """Base class for asynchronous API handlers."""
    def __init__(self, name):
        self.name = name
        self.models = []  # List of supported models { "name": "model-id", "parameters": "optional", ... }
        API_HANDLERS[name] = self
        logger.info("Registered API handler: '%s'", name)
        # Optional: Create a shared httpx client if needed across handlers (managing lifecycle is key)
        # self.http_client = httpx.AsyncClient(timeout=90.0) # Example

    def get_models(self):
        """Return the list of models supported by this handler."""
        return self.models

    async def handle_request(self, request_data: dict) -> dict:
        """
        Process the request asynchronously.
        Subclasses MUST override this method.

        Args:
            request_data: The parsed JSON request data (dictionary).

        Returns:
            A dictionary representing the successful JSON response payload.

        Raises:
            ConfigError: If configuration (like API key) is missing.
            BackendAPIError: If the downstream API call fails.
            ValueError: If the request_data is invalid.
            NotImplementedError: If the subclass doesn't implement this.
            Exception: For other unexpected errors.
        """
        raise NotImplementedError(f"Handler '{self.name}' must implement handle_request")

    def log_conversation(self, prompt, response, model_name, images_count=0):
        """Log conversation details to a file."""
        # Keep this synchronous, logging IO is usually acceptable to block briefly
        log_dir = Path("./logs")
        log_dir.mkdir(exist_ok=True)
        log_file = log_dir / f"{self.name}_conversations.log"
        # Ensure response is serializable (it should be if it's the final text)
        if not isinstance(response, (str, int, float, bool, type(None))):
             response_log = "[Object]" # Avoid logging complex objects directly
        else:
             response_log = response

        entry = {
            "timestamp": datetime.now().isoformat(),
            "model": model_name,
            "prompt": prompt, # Assumes prompt is simple text for logging
            "response": response_log,
            "images_count": images_count
        }
        try:
            with open(log_file, "a", encoding="utf-8") as f:
                f.write(json.dumps(entry) + "\n")
        except Exception as log_e:
            logger.error(f"Failed to write conversation log for {self.name}: {log_e}")


# --- Import and Instantiate REWRITTEN Handlers ---
# Ensure these files contain the rewritten async versions below
from gemini_handler import GeminiAPIHandler
from openrouter_handler import OpenRouterAPIHandler

# Instantiate and register the handlers.
# The __init__ method in BaseAPIHandler adds them to API_HANDLERS
gemini_handler = GeminiAPIHandler()
openrouter_handler = OpenRouterAPIHandler()

logger.info("Initialized API Handlers. Available: %s", list(API_HANDLERS.keys()))
# --- End Handler Instantiation ---
