#!/usr/bin/env python3
import os
import ssl
import sys
from pathlib import Path
import subprocess
import logging

logger = logging.getLogger("ssl_handler")

def prepare_certificates(cert_dir):
    cert_path = Path(cert_dir) / "cert.pem"
    key_path = Path(cert_dir) / "key.pem"
    os.makedirs(cert_dir, exist_ok=True)
    if not cert_path.exists() or not key_path.exists():
        logger.error("Certificate or key not found in %s.", cert_dir)
        logger.error("Please create the files: cert.pem and key.pem in that directory.")
        sys.exit(1)
    logger.info("Using certificates from %s", cert_dir)
    return cert_path, key_path

def create_ssl_context(cert_dir):
    cert_path, key_path = prepare_certificates(cert_dir)
    context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    context.minimum_version = ssl.TLSVersion.TLSv1_2
    try:
        context.load_cert_chain(certfile=str(cert_path), keyfile=str(key_path))
    except ssl.SSLError as e:
        logger.error("Error loading certificate: %s", e)
        sys.exit(1)
    return context

if __name__ == "__main__":
    logging.basicConfig(level=logging.DEBUG)
    ctx = create_ssl_context("./certs")
    logger.info("SSL context created successfully.")
