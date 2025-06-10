import os
import logging
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field

# Import Twilio classes
from twilio.rest import Client
from twilio.base.exceptions import TwilioRestException

# --- Setup ---
# Standard logger setup
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Create a new router for our tools
tools_router = APIRouter()

# --- Pydantic Models for Request Body Validation ---
class SmsRequest(BaseModel):
    """Defines the expected data for an SMS request."""
    to_number: str = Field(
        ..., 
        description="The destination phone number in E.164 format (e.g., +15551234567).",
        examples=["+15551234567"]
    )
    message: str = Field(
        ..., 
        min_length=1, 
        max_length=1600, 
        description="The text message content.",
        examples=["Hello from Observer AI!"]
    )

class TwilioConfig(BaseModel):
    """A Pydantic model to hold and validate Twilio credentials."""
    account_sid: str
    auth_token: str
    from_number: str

# --- Dependency for Twilio Configuration ---
def get_twilio_config():
    """
    Dependency to load and validate Twilio credentials from environment variables.
    Raises an HTTPException if any are missing, preventing the endpoint from running.
    """
    account_sid = os.getenv("TWILIO_ACCOUNT_SID")
    auth_token = os.getenv("TWILIO_AUTH_TOKEN")
    from_number = os.getenv("TWILIO_PHONE_NUMBER")

    if not all([account_sid, auth_token, from_number]):
        logger.error("Server is missing required TWILIO environment variables.")
        raise HTTPException(
            status_code=500,
            detail="SMS service is not configured on the server."
        )
    return TwilioConfig(account_sid=account_sid, auth_token=auth_token, from_number=from_number)


# --- API Endpoint ---
@tools_router.post("/tools/send-sms", tags=["Tools"])
async def send_sms(
    request_data: SmsRequest,
    config: TwilioConfig = Depends(get_twilio_config)
):
    """
    Sends an SMS message using Twilio.
    
    This is a basic endpoint for testing the core SMS functionality.
    Authentication and rate-limiting will be added later.
    """
    logger.info(f"Received SMS request for number: {request_data.to_number}")

    try:
        # Initialize the Twilio client with validated credentials from the dependency
        client = Client(config.account_sid, config.auth_token)

        # Create and send the message
        message = client.messages.create(
            to=request_data.to_number,
            from_=config.from_number,
            body=request_data.message
        )
        
        logger.info(f"SMS sent successfully. SID: {message.sid}")
        return {"success": True, "message_sid": message.sid}

    except TwilioRestException as e:
        # This catches API errors from Twilio, like an invalid phone number
        logger.error(f"Twilio API error: {e}")
        raise HTTPException(
            status_code=400, # Bad Request, as the input data was likely the cause
            detail=f"Failed to send SMS: {e.msg}"
        )
    except Exception as e:
        # Catch any other unexpected errors
        logger.exception("An unexpected error occurred while sending SMS.")
        raise HTTPException(
            status_code=500,
            detail="An internal server error occurred."
        )
