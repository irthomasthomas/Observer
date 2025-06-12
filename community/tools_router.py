import os
import logging
import sqlite3
from fastapi import APIRouter, HTTPException, Depends, Request
from pydantic import BaseModel, Field
from typing import Dict, Any 


# Import Twilio classes
from twilio.rest import Client
from twilio.base.exceptions import TwilioRestException

# --- Setup ---
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger('tools_router')
tools_router = APIRouter()

# --- Configuration ---
# Load from environment variables, matching compute.py
DB_PATH = os.environ.get("QUOTA_DB_PATH", "quota.db")
FREE_SMS_QUOTA = int(os.environ.get("FREE_SMS_QUOTA", 10))

# --- Pydantic Models ---
class SmsRequest(BaseModel):
    to_number: str = Field(..., description="The destination phone number in E.164 format.", examples=["+15551234567"])
    message: str = Field(..., min_length=1, max_length=1600, description="The text message content.")

class WhatsAppRequest(BaseModel):
    to_number: str = Field(..., description="The destination phone number in E.164 format.", examples=["+15551234567"])
    # This is the message content that will be placed inside your template's variable
    message: str = Field(..., description="The message content to inject into the WhatsApp template.")

class TwilioConfig(BaseModel):
    account_sid: str
    auth_token: str
    from_number: str
    whatsapp_from_number: str

# --- Database Helper Functions (Mirrored from compute.py) ---
def get_db():
    """Returns a new database connection."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    """Initializes the database and creates the sms_request_count table if it doesn't exist."""
    try:
        with get_db() as conn:
            cursor = conn.cursor()
            # This table tracks SMS usage per auth code
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS sms_request_count (
                    auth_code TEXT PRIMARY KEY,
                    count INTEGER NOT NULL
                )
            ''')
            conn.commit()
            logger.info("SMS quota table (sms_request_count) initialized/verified.")
    except sqlite3.Error as e:
        logger.error(f"Database initialization error for tools_router: {e}", exc_info=True)
        raise RuntimeError(f"Failed to initialize database at {DB_PATH}")

# Initialize DB on module load
try:
    init_db()
except RuntimeError:
    logger.critical("Database setup for tools_router failed. SMS endpoint will be unavailable.")

# --- Auth and Quota Logic (Mirrored from compute.py) ---
def is_valid_auth_code(auth_code: str) -> bool:
    """Checks if a given auth_code is valid by checking the auth_codes table."""
    if not auth_code: return False
    try:
        with get_db() as conn:
            cursor = conn.cursor()
            # We check the main auth_codes table, which is shared with compute.py
            cursor.execute('SELECT 1 FROM auth_codes WHERE auth_code = ?', (auth_code,))
            return cursor.fetchone() is not None
    except sqlite3.Error as e:
        logger.error(f"Database error checking auth code: {e}")
        return False

def is_premium_user(auth_code: str) -> bool:
    """
    Checks if the user has unlimited access.
    This mirrors the "signed in" logic. We check if the auth code is mapped to a user_id.
    """
    if not auth_code: return False
    try:
        with get_db() as conn:
            cursor = conn.cursor()
            # A user is "premium" or "signed-in" if their code exists in the mapping table.
            cursor.execute('SELECT 1 FROM user_auth_mapping WHERE auth_code = ?', (auth_code,))
            return cursor.fetchone() is not None
    except sqlite3.Error as e:
        logger.error(f"Database error checking premium status for auth code: {e}")
        return False # Fail safe

def check_and_increment_sms_quota(auth_code: str) -> bool:
    """
    Checks and increments the SMS quota for a given auth_code.
    Returns True if quota is available, False otherwise.
    """
    try:
        with get_db() as conn:
             cursor = conn.cursor()
             cursor.execute('SELECT count FROM sms_request_count WHERE auth_code = ?', (auth_code,))
             result = cursor.fetchone()
             count = result['count'] if result else 0

             if count >= FREE_SMS_QUOTA:
                  logger.warning(f"SMS Quota exceeded for auth_code: ...{auth_code[-4:]}")
                  return False # Quota exceeded
             else:
                  # Increment count
                  cursor.execute('INSERT OR IGNORE INTO sms_request_count (auth_code, count) VALUES (?, 0)', (auth_code,))
                  cursor.execute('UPDATE sms_request_count SET count = count + 1 WHERE auth_code = ?', (auth_code,))
                  conn.commit()
                  return True # Quota available
    except sqlite3.Error as e:
         logger.error(f"Database error checking/incrementing SMS quota: {e}")
         return False # Fail safe

# --- Twilio Dependency (Unchanged) ---
def get_twilio_config():
    """Dependency to load and validate Twilio credentials."""
    account_sid = os.getenv("TWILIO_ACCOUNT_SID")
    auth_token = os.getenv("TWILIO_AUTH_TOKEN")
    from_number = os.getenv("TWILIO_PHONE_NUMBER")
    # NEW: Get the WhatsApp specific number and the template SID from environment variables
    whatsapp_from_number = os.getenv("TWILIO_WHATSAPP_NUMBER")

    if not all([account_sid, auth_token, from_number, whatsapp_from_number]):
        logger.error("Server is missing required TWILIO environment variables (including WHATSAPP_NUMBER).")
        raise HTTPException(
            status_code=500,
            detail="Messaging service is not configured on the server."
        )
    return TwilioConfig(
        account_sid=account_sid,
        auth_token=auth_token,
        from_number=from_number,
        whatsapp_from_number=whatsapp_from_number
    )


# --- Final API Endpoint ---
@tools_router.post("/tools/send-sms", tags=["Tools"])
async def send_sms(
    request: Request,
    request_data: SmsRequest,
    config: TwilioConfig = Depends(get_twilio_config)
):
    """
    Sends an SMS message using Twilio, with authentication and rate-limiting.
    - Requires a valid 'X-Observer-Auth-Code' header.
    - "Signed-in" users (with an auth_code mapped to a user_id) have unlimited SMS.
    - Other valid auth_codes are subject to a free daily/monthly quota.
    """
    # 1. Authentication
    auth_code = request.headers.get("X-Observer-Auth-Code")
    if not auth_code:
        raise HTTPException(status_code=401, detail="X-Observer-Auth-Code header is required.")
    
    if not is_valid_auth_code(auth_code):
        raise HTTPException(status_code=403, detail="The provided auth code is not valid.")

    # 2. Quota Check (bypassed for premium/signed-in users)
    if not is_premium_user(auth_code):
        if not check_and_increment_sms_quota(auth_code):
            raise HTTPException(
                status_code=429, # Too Many Requests
                detail=f"SMS quota of {FREE_SMS_QUOTA} has been exceeded."
            )

    # 3. Action: Send the SMS (if auth and quota checks pass)
    logger.info(f"Processing SMS for auth_code: ...{auth_code[-4:]} to {request_data.to_number}")
    try:
        client = Client(config.account_sid, config.auth_token)
        message = client.messages.create(
            to=request_data.to_number,
            from_=config.from_number,
            body=request_data.message
        )
        logger.info(f"SMS sent successfully. SID: {message.sid}")
        return {"success": True, "message_sid": message.sid}
    except TwilioRestException as e:
        logger.error(f"Twilio API error: {e.msg}")
        raise HTTPException(status_code=400, detail=f"Failed to send SMS: {e.msg}")
    except Exception as e:
        logger.exception("An unexpected error occurred while sending SMS.")
        raise HTTPException(status_code=500, detail="An internal server error occurred.")


@tools_router.post("/tools/send-whatsapp", tags=["Tools"])
async def send_whatsapp(
    request: Request,
    request_data: WhatsAppRequest, # Use the new Pydantic model
    config: TwilioConfig = Depends(get_twilio_config)
):
    """
    Sends a WhatsApp message using a pre-approved Twilio template.
    - Requires a valid 'X-Observer-Auth-Code' header.
    - Uses the same quota system as SMS.
    """
    # 1. Authentication (re-use the same logic)
    auth_code = request.headers.get("X-Observer-Auth-Code")
    if not auth_code:
        raise HTTPException(status_code=401, detail="X-Observer-Auth-Code header is required.")
    
    if not is_valid_auth_code(auth_code):
        raise HTTPException(status_code=403, detail="The provided auth code is not valid.")

    # 2. Quota Check (re-use the same logic, it's tied to the auth_code)
    if not is_premium_user(auth_code):
        if not check_and_increment_sms_quota(auth_code): # We can share the quota
            raise HTTPException(
                status_code=429,
                detail=f"Messaging quota of {FREE_SMS_QUOTA} has been exceeded."
            )
            
    # NEW: Get your template SID from environment variables for security and flexibility
    content_sid = os.getenv("TWILIO_WHATSAPP_TEMPLATE_SID")
    if not content_sid:
        logger.error("Server is missing TWILIO_WHATSAPP_TEMPLATE_SID environment variable.")
        raise HTTPException(status_code=500, detail="WhatsApp service is not configured correctly on the server.")

    # 3. Action: Send the WhatsApp message
    logger.info(f"Processing WhatsApp for auth_code: ...{auth_code[-4:]} to {request_data.to_number}")
    try:
        client = Client(config.account_sid, config.auth_token)
        message = client.messages.create(
            # The 'to' and 'from' numbers MUST be prefixed with 'whatsapp:'
            to=f'whatsapp:{request_data.to_number}',
            from_=f'whatsapp:{config.whatsapp_from_number}',
            # Reference your approved template
            content_sid=content_sid,
            # Provide the variables for the template
            # Our template `Observer AI Alert: {{1}}` only has one variable.
            content_variables=f'{{"1": "{request_data.message}"}}'
        )
        logger.info(f"WhatsApp message sent successfully. SID: {message.sid}")
        return {"success": True, "message_sid": message.sid}
    except TwilioRestException as e:
        logger.error(f"Twilio API error (WhatsApp): {e.msg}")
        # Provide a more helpful error message for common issues
        if "not a valid E.164 number" in e.msg:
            raise HTTPException(status_code=400, detail="The 'to_number' must be in E.164 format (e.g., +15551234567).")
        if "is not a valid template" in e.msg:
            raise HTTPException(status_code=500, detail="The WhatsApp template SID configured on the server is invalid or not approved.")
        raise HTTPException(status_code=400, detail=f"Failed to send WhatsApp message: {e.msg}")
    except Exception as e:
        logger.exception("An unexpected error occurred while sending WhatsApp message.")
        raise HTTPException(status_code=500, detail="An internal server error occurred.")
