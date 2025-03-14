from fastapi import APIRouter, Request
from fastapi.responses import Response, JSONResponse
import httpx
import os
import sqlite3
import logging

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)
logger = logging.getLogger('compute-proxy')

# Create router
compute_router = APIRouter()

# Configuration
AI_SERVICE_URL = os.environ.get("AI_SERVICE_URL", "https://compute.observer-ai.com")
DB_PATH = "quota.db"
FREE_QUOTA = 5  # Number of free requests per IP

# Initialize database
def init_db():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS request_count (
        ip TEXT PRIMARY KEY,
        count INTEGER NOT NULL
    )
    ''')
    
    conn.commit()
    conn.close()
    logger.info("Quota database initialized")

# Initialize the database at module load
init_db()

# Helper functions for request counting
def increment_count(ip):
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    cursor.execute('INSERT OR IGNORE INTO request_count (ip, count) VALUES (?, 0)', (ip,))
    cursor.execute('UPDATE request_count SET count = count + 1 WHERE ip = ?', (ip,))
    
    conn.commit()
    conn.close()

def get_count(ip):
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    cursor.execute('SELECT count FROM request_count WHERE ip = ?', (ip,))
    result = cursor.fetchone()
    
    conn.close()
    return result[0] if result else 0


def get_client_ip(request: Request):
    # Try Cloudflare headers first
    cf_ip = request.headers.get("CF-Connecting-IP")
    if cf_ip:
        return cf_ip
        
    # Try X-Forwarded-For header
    x_forwarded_for = request.headers.get("X-Forwarded-For")
    if x_forwarded_for:
        # Get the first IP in the chain
        return x_forwarded_for.split(",")[0].strip()
        
    # Fallback to direct client IP
    return request.client.host

# Routes
@compute_router.get("/proxy-status")
async def compute_root():
    return {"status": "Compute proxy is running", "target": AI_SERVICE_URL}


@compute_router.get("/quota")
async def check_quota(request: Request):
    ip = get_client_ip(request)
    count = get_count(ip)
    remaining = max(0, FREE_QUOTA - count)
    
    return JSONResponse({
        "ip": ip,
        "used": count,
        "remaining": remaining
    })

@compute_router.api_route("/{path:path}", methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"])
async def proxy_request(request: Request, path: str):
    # Get client IP using the new function
    ip = get_client_ip(request)
    
    # For POST requests, check and increment the quota
    if request.method == "POST":
        count = get_count(ip)
        if count >= FREE_QUOTA:
            return JSONResponse(
                content={"error": "Quota exceeded", "message": "You've used all your free requests"},
                status_code=402  # Payment Required
            )
        
        # Increment count on POST requests
        increment_count(ip)
    
    # Forward the request
    try:
        # Get request data
        body = await request.body()
        
        # Forward headers
        headers = {}
        for key, value in request.headers.items():
            if key.lower() not in ["host", "connection", "content-length"]:
                headers[key] = value
        
        # Forward to target
        target_url = f"{AI_SERVICE_URL}/{path}"
        
        # Use a much longer timeout for /api/generate endpoint
        timeout = 300.0 if path == 'api/generate' else 60.0
        
        async with httpx.AsyncClient() as client:
            response = await client.request(
                method=request.method,
                url=target_url,
                headers=headers,
                content=body,
                params=request.query_params,
                timeout=timeout
            )
            
            # Return the response
            return Response(
                content=response.content,
                status_code=response.status_code,
                headers=dict(response.headers)
            )
                
    except Exception as e:
        logger.error(f"Proxy error: {str(e)}")
        return JSONResponse(
            content={"error": f"Proxy error: {str(e)}"},
            status_code=500
        )
