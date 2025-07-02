# payments.py

import stripe
import os
import logging
from fastapi import APIRouter, Request, Header, HTTPException

# Import the user dependency from auth.py
from .auth import AuthUser
# Import the update function from our new manager
from .auth0_manager import update_user_to_pro

logger = logging.getLogger(__name__)
payments_router = APIRouter()

# --- Configuration from Environment ---
stripe.api_key = os.environ.get("STRIPE_SECRET_KEY")
WEBHOOK_SECRET = os.environ.get("STRIPE_WEBHOOK_SECRET")
PRO_PRICE_ID = os.environ.get("STRIPE_PRO_PRICE_ID")
SUCCESS_URL = "https://app.observer-ai.com/upgrade-success"
CANCEL_URL = "https://app.observer-ai.com/subscription"


@payments_router.post(
    "/create-checkout-session",
    summary="Create Stripe Checkout Session"
)
async def create_checkout_session(current_user: AuthUser):
    """
    Creates a Stripe Checkout session for the currently authenticated user to purchase the Pro plan.
    """
    try:
        checkout_session = stripe.checkout.Session.create(
            line_items=[{"price": PRO_PRICE_ID, "quantity": 1}],
            mode="subscription",
            # This is the magic link! We pass the user's Auth0 ID to Stripe.
            # Stripe will give it back to us in the webhook event.
            client_reference_id=current_user.id,
            success_url=SUCCESS_URL,
            cancel_url=CANCEL_URL,
        )
        return {"url": checkout_session.url}
    except Exception as e:
        logger.error(f"Stripe Checkout creation failed for user {current_user.id}: {e}")
        raise HTTPException(status_code=500, detail="Could not create payment session.")


@payments_router.post("/webhooks/stripe", summary="Stripe Webhook Handler")
async def stripe_webhook(request: Request, stripe_signature: str = Header(None)):
    """
    Listens for events from Stripe. This endpoint is public but verified by Stripe's signature.
    """
    payload = await request.body()
    try:
        event = stripe.Webhook.construct_event(
            payload=payload, sig_header=stripe_signature, secret=WEBHOOK_SECRET
        )
    except (ValueError, stripe.error.SignatureVerificationError) as e:
        logger.warning(f"Invalid Stripe webhook request: {e}")
        raise HTTPException(status_code=400, detail="Invalid webhook signature.")

    # Handle the 'checkout session completed' event
    if event['type'] == 'checkout.session.completed':
        session = event['data']['object']
        user_id = session.get('client_reference_id')

        if not user_id:
            logger.error("Stripe session completed but 'client_reference_id' (Auth0 User ID) was missing.")
            return {"status": "error", "detail": "Missing user identifier."}

        logger.info(f"Payment successful for user: {user_id}. Attempting to upgrade to Pro.")
        
        # --- Here is the orchestration ---
        # Call the function from our dedicated Auth0 manager
        success = await update_user_to_pro(user_id)
        if not success:
            # You might want to add alerting here (e.g., send yourself an email)
            # because you have taken money but failed to grant access.
            logger.critical(f"CRITICAL: Took payment for user {user_id} but FAILED to update Auth0 role.")

    return {"status": "success"}
