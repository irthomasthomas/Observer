# tools_router.py

import os
import logging
import json
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field

# Third-party imports
from twilio.rest import Client
from twilio.base.exceptions import TwilioRestException
from sendgrid import SendGridAPIClient
from sendgrid.helpers.mail import Mail

# --- Local Imports ---
from auth import AuthUser
from admin_auth import get_admin_access
# Import the new, unified quota manager functions and constants
from quota_manager import increment_usage, get_usage_for_service, get_all_usage_data, QUOTA_LIMITS

# --- Setup ---
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger('tools_router')
tools_router = APIRouter()

# --- Pydantic Models ---
class SmsRequest(BaseModel):
    to_number: str = Field(..., description="The destination phone number in E.164 format.", examples=["+15551234567"])
    message: str = Field(..., min_length=1, max_length=1600, description="The text message content.")

class WhatsAppRequest(BaseModel):
    to_number: str = Field(..., description="The destination phone number in E.164 format.", examples=["+15551234567"])
    message: str = Field(..., description="The message content to inject into the WhatsApp template.")

class EmailRequest(BaseModel):
    to_email: str = Field(..., description="The destination email address.", examples=["user@example.com"])
    message: str = Field(..., min_length=1, description="The email body content.")

class TwilioConfig(BaseModel):
    account_sid: str
    auth_token: str
    from_number: str
    whatsapp_from_number: str

# --- Twilio Dependency ---
def get_twilio_config():
    """Dependency to load and validate Twilio credentials."""
    account_sid = os.getenv("TWILIO_ACCOUNT_SID")
    auth_token = os.getenv("TWILIO_AUTH_TOKEN")
    from_number = os.getenv("TWILIO_PHONE_NUMBER")
    whatsapp_from_number = os.getenv("TWILIO_WHATSAPP_NUMBER")

    if not all([account_sid, auth_token, from_number, whatsapp_from_number]):
        logger.error("Server is missing required TWILIO environment variables (including WHATSAPP_NUMBER).")
        raise HTTPException(status_code=500, detail="Messaging service is not configured on the server.")
    return TwilioConfig(
        account_sid=account_sid,
        auth_token=auth_token,
        from_number=from_number,
        whatsapp_from_number=whatsapp_from_number
    )

# --- API Endpoints ---

@tools_router.get("/tools/usage", tags=["Admin"], summary="Get all current usage data")
async def get_all_usage(is_admin: bool = Depends(get_admin_access)):
    """
    (Admin) Returns a snapshot of the current in-memory usage database.
    Requires a valid X-Admin-Key header.
    """
    # The dependency already handled the security check.
    # If the code reaches here, 'is_admin' is True.
    return get_all_usage_data()

@tools_router.post("/tools/send-sms", tags=["Tools"])
async def send_sms(
    request_data: SmsRequest,
    user_id: AuthUser,
    config: TwilioConfig = Depends(get_twilio_config)
):
    """Sends an SMS, checking against the in-memory quota."""
    # 1. Quota Check (using the "sms" service)
    # TODO: In the future, check for a premium claim from the JWT here to bypass this.
    sms_limit = QUOTA_LIMITS["sms"]
    current_sms_usage = get_usage_for_service(user_id, "sms")
    if current_sms_usage >= sms_limit:
        raise HTTPException(
            status_code=429,
            detail=f"Daily SMS/WhatsApp quota of {sms_limit} has been exceeded."
        )

    # 2. If quota is fine, increment and proceed
    increment_usage(user_id, "sms")
    logger.info(f"Processing SMS for user_id: {user_id} to {request_data.to_number}")

    # 3. Action: Send the SMS
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


@tools_router.post("/tools/send-whatsapp", tags=["Tools"])
async def send_whatsapp(
    request_data: WhatsAppRequest,
    user_id: AuthUser,
    config: TwilioConfig = Depends(get_twilio_config)
):
    """Sends a WhatsApp message, sharing the 'sms' quota."""
    # 1. Quota Check (Shares the "sms" service quota)
    sms_limit = QUOTA_LIMITS["sms"]
    current_sms_usage = get_usage_for_service(user_id, "sms")
    if current_sms_usage >= sms_limit:
        raise HTTPException(
            status_code=429,
            detail=f"Daily SMS/WhatsApp quota of {sms_limit} has been exceeded."
        )

    # 2. Increment and proceed (increments the shared 'sms' counter)
    increment_usage(user_id, "sms")
    logger.info(f"Processing WhatsApp for user_id: {user_id} to {request_data.to_number}")
    
    # 3. Action: Send the WhatsApp message
    content_sid = os.getenv("TWILIO_WHATSAPP_TEMPLATE_SID")
    if not content_sid:
        logger.error("Server is missing TWILIO_WHATSAPP_TEMPLATE_SID environment variable.")
        raise HTTPException(status_code=500, detail="WhatsApp service is not configured correctly on the server.")
        
    try:
        client = Client(config.account_sid, config.auth_token)
        message = client.messages.create(
            to=f'whatsapp:{request_data.to_number}',
            from_=f'whatsapp:{config.whatsapp_from_number}',
            content_sid=content_sid
        )
        logger.info(f"WhatsApp message sent successfully. SID: {message.sid}")
        return {"success": True, "message_sid": message.sid}
    except TwilioRestException as e:
        logger.error(f"Twilio API error (WhatsApp): {e.msg}")
        raise HTTPException(status_code=400, detail=f"Failed to send WhatsApp message: {e.msg}")

@tools_router.post("/tools/send-email", tags=["Tools"])
async def send_email(
    request_data: EmailRequest,
    user_id: AuthUser
):
    """Sends an email, checking against the in-memory email quota."""
    # 1. Quota Check (using the "email" service)
    email_limit = QUOTA_LIMITS["email"]
    current_email_usage = get_usage_for_service(user_id, "email")
    if current_email_usage >= email_limit:
        raise HTTPException(
            status_code=429,
            detail=f"Daily email quota of {email_limit} has been exceeded."
        )

    # 2. Increment and proceed
    increment_usage(user_id, "email")
    logger.info(f"Processing email for user_id: {user_id} to {request_data.to_email}")
    
    # 3. Action: Send the Email
    sendgrid_api_key = os.getenv("SENDGRID_API_KEY")
    from_email = os.getenv("SENDGRID_FROM_EMAIL")

    if not all([sendgrid_api_key, from_email]):
        logger.error("Server is missing SENDGRID_API_KEY or SENDGRID_FROM_EMAIL.")
        raise HTTPException(status_code=500, detail="Email service is not configured on the server.")

    message = Mail(
        from_email=from_email,
        to_emails=request_data.to_email,
        subject='An Alert from your Observer AI Agent',
        plain_text_content=request_data.message
    )

    try:
        sendgrid_client = SendGridAPIClient(sendgrid_api_key)
        response = sendgrid_client.send(message)
        logger.info(f"Email successfully sent to SendGrid for user {user_id}. Status: {response.status_code}")
        return {"success": True, "detail": "Email sent successfully."}
    except Exception as e:
        logger.exception(f"An unexpected error occurred while sending email via SendGrid for user {user_id}")
        raise HTTPException(status_code=500, detail=f"An internal server error occurred: {str(e)}")
