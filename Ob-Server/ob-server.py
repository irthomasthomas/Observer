#!/usr/bin/env python3
import http.server
import socketserver
import ssl
import os
import sys
import argparse
import logging
import json
import socket
from ssl_handler import create_ssl_context
import api_handlers  

logger = logging.getLogger("ob-server")
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S"
)

class APIServerHandler(http.server.BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        logger.info("%s - %s", self.address_string(), format % args)

    def send_cors_headers(self):
        origin = self.headers.get("Origin", "*")
        self.send_header("Access-Control-Allow-Origin", origin)
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization, User-Agent")
        self.send_header("Access-Control-Allow-Credentials", "true")
        self.send_header("Access-Control-Max-Age", "86400")

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_cors_headers()
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_GET(self):
        if self.path == "/api/models":
            # List all models from all registered API handlers.
            models = []
            for handler in api_handlers.API_HANDLERS.values():
                models.extend(handler.get_models())
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_cors_headers()
            self.end_headers()
            self.wfile.write(json.dumps({"models": models}).encode("utf-8"))
        elif self.path == "/api/version":
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_cors_headers()
            self.end_headers()
            self.wfile.write(json.dumps({"version": "0.2.0", "server": "Observer AI API Server"}).encode("utf-8"))
        else:
            self.send_response(404)
            self.end_headers()
            self.wfile.write(b"Not Found")

    def do_POST(self):
        # Only handle POST requests for API endpoints (e.g. /v1/...)
        if not self.path.startswith("/v1/"):
            self.send_response(404)
            self.end_headers()
            self.wfile.write(b"Not Found")
            return
        try:
            length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(length) if length else b""
            request_data = json.loads(body)
        except Exception as e:
            self.send_response(400)
            self.end_headers()
            self.wfile.write(b"Invalid JSON")
            return

        # Determine which API handler supports the requested model.
        model_name = request_data.get("model", "")
        selected_handler = None
        for handler in api_handlers.API_HANDLERS.values():
            supported = [m["name"] for m in handler.get_models()]
            if model_name in supported:
                selected_handler = handler
                break
        if selected_handler:
            logger.info("Routing request for model '%s' to handler '%s'.", model_name, selected_handler.name)
            selected_handler.handle_request(self, request_data)
        else:
            self.send_response(400)
            self.end_headers()
            self.wfile.write(b"Model not supported.")

def get_local_ip():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "0.0.0.0"

def run_server(port, cert_dir):
    ssl_context = create_ssl_context(cert_dir)
    httpd = socketserver.ThreadingTCPServer(("", port), APIServerHandler)
    httpd.socket = ssl_context.wrap_socket(httpd.socket, server_side=True)
    local_ip = get_local_ip()
    print("\nObserver AI API Server running:")
    print(f"  Local:   https://localhost:{port}/")
    print(f"  Network: https://{local_ip}:{port}/\n")
    print("Available API handlers:")
    for name in api_handlers.API_HANDLERS.keys():
        print(f"  - {name}")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down server...")
        httpd.server_close()

def main():
    parser = argparse.ArgumentParser(description="Observer AI API Server")
    parser.add_argument("--port", type=int, default=3838, help="Port number to run the server on")
    parser.add_argument("--cert-dir", default="./certs", help="Directory where SSL certificates are stored")
    args = parser.parse_args()
    run_server(args.port, args.cert_dir)

if __name__ == "__main__":
    main()
