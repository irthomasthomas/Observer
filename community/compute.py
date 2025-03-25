from fastapi import APIRouter, Request
from fastapi.responses import Response, JSONResponse
import httpx
import os
import sqlite3
import logging
import secrets

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
    
    # Simple auth codes table
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS auth_codes (
        auth_code TEXT PRIMARY KEY
    )
    ''')
    
    conn.commit()
    conn.close()
    logger.info("Database initialized")

# Initialize the database at module load
init_db()

# Super simple auth functions
def store_auth_code(auth_code):
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute('INSERT OR IGNORE INTO auth_codes (auth_code) VALUES (?)', (auth_code,))
    conn.commit()
    conn.close()

def is_valid_auth_code(auth_code):
    if not auth_code:
        return False
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute('SELECT auth_code FROM auth_codes WHERE auth_code = ?', (auth_code,))
    result = cursor.fetchone()
    conn.close()
    return result is not None

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
    x_forwarded_for = request.headers.get("X-Forwarded-For")
    if x_forwarded_for:
        return x_forwarded_for.split(",")[0].strip()
    return request.client.host

# Routes
@compute_router.post("/auth/register")
async def register_auth(request: Request):
    try:
        data = await request.json()
        user_id = data.get("user_id")
        
        if not user_id:
            return JSONResponse({"error": "Missing user_id"}, status_code=400)
        
        # Generate simple code - we'll just use the user_id with a random prefix
        auth_code = secrets.token_hex(16)
        store_auth_code(auth_code)
        
        return JSONResponse({"auth_code": auth_code})
    except Exception as e:
        logger.error(f"Auth error: {str(e)}")
        return JSONResponse({"error": "Registration failed"}, status_code=500)

@compute_router.get("/quota")
async def check_quota(request: Request):
    # Check auth header
    auth_code = request.headers.get("X-Observer-Auth-Code")
    if auth_code and is_valid_auth_code(auth_code):
        # For authenticated users, just return a very large number
        return JSONResponse({
            "used": 0,
            "remaining": 999999,  # Effectively unlimited but still JSON compatible
            "authenticated": True
        })
    
    # For unauthenticated users
    ip = get_client_ip(request)
    count = get_count(ip)
    remaining = max(0, FREE_QUOTA - count)
    
    return JSONResponse({
        "used": count,
        "remaining": remaining,
        "authenticated": False
    })

@compute_router.api_route("/{path:path}", methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"])
async def proxy_request(request: Request, path: str):
    # Check auth header
    auth_code = request.headers.get("X-Observer-Auth-Code")
    is_authenticated = auth_code and is_valid_auth_code(auth_code)
    
    # For POST requests, check quota for unauthenticated users
    if request.method == "POST" and not is_authenticated:
        ip = get_client_ip(request)
        count = get_count(ip)
        
        if count >= FREE_QUOTA:
            return JSONResponse({
                "error": "Quota exceeded", 
                "message": "Sign in for unlimited access"
            }, status_code=402)
        
        increment_count(ip)
    
    # Forward the request
    try:
        body = await request.body()
        
        # Forward headers
        headers = {}
        for key, value in request.headers.items():
            if key.lower() not in ["host", "connection", "content-length"]:
                headers[key] = value
        
        # Forward to target
        target_url = f"{AI_SERVICE_URL}/{path}"
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
            
            return Response(
                content=response.content,
                status_code=response.status_code,
                headers=dict(response.headers)
            )
                
    except Exception as e:
        logger.error(f"Proxy error: {str(e)}")
        return JSONResponse({"error": f"Proxy error: {str(e)}"}, status_code=500)
