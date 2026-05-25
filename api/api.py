from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse
from contextlib import asynccontextmanager
import uvicorn
import argparse
import logging
import os
import socket
import subprocess
import sqlite3
import stripe
import hashlib
from pathlib import Path

from auth import AuthUser
from auth0_manager import delete_user

# Import routers from our modules
from marketplace import marketplace_router
from compute import compute_router
from tools_router import tools_router
from messaging import messaging_router
from payments import payments_router
from apple_payments import apple_payments_router
from transcriptions import transcriptions_router
import api_handlers

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)
logger = logging.getLogger('api-server')

# modelo = randomforest()

# @app.post("/resultados")
# def enviar_resultados(datos):
#     resultados = modelo(datos)
#     return resultados

MAX_BODY_SIZE = 20 * 1024 * 1024  # 20 MB

@asynccontextmanager
async def lifespan(app: FastAPI):
    await api_handlers.startup_handlers()
    yield
    await api_handlers.shutdown_handlers()

# Setup FastAPI app
app = FastAPI(lifespan=lifespan)

# Create temp images directory
TEMP_IMAGES_DIR = Path("temp_images")
TEMP_IMAGES_DIR.mkdir(exist_ok=True)

# Mount static files for serving images
app.mount("/temp-images", StaticFiles(directory="temp_images"), name="temp-images")

# Reject oversized request bodies before they are read into memory
@app.middleware("http")
async def limit_body_size(request: Request, call_next):
    content_length = request.headers.get("content-length")
    if content_length and int(content_length) > MAX_BODY_SIZE:
        return JSONResponse(
            status_code=413,
            content={"detail": "Request body too large. Maximum size is 20MB."},
        )
    return await call_next(request)

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers - without prefixes to maintain original URL structure
app.include_router(marketplace_router)
# Mount compute router last since it has a catch-all route
app.include_router(compute_router)
# Mount tools router
app.include_router(tools_router)
# Mount twilio router
app.include_router(messaging_router)
# Payments router (Stripe)
app.include_router(
    payments_router,
    prefix="/payments",
    tags=["Payments"]
)
# Apple payments router
app.include_router(
    apple_payments_router,
    prefix="/payments",
    tags=["Payments"]
)
# Transcriptions router
app.include_router(transcriptions_router)

# Root path to check if service is running
@app.get("/")
async def root():
    return {"status": "API server is running"}


@app.delete("/delete-account", summary="Permanently delete user account")
async def delete_account(current_user: AuthUser):
    """
    Permanently deletes the authenticated user's account.
    This will:
    1. Cancel any active Stripe subscription
    2. Delete all marketplace agents created by the user
    3. Delete the Auth0 user account

    This action is irreversible.
    """
    user_id = current_user.id
    logger.info(f"Account deletion requested for user: {user_id}")

    # 1. Cancel Stripe subscription if exists
    stripe_customer_id = None
    if hasattr(current_user, 'app_metadata') and isinstance(current_user.app_metadata, dict):
        stripe_customer_id = current_user.app_metadata.get("stripe_customer_id")

    email = (getattr(current_user, 'email', None) or '').lower()
    if email:
        email_hash = hashlib.sha256(email.encode()).hexdigest()
        ghost_email = f"{email_hash}@deleted.invalid"
        try:
            all_customers = stripe.Customer.list(email=email, limit=100)
            for cust in all_customers.data:
                # Cancel active subscriptions
                subscriptions = stripe.Subscription.list(customer=cust.id, status='all', limit=100)
                for sub in subscriptions.data:
                    if sub.status in ('active', 'trialing'):
                        stripe.Subscription.cancel(sub.id)
                        logger.info(f"Cancelled Stripe subscription {sub.id} for user {user_id}")

                # Detach all payment methods
                payment_methods = stripe.PaymentMethod.list(customer=cust.id, type="card")
                for pm in payment_methods.data:
                    stripe.PaymentMethod.detach(pm.id)

                # Replace email with hash, wipe all other PII
                stripe.Customer.modify(
                    cust.id,
                    email=ghost_email,
                    name="",
                    phone="",
                    address={},
                    metadata={"deleted": "true"}
                )
                logger.info(f"Redacted Stripe customer {cust.id} for user {user_id}")
        except Exception as e:
            logger.error(f"Failed to process Stripe data for user {user_id}: {e}")
            # Continue with deletion even if Stripe fails
    elif stripe_customer_id:
        # Fallback: no email available, cancel by customer ID only
        try:
            subscriptions = stripe.Subscription.list(customer=stripe_customer_id, status='all', limit=100)
            for sub in subscriptions.data:
                if sub.status in ('active', 'trialing'):
                    stripe.Subscription.cancel(sub.id)
                    logger.info(f"Cancelled Stripe subscription {sub.id} for user {user_id}")
        except Exception as e:
            logger.error(f"Failed to cancel Stripe subscriptions for user {user_id}: {e}")

    # 2. Delete marketplace agents created by this user
    try:
        conn = sqlite3.connect("marketplace.db")
        cursor = conn.cursor()
        cursor.execute("DELETE FROM agents WHERE author_id = ?", (user_id,))
        deleted_agents = cursor.rowcount
        conn.commit()
        conn.close()
        logger.info(f"Deleted {deleted_agents} marketplace agents for user {user_id}")
    except Exception as e:
        logger.error(f"Failed to delete marketplace agents for user {user_id}: {e}")
        # Continue with deletion even if marketplace cleanup fails

    # 3. Delete Auth0 user account
    deleted = await delete_user(user_id)
    if not deleted:
        logger.error(f"Failed to delete Auth0 account for user {user_id}")
        raise HTTPException(status_code=500, detail="Failed to delete account. Please try again or contact support.")

    logger.info(f"Successfully deleted account for user {user_id}")
    return {"success": True, "message": "Account deleted successfully"}

# Generate SSL certificates
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
            logger.error(f"Failed to generate certificates: {e.stderr.decode() if hasattr(e, 'stderr') else str(e)}")
            raise RuntimeError("Failed to generate SSL certificates")
    else:
        logger.info(f"Using existing certificates from {cert_dir}")
        
    return cert_path, key_path

def get_local_ip():
    """Get the local IP address for network access"""
    try:
        # Create a socket that connects to an external server to determine local IP
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        # We don't actually need to send data
        s.connect(('8.8.8.8', 80))
        local_ip = s.getsockname()[0]
        s.close()
        return local_ip
    except Exception as e:
        logger.warning(f"Could not determine local IP: {e}")
        return "0.0.0.0"

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Observer AI API Server")
    parser.add_argument("--port", type=int, default=8000, help="Port to run on")
    parser.add_argument("--cert-dir", default="./certs", help="Certificate directory")
    parser.add_argument("--cert-file", help="Path to certificate file (if not provided, self-signed will be used)")
    parser.add_argument("--key-file", help="Path to key file (if not provided, self-signed will be used)")
    parser.add_argument("--debug", action="store_true", help="Enable debug logging")
    parser.add_argument("--proxy-target", default="https://compute.observer-ai.com", help="Target service URL for proxy")
    
    args = parser.parse_args()
    
    if args.debug:
        logger.setLevel(logging.DEBUG)
        
    # Set target URL for compute proxy
    os.environ["AI_SERVICE_URL"] = args.proxy_target
    
    # Set up SSL
    if args.cert_file and args.key_file:
        # Use provided certificates
        cert_path = args.cert_file
        key_path = args.key_file
        logger.info(f"Using provided certificates: {cert_path}, {key_path}")
    else:
        # Self-sign certificates
        cert_path, key_path = prepare_certificates(args.cert_dir)
    
    # Get local IP for network access
    local_ip = get_local_ip()
    
    # Print server info
    print("\n\033[1m OBSERVER AI API SERVER \033[0m ready")
    print(f"  ➜  \033[36mLocal:   \033[0mhttps://localhost:{args.port}/")
    print(f"  ➜  \033[36mNetwork: \033[0mhttps://{local_ip}:{args.port}/")
    print(f"\n  Marketplace routes: https://localhost:{args.port}/agents")
    print(f"  Compute quota: https://localhost:{args.port}/quota")
    print(f"  Proxy forwarding to: {args.proxy_target}")
    
    # Run with SSL context
    uvicorn.run(
        app, 
        host="0.0.0.0", 
        port=args.port,
        ssl_certfile=str(cert_path),
        ssl_keyfile=str(key_path)
    )
