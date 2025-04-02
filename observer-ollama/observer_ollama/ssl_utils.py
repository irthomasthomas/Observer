#!/usr/bin/env python3
import os
import sys
import socket
import subprocess
import logging
from pathlib import Path

logger = logging.getLogger('ollama-proxy.ssl')

def get_local_ip():
    """Get the local IP address for network access"""
    try:
        # Create a socket that connects to an external server to determine local IP
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        # We don't actually need to send data
        s.connect(('8.8.8.8', 80))
        local_ip = s.getsockname()[0]
        s.close()
        logger.debug(f"Local IP detected: {local_ip}")
        return local_ip
    except Exception as e:
        logger.warning(f"Could not determine local IP: {e}")
        return "127.0.0.1"

def prepare_certificates(cert_dir):
    """Prepare SSL certificates"""
    cert_path = Path(cert_dir) / "cert.pem"
    key_path = Path(cert_dir) / "key.pem"
    config_path = Path(cert_dir) / "openssl.cnf"
    
    logger.debug(f"Certificate paths: cert={cert_path}, key={key_path}")
    
    # Create certificate directory if it doesn't exist
    os.makedirs(cert_dir, exist_ok=True)
    logger.debug(f"Ensured certificate directory exists: {cert_dir}")
    
    # Check if we need to generate certificates
    if not cert_path.exists() or not key_path.exists():
        logger.info("Generating new SSL certificates...")
        
        # Create a minimal OpenSSL config with SAN entries
        local_ip = get_local_ip()
        
        config_content = f"""
[req]
distinguished_name = req_distinguished_name
x509_extensions = v3_req
prompt = no

[req_distinguished_name]
CN = localhost

[v3_req]
subjectAltName = @alt_names

[alt_names]
DNS.1 = localhost
IP.1 = 127.0.0.1
IP.2 = {local_ip}
        """
        
        logger.debug(f"Writing OpenSSL config with content:\n{config_content}")
        
        with open(config_path, 'w') as f:
            f.write(config_content)
        
        cmd = [
            "openssl", "req", "-x509", 
            "-newkey", "rsa:4096", 
            "-sha256", 
            "-days", "365", 
            "-nodes", 
            "-keyout", str(key_path), 
            "-out", str(cert_path),
            "-config", str(config_path)
        ]
        
        logger.debug(f"Executing OpenSSL command: {' '.join(cmd)}")
        
        try:
            result = subprocess.run(cmd, check=True, capture_output=True, text=True)
            logger.debug(f"OpenSSL stdout: {result.stdout}")
            logger.info(f"Certificates successfully generated at {cert_dir}")
        except subprocess.CalledProcessError as e:
            logger.error(f"Failed to generate certificates: {e.stderr}")
            logger.error(f"Command was: {' '.join(cmd)}")
            sys.exit(1)
    else:
        logger.info(f"Using existing certificates from {cert_dir}")
        
    return cert_path, key_path
