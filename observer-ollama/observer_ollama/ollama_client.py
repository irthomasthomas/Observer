# ollama_proxy/ollama_client.py
import os
import urllib.request
import urllib.error
import socket
import logging

logger = logging.getLogger('ollama-proxy.client')

# --- Start of new/modified code ---

# Default values, can be overridden by environment variables or the function below
_OLLAMA_TARGET_HOST = os.environ.get("OLLAMA_SERVICE_HOST", "localhost")
_OLLAMA_TARGET_PORT = os.environ.get("OLLAMA_SERVICE_PORT", "11434")

# This will be the single source of truth for the target URL.
# It is initialized with defaults but can be changed by set_ollama_destination.
OLLAMA_BASE_URL = f"http://{_OLLAMA_TARGET_HOST}:{_OLLAMA_TARGET_PORT}"

def set_ollama_destination(host, port):
    """Updates the global Ollama destination URL."""
    global OLLAMA_BASE_URL
    OLLAMA_BASE_URL = f"http://{host}:{port}"
    logger.info(f"Ollama destination set to: {OLLAMA_BASE_URL}")

# --- End of new/modified code ---

def forward_to_ollama(method, path, headers, body):
    """
    Forwards a request to the Ollama service and streams the response.
    
    Returns:
        A tuple of (status_code, response_headers, response_iterator).
    """
    target_url = f"{OLLAMA_BASE_URL}{path}"
    logger.debug(f"Forwarding {method} request to: {target_url}")

    timeout = 300 if path == '/api/generate' else 60
    req = urllib.request.Request(target_url, data=body, method=method)
    
    for header in ['Content-Type', 'Authorization', 'User-Agent']:
        if header in headers:
            req.add_header(header, headers[header])

    try:
        response = urllib.request.urlopen(req, timeout=timeout)
        
        def response_iterator():
            while True:
                chunk = response.read(8192)
                if not chunk:
                    break
                yield chunk
        
        return (response.status, response.getheaders(), response_iterator())

    except urllib.error.HTTPError as e:
        logger.error(f"HTTP error from Ollama: {e.code} - {e.reason}")
        def error_iterator():
            if e.fp:
                while True:
                    chunk = e.fp.read(8192)
                    if not chunk:
                        break
                    yield chunk
        return (e.code, e.headers, error_iterator())

    except socket.timeout:
        logger.error(f"Request to {target_url} timed out")
        error_body = b"Gateway Timeout: The request to Ollama timed out."
        return (504, [('Content-Type', 'text/plain')], (c for c in [error_body]))

    except Exception as e:
        logger.error(f"Proxy error when connecting to Ollama: {e}")
        error_body = f"Bad Gateway: The proxy encountered an error. {e}".encode()
        return (502, [('Content-Type', 'text/plain')], (c for c in [error_body]))
