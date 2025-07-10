# ollama_proxy/handler.py
import http.server
import json
import logging
from .cors import CorsMixin
from . import translator
from . import ollama_client

logger = logging.getLogger('ollama-proxy.handler')

class OllamaProxyHandler(CorsMixin, http.server.BaseHTTPRequestHandler):
    """
    The main request handler.
    - Inherits CORS logic from CorsMixin.
    - Routes requests: some are translated, some are proxied directly.
    - Delegates all communication with Ollama to the ollama_client module.
    """
    
    # Quieter logging
    def log_message(self, format, *args):
        if '404' in args[1]: # Log 404s for debugging paths
             logger.warning("%s - %s", self.address_string(), format % args)
        elif args[1][0] in ['4', '5']:  # Log other 4xx and 5xx errors
            logger.error("%s - %s", self.address_string(), format % args)
        else:
            logger.debug("%s - %s", self.address_string(), format % args)

    def do_OPTIONS(self):
        """Handle pre-flight CORS requests."""
        self.send_response(204) # No Content
        self.send_cors_headers()
        self.end_headers()

    def do_GET(self):
        """Handle GET requests by proxying them."""
        # Your special /exec and /quota endpoints could be routed here if needed
        # For now, we'll just proxy everything.
        self._proxy_request('GET')

    def do_POST(self):
        """Handle POST requests, with special translation for chat completions."""
        self._proxy_request('POST')

    def _proxy_request(self, method):
        """Generic proxying logic."""
        content_length = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(content_length) if content_length > 0 else None
        
        path = self.path
        
        # The core translation logic
        is_chat_completions = (method == 'POST' and self.path == '/v1/chat/completions')
        if is_chat_completions:
            original_model = json.loads(body).get('model', 'unknown') if body else 'unknown'
            path, body = translator.translate_request_to_ollama(body)

        # Delegate the actual network call to the client
        status, headers, response_iterator = ollama_client.forward_to_ollama(
            method, path, self.headers, body
        )
        
        # --- Start sending the response back to the original client ---
        self.send_response(status)
        
        # Send original headers from Ollama, but not problematic ones
        for key, val in headers:
            if key.lower() not in ['transfer-encoding', 'connection', 'content-length']:
                self.send_header(key, val)

        # Always send our own CORS headers
        self.send_cors_headers()

        # For non-streaming, translated responses, we need to read the whole body first
        if is_chat_completions and not (json.loads(body).get('stream', False) if body else False):
            full_response_body = b''.join(response_iterator)
            final_body = translator.translate_response_to_openai(full_response_body, original_model)
            self.send_header('Content-Length', str(len(final_body)))
            self.end_headers()
            self.wfile.write(final_body)
        else:
            # For all other requests (including streaming), stream the response
            self.end_headers()
            for chunk in response_iterator:
                try:
                    self.wfile.write(chunk)
                except BrokenPipeError:
                    logger.warning("Client disconnected during stream.")
                    break
