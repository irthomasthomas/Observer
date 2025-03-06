from fastapi import FastAPI, HTTPException, Depends, Request, Header
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, Response
from pydantic import BaseModel
import sqlite3
import httpx
import os
import time
import json
from jose import jwt
import logging

# Configuration via environment variables
AUTH0_DOMAIN = os.environ.get("AUTH0_DOMAIN", "what are you looking for?")
AUTH0_AUDIENCE = os.environ.get("AUTH0_AUDIENCE", "https://api.observer-ai.com")
AI_SERVICE_URL = os.environ.get("AI_SERVICE_URL", " -.- ")
DB_PATH = "quota.db"
FREE_RUNS = 10

# Setup FastAPI app
app = FastAPI(title="AI Service Proxy")

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all origins for open source flexibility
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize database
def init_db():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS user_quota (
        user_id TEXT PRIMARY KEY,
        remaining_runs INTEGER NOT NULL,
        last_updated INTEGER NOT NULL
    )
    ''')
    
    conn.commit()
    conn.close()

# Call init_db at startup
@app.on_event("startup")
async def startup_event():
    init_db()
    logger.info(f"Starting AI proxy service. Target AI service: {AI_SERVICE_URL}")

# Models
class QuotaResponse(BaseModel):
    user_id: str
    remaining_runs: int

# Auth functions
async def get_user_id(authorization: str = Header(None)):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Invalid authorization header")
    
    token = authorization.split(" ")[1]
    try:
        # Simplified token verification
        payload = jwt.decode(
            token, 
            options={"verify_signature": False},  # In production, verify properly
            audience=AUTH0_AUDIENCE
        )
        if "sub" not in payload:
            raise HTTPException(status_code=401, detail="Invalid token payload")
        return payload["sub"]
    except Exception as e:
        logger.error(f"Token validation error: {str(e)}")
        raise HTTPException(status_code=401, detail="Invalid token")

# Quota functions
async def get_quota(user_id: str):
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    
    cursor.execute("SELECT * FROM user_quota WHERE user_id = ?", (user_id,))
    quota = cursor.fetchone()
    
    if not quota:
        # New user - initialize quota
        now = int(time.time())
        cursor.execute(
            "INSERT INTO user_quota (user_id, remaining_runs, last_updated) VALUES (?, ?, ?)",
            (user_id, FREE_RUNS, now)
        )
        conn.commit()
        remaining_runs = FREE_RUNS
    else:
        remaining_runs = quota["remaining_runs"]
    
    conn.close()
    return remaining_runs

async def decrement_quota(user_id: str):
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    now = int(time.time())
    cursor.execute(
        "UPDATE user_quota SET remaining_runs = remaining_runs - 1, last_updated = ? WHERE user_id = ? AND remaining_runs > 0",
        (now, user_id)
    )
    
    success = cursor.rowcount > 0
    conn.commit()
    conn.close()
    return success

# Routes
@app.get("/v1/quota", response_model=QuotaResponse)
async def check_quota(user_id: str = Depends(get_user_id)):
    remaining = await get_quota(user_id)
    return {"user_id": user_id, "remaining_runs": remaining}


# Special handling for v1/chat/completions to match your client code
@app.post("/v1/chat/completions")
async def handle_chat_completions(request: Request, user_id: str = Depends(get_user_id)):
    # Check quota
    remaining = await get_quota(user_id)
    
    if remaining <= 0:
        return Response(
            content=json.dumps({
                "error": {
                    "message": "You've used all your free runs. Please configure your own AI service.",
                    "type": "quota_exceeded"
                }
            }),
            media_type="application/json",
            status_code=402  # Payment Required
        )
    
    # Extract request data
    body = await request.body()
    body_json = json.loads(body)
    
    # Decrement quota for completions
    success = await decrement_quota(user_id)
    if not success:
        return Response(
            content=json.dumps({
                "error": {
                    "message": "You've used all your free runs. Please configure your own AI service.",
                    "type": "quota_exceeded"
                }
            }),
            media_type="application/json",
            status_code=402
        )
    
    # Forward to AI service
    target_url = f"{AI_SERVICE_URL}/v1/chat/completions"
    
    # Basic headers forwarding
    headers = {}
    for key, value in request.headers.items():
        if key.lower() not in ["host", "connection", "content-length", "authorization"]:
            headers[key] = value
    
    # Ensure content-type is set
    headers["Content-Type"] = "application/json"
    
    try:
        async with httpx.AsyncClient() as client:
            ai_response = await client.post(
                url=target_url,
                headers=headers,
                json=body_json,
                timeout=60.0
            )
            
            # Handle streaming responses
            if body_json.get("stream", False):
                return StreamingResponse(
                    ai_response.aiter_bytes(),
                    status_code=ai_response.status_code,
                    headers=dict(ai_response.headers)
                )
            else:
                # Return regular response
                return Response(
                    content=ai_response.content,
                    status_code=ai_response.status_code,
                    headers=dict(ai_response.headers),
                    media_type="application/json"
                )
                
    except Exception as e:
        logger.error(f"Proxy error: {str(e)}")
        return Response(
            content=json.dumps({
                "error": {
                    "message": "Error connecting to AI service",
                    "type": "service_unavailable"
                }
            }),
            media_type="application/json",
            status_code=500
        )

# Generic proxy for all other endpoints
@app.api_route("/v1/{path:path}", methods=["GET", "POST", "PUT", "DELETE"])
async def proxy_to_ai_service(request: Request, path: str, user_id: str = Depends(get_user_id)):
    # Special case for /chat/completions is handled in the specific route above
    if path == "chat/completions":
        raise HTTPException(status_code=404, detail="Not found")
    
    # Check quota for completions/embeddings endpoints only
    should_count = "completions" in path or "embeddings" in path
    
    if should_count:
        remaining = await get_quota(user_id)
        if remaining <= 0:
            return Response(
                content=json.dumps({
                    "error": {
                        "message": "You've used all your free runs. Please configure your own AI service.",
                        "type": "quota_exceeded"
                    }
                }),
                media_type="application/json",
                status_code=402
            )
        
        # Decrement quota
        success = await decrement_quota(user_id)
        if not success:
            return Response(
                content=json.dumps({
                    "error": {
                        "message": "You've used all your free runs. Please configure your own AI service.",
                        "type": "quota_exceeded"
                    }
                }),
                media_type="application/json",
                status_code=402
            )
    
    # Extract request data
    body = await request.body()
    
    # Basic headers forwarding
    headers = {}
    for key, value in request.headers.items():
        if key.lower() not in ["host", "connection", "content-length", "authorization"]:
            headers[key] = value
    
    # Forward to AI service
    target_url = f"{AI_SERVICE_URL}/v1/{path}"
    
    try:
        async with httpx.AsyncClient() as client:
            ai_response = await client.request(
                method=request.method,
                url=target_url,
                headers=headers,
                content=body,
                params=request.query_params,
                timeout=60.0
            )
            
            # Check for streaming
            is_streaming = ai_response.headers.get("transfer-encoding") == "chunked"
            
            if is_streaming:
                return StreamingResponse(
                    ai_response.aiter_bytes(),
                    status_code=ai_response.status_code,
                    headers=dict(ai_response.headers)
                )
            else:
                return Response(
                    content=ai_response.content,
                    status_code=ai_response.status_code,
                    headers=dict(ai_response.headers)
                )
                
    except Exception as e:
        logger.error(f"Proxy error: {str(e)}")
        return Response(
            content=json.dumps({
                "error": {
                    "message": "Error connecting to AI service",
                    "type": "service_unavailable"
                }
            }),
            media_type="application/json",
            status_code=500
        )

# Run with: uvicorn ai_proxy:app --host 0.0.0.0 --port 8001
