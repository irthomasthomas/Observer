# ollama_proxy/__main__.py
import argparse
import logging
import os
from .server import run_server
from .ollama_client import set_ollama_destination

# Setup root logging configuration
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)
logger = logging.getLogger('ollama-proxy')

def main():
    """Main entry point for the Ollama Proxy."""
    # --- Start of new/modified code ---
    parser = argparse.ArgumentParser(
        description="A pure HTTPS/HTTP proxy for Ollama with OpenAI API translation.",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter # Shows default values in help
    )
    
    # Server configuration
    server_group = parser.add_argument_group('Server Configuration')
    server_group.add_argument("--port", type=int, default=3838, help="Port to run the proxy server on.")
    server_group.add_argument("--dev", action="store_true", help="Enable development mode (e.g., allows all CORS origins).")

    # SSL configuration
    ssl_group = parser.add_argument_group('SSL Configuration')
    ssl_group.add_argument("--disable-ssl", action="store_true", help="Run the server over plain HTTP instead of HTTPS.")
    ssl_group.add_argument("--cert-dir", default="./certs", help="Directory to store self-signed certificates (if SSL is enabled).")
    
    # Ollama destination configuration
    ollama_group = parser.add_argument_group('Ollama Destination Configuration')
    ollama_group.add_argument(
        "--ollama-host", 
        default=os.environ.get("OLLAMA_SERVICE_HOST", "localhost"), 
        help="The hostname of the Ollama service to proxy to."
    )
    ollama_group.add_argument(
        "--ollama-port", 
        type=int, 
        default=os.environ.get("OLLAMA_SERVICE_PORT", "11434"), 
        help="The port of the Ollama service."
    )
    
    # Logging configuration
    log_group = parser.add_argument_group('Logging')
    log_group.add_argument("--debug", action="store_true", help="Enable debug logging for all modules.")
    
    args = parser.parse_args()
    
    if args.debug:
        logging.getLogger().setLevel(logging.DEBUG)
        for handler in logging.getLogger().handlers:
            handler.setLevel(logging.DEBUG)
        logger.info("Debug logging enabled.")

    # Configure the Ollama client with the specified destination
    set_ollama_destination(args.ollama_host, args.ollama_port)
    
    # Start the server, passing the SSL flag
    run_server(args.port, args.cert_dir, args.dev, use_ssl=(not args.disable_ssl))
    # --- End of new/modified code ---

if __name__ == "__main__":
    main()
