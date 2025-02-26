#!/usr/bin/env python3
import http.server
import socketserver
import urllib.request
import ssl
import subprocess
import os

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

def main():
    # Generate certificate if needed
    if not os.path.exists("cert.pem") or not os.path.exists("key.pem"):
        print("Generating certificates...")
        cmd = "openssl req -x509 -newkey rsa:2048 -keyout key.pem -out cert.pem -days 365 -nodes -subj '/CN=localhost'"
        subprocess.run(cmd, shell=True)
    
    PORT = 3838
    httpd = socketserver.ThreadingTCPServer(("", PORT), OllamaProxy)
    
    # Setup SSL
    context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    context.load_cert_chain("cert.pem", "key.pem")
    httpd.socket = context.wrap_socket(httpd.socket, server_side=True)
    
    print(f"Proxy running at https://localhost:{PORT}")
    httpd.serve_forever()

if __name__ == "__main__":
    main()
