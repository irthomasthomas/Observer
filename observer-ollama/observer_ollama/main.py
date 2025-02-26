#!/usr/bin/env python3
import http.server
import socketserver
import urllib.request
import ssl
import subprocess
import os
import sys
import signal
import threading
import time

class OllamaProxy(http.server.BaseHTTPRequestHandler):
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
        origin = self.headers.get('Origin', '*')
        self.send_header("Access-Control-Allow-Origin", origin)
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        self.send_header("Access-Control-Allow-Credentials", "true")
    
    def proxy_request(self, method):
        target_url = f"http://localhost:11434{self.path}"
        content_length = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(content_length) if content_length > 0 else None
        
        req = urllib.request.Request(target_url, data=body, method=method)
        
        # Forward content type header
        if 'Content-Type' in self.headers:
            req.add_header('Content-Type', self.headers['Content-Type'])
        
        # Use longer timeout for generate endpoint
        timeout = 300 if self.path == '/api/generate' else 60
        
        try:
            with urllib.request.urlopen(req, timeout=timeout) as response:
                self.send_response(response.status)
                self.send_cors_headers()
                self.end_headers()
                self.wfile.write(response.read())
        except Exception as e:
            print(f"Error: {str(e)}")
            self.send_response(502)
            self.send_cors_headers()
            self.end_headers()
            self.wfile.write(f"Proxy error: {str(e)}".encode())

def check_ollama_running():
    """Check if Ollama is already running on port 11434"""
    try:
        with urllib.request.urlopen("http://localhost:11434/api/version", timeout=2) as response:
            return True
    except:
        return False

def start_ollama_server():
    """Start Ollama server as a subprocess and capture its logs"""
    try:
        print("Starting Ollama server...")
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
                print(f"[Ollama] {line.strip()}")
        
        log_thread = threading.Thread(target=read_logs, daemon=True)
        log_thread.start()
        
        # Wait for Ollama to start
        for _ in range(10):
            if check_ollama_running():
                print("Ollama server is running")
                return process
            time.sleep(1)
        
        print("Ollama failed to start in time")
        return process
    except FileNotFoundError:
        print("Error: Ollama executable not found. Please install Ollama first.")
        sys.exit(1)

def main():
    # Handle Ctrl+C gracefully
    def signal_handler(sig, frame):
        print("Shutting down...")
        if ollama_process:
            ollama_process.terminate()
        httpd.shutdown()
        sys.exit(0)
    
    signal.signal(signal.SIGINT, signal_handler)
    
    # Start Ollama if not already running
    ollama_process = None
    if not check_ollama_running():
        ollama_process = start_ollama_server()
    else:
        print("Ollama is already running")
    
    # Generate certificate if needed
    cert_path = os.path.join(os.path.expanduser("~"), ".config", "observer-ollama")
    os.makedirs(cert_path, exist_ok=True)
    
    cert_file = os.path.join(cert_path, "cert.pem")
    key_file = os.path.join(cert_path, "key.pem")
    
    if not os.path.exists(cert_file) or not os.path.exists(key_file):
        print("Generating certificates...")
        cmd = f"openssl req -x509 -newkey rsa:2048 -keyout {key_file} -out {cert_file} -days 365 -nodes -subj '/CN=localhost'"
        subprocess.run(cmd, shell=True)
    
    PORT = 3838
    httpd = socketserver.ThreadingTCPServer(("", PORT), OllamaProxy)
    
    # Setup SSL
    context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    context.load_cert_chain(cert_file, key_file)
    httpd.socket = context.wrap_socket(httpd.socket, server_side=True)
    
    print(f"Visit link: https://localhost:{PORT} in your browser to approve https")
    
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        httpd.server_close()
        if ollama_process:
            ollama_process.terminate()
    
if __name__ == "__main__":
    main()
