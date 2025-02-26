#!/usr/bin/env python3
import http.server
import socketserver
import urllib.request
import urllib.error
import ssl
import subprocess
import os
import sys
import argparse
import logging
import signal
import socket
import threading
import time
from pathlib import Path

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)
logger = logging.getLogger('ollama-proxy')

class OllamaProxy(http.server.BaseHTTPRequestHandler):
    # Quieter logs - only errors
    def log_message(self, format, *args):
        if args[1][0] in ['4', '5']:  # Only log 4xx and 5xx errors
            logger.error("%s - %s", self.address_string(), format % args)
    
    def do_OPTIONS(self):
        self.send_response(200)
        self.send_cors_headers()
        self.send_header("Content-Length", "0")
        self.end_headers()
    
    def do_GET(self):
        self.proxy_request("GET")
    
    def do_POST(self):
        self.proxy_request("POST")
    
    def send_cors_headers(self):
        origin = self.headers.get('Origin', '')
        allowed_origins = ['https://app.observer-ai.com', 'http://localhost:3838', 'http://localhost:3001']
        
        if origin in allowed_origins:
            self.send_header("Access-Control-Allow-Origin", origin)
        else:
            self.send_header("Access-Control-Allow-Origin", "https://app.observer-ai.com")
            
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization, User-Agent")
        self.send_header("Access-Control-Allow-Credentials", "true")
        self.send_header("Access-Control-Max-Age", "86400")  # 24 hours
    
    def proxy_request(self, method):
        target_url = f"http://localhost:11434{self.path}"
        content_length = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(content_length) if content_length > 0 else None
        
        req = urllib.request.Request(target_url, data=body, method=method)
        
        # Forward relevant headers
        headers_to_forward = ['Content-Type', 'Authorization', 'User-Agent']
        for header in headers_to_forward:
            if header in self.headers:
                req.add_header(header, self.headers[header])
        
        # Use a much longer timeout for /api/generate endpoint
        timeout = 300 if self.path == '/api/generate' else 60  # 5 minutes for generate
        
        try:
            with urllib.request.urlopen(req, timeout=timeout) as response:
                self.send_response(response.status)
                
                # Forward response headers excluding problematic ones
                for key, val in response.getheaders():
                    if key.lower() not in ['transfer-encoding', 'connection', 'content-length']:
                        self.send_header(key, val)
                
                self.send_cors_headers()
                self.end_headers()
                
                # Stream the response back
                while True:
                    chunk = response.read(4096)  # Read in chunks
                    if not chunk:
                        break
                    self.wfile.write(chunk)
                    
        except urllib.error.HTTPError as e:
            # Forward HTTP errors from the target server
            self.send_response(e.code)
            self.send_cors_headers()
            self.end_headers()
            if e.fp:
                self.wfile.write(e.read())
            else:
                self.wfile.write(f"Error: {str(e)}".encode())
        
        except socket.timeout:
            logger.error(f"Request to {target_url} timed out")
            self.send_response(504)  # Gateway Timeout
            self.send_cors_headers()
            self.end_headers()
            self.wfile.write(f"Request to Ollama timed out. For large models, the first request may take longer.".encode())
                
        except Exception as e:
            logger.error(f"Proxy error: {str(e)}")
            self.send_response(502)  # Bad Gateway
            self.send_cors_headers()
            self.end_headers()
            self.wfile.write(f"Proxy error: {str(e)}".encode())

def check_ollama_running():
    """Check if Ollama is already running on port 11434"""
    try:
        with urllib.request.urlopen("http://localhost:11434/api/version", timeout=2) as response:
            if response.status == 200:
                version = response.read().decode('utf-8')
                logger.info(f"Ollama server is running: {version}")
                return True
    except Exception as e:
        logger.debug(f"Ollama server is not running: {str(e)}")
        return False

def start_ollama_server():
    """Start Ollama server as a subprocess and capture its logs"""
    try:
        logger.info("Starting Ollama server...")
        process = subprocess.Popen(
            ["ollama", "serve"], 
            stdout=subprocess.PIPE, 
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1
        )
        
        # Start a thread to read and display Ollama logs
        def read_logs():
            for line in process.stdout:
                logger.info(f"[Ollama] {line.strip()}")
        
        log_thread = threading.Thread(target=read_logs, daemon=True)
        log_thread.start()
        
        # Wait for Ollama to start
        for attempt in range(1, 11):
            logger.info(f"Waiting for Ollama to start (attempt {attempt}/10)...")
            if check_ollama_running():
                logger.info("Ollama server is running")
                return process
            time.sleep(1)
        
        logger.warning("Ollama did not start within expected time. Continuing anyway...")
        return process
    except FileNotFoundError:
        logger.error("Ollama executable not found. Please install Ollama first.")
        sys.exit(1)

def prepare_certificates(cert_dir):
    """Prepare SSL certificates"""
    cert_path = Path(cert_dir) / "cert.pem"
    key_path = Path(cert_dir) / "key.pem"
    
    # Create certificate directory if it doesn't exist
    os.makedirs(cert_dir, exist_ok=True)
    
    # Check if we need to generate certificates
    if not cert_path.exists() or not key_path.exists():
        logger.info("Generating SSL certificates...")
        cmd = [
            "openssl", "req", "-x509", 
            "-newkey", "rsa:4096", 
            "-sha256", 
            "-days", "365", 
            "-nodes", 
            "-keyout", str(key_path), 
            "-out", str(cert_path),
            "-subj", "/CN=localhost"
        ]
        try:
            subprocess.run(cmd, check=True, capture_output=True)
            logger.info(f"Certificates generated at {cert_dir}")
        except subprocess.CalledProcessError as e:
            logger.error(f"Failed to generate certificates: {e.stderr.decode()}")
            sys.exit(1)
    else:
        logger.info(f"Using existing certificates from {cert_dir}")
        
    return cert_path, key_path

def run_server(port, cert_dir, auto_start):
    """Start the proxy server"""
    # Prepare certificates
    cert_path, key_path = prepare_certificates(cert_dir)
    
    # Start Ollama if not running and auto_start is enabled
    ollama_process = None
    if auto_start and not check_ollama_running():
        ollama_process = start_ollama_server()
    elif not check_ollama_running():
        logger.warning("Ollama is not running. Proxy may not work until Ollama server is available.")
    else:
        logger.info("Ollama is already running")
    
    # Create server
    handler = OllamaProxy
    httpd = socketserver.ThreadingTCPServer(("", port), handler)
    
    # Configure SSL
    context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    context.minimum_version = ssl.TLSVersion.TLSv1_2
    context.load_cert_chain(certfile=cert_path, keyfile=key_path)
    httpd.socket = context.wrap_socket(httpd.socket, server_side=True)
    
    # Setup graceful shutdown
    def signal_handler(sig, frame):
        logger.info("Shutting down...")
        if ollama_process:
            logger.info("Terminating Ollama process...")
            ollama_process.terminate()
        httpd.shutdown()
        sys.exit(0)
    
    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)
    
    # Start server
    logger.info(f"Proxy running at https://localhost:{port}")
    logger.info("Press Ctrl+C to stop")
    httpd.serve_forever()

def main():
    """Main entry point"""
    parser = argparse.ArgumentParser(description="Ollama HTTPS Proxy Server")
    parser.add_argument("--port", type=int, default=3838, help="Port to run the proxy server on")
    parser.add_argument("--cert-dir", default="./certs", help="Directory to store certificates")
    parser.add_argument("--debug", action="store_true", help="Enable debug logging")
    parser.add_argument("--dev", action="store_true", help="Development mode (allows all origins)")
    parser.add_argument("--no-start", action="store_true", help="Don't automatically start Ollama if not running")
    
    args = parser.parse_args()
    
    if args.debug:
        logger.setLevel(logging.DEBUG)
    
    # If in dev mode, modify the OllamaProxy class to allow all origins
    if args.dev:
        logger.info("Running in development mode - allowing all origins")
        def dev_send_cors_headers(self):
            origin = self.headers.get('Origin', '')
            self.send_header("Access-Control-Allow-Origin", origin or "*")
            self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
            self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization, User-Agent")
            self.send_header("Access-Control-Allow-Credentials", "true")
            self.send_header("Access-Control-Max-Age", "86400")
        
        OllamaProxy.send_cors_headers = dev_send_cors_headers
    
    run_server(args.port, args.cert_dir, not args.no_start)

if __name__ == "__main__":
    main()
