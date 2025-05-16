#!/usr/bin/env python3
import argparse
import logging
import signal
import sys
import socketserver
import ssl
from .ssl_utils import prepare_certificates, get_local_ip
from .handle_ollama import OllamaProxy, check_ollama_running, start_ollama_server

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)
logger = logging.getLogger('ollama-proxy')

def run_server(port, cert_dir, auto_start, dev_mode):
    """Start the proxy server"""
    # Prepare certificates
    cert_path, key_path = prepare_certificates(cert_dir)
    
    # Start Ollama if not running and auto_start is enabled
    if auto_start and not check_ollama_running():
        start_ollama_server()
    elif not check_ollama_running():
        logger.warning("Ollama is not running. Proxy may not work until Ollama server is available.")
    else:
        logger.info("Ollama is already running")
    
    # Create server
    class CustomThreadingTCPServer(socketserver.ThreadingTCPServer):
        allow_reuse_address = True
        
        def __init__(self, *args, **kwargs):
            self.dev_mode = dev_mode
            super().__init__(*args, **kwargs)
    
    httpd = CustomThreadingTCPServer(("", port), OllamaProxy)
    
    # Configure SSL
    context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    context.minimum_version = ssl.TLSVersion.TLSv1_2
    context.load_cert_chain(certfile=cert_path, keyfile=key_path)
    httpd.socket = context.wrap_socket(httpd.socket, server_side=True)
    
    # Setup simplified shutdown
    def signal_handler(sig, frame):
        logger.info("Shutting down...")
        httpd.server_close()
        sys.exit(0)
    
    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)
    
    # Display server information in Vite-like format
    local_ip = get_local_ip()
    print("\n\033[1m OLLAMA-PROXY \033[0m ready")
    print(f"  ➜  \033[36mLocal:   \033[0mhttps://localhost:{port}/")
    print(f"  ➜  \033[36mNetwork: \033[0mhttps://{local_ip}:{port}/")
    print("\n  Use the Network URL when accessing from another machine\n")
    
    # Start server
    try:
        logger.info(f"Server started on port {port}")
        httpd.serve_forever()
    except Exception as e:
        logger.error(f"Server error: {e}")
        sys.exit(1)

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
        # Set all loggers to DEBUG
        for name in logging.root.manager.loggerDict:
            logging.getLogger(name).setLevel(logging.DEBUG)
    
    run_server(args.port, args.cert_dir, not args.no_start, args.dev)

if __name__ == "__main__":
    main()
