# community/payments.py

import stripe
import hashlib
import os
import logging
import re
from fastapi import APIRouter, Request, Header, HTTPException, Depends
from pydantic import BaseModel, EmailStr

# --- Project-specific Imports ---
# This is your dependency for getting the current authenticated user.
from auth import AuthUser
# We need the functions we designed to interact with Auth0.
from auth0_manager import (
    update_user_subscription_status,
    find_user_by_stripe_customer_id,
    find_user_by_email,
    get_email_by_id,
    check_apple_subscription_by_email,
    CLEAR_FIELD
)
# Admin authentication
from admin_auth import get_admin_access

# --- Standard Setup ---
logger = logging.getLogger(__name__)
payments_router = APIRouter()

# --- Configuration from Environment Variables ---
# Make sure these are set in your environment or .env file
try:
    stripe.api_key = os.environ["STRIPE_SECRET_KEY"]
    WEBHOOK_SECRET = os.environ["STRIPE_WEBHOOK_SECRET"]
    PRO_PRICE_ID = os.environ["STRIPE_PRO_PRICE_ID"]
    # Max tier price ID is optional - if not set, Max tier won't be available
    MAX_PRICE_ID = os.environ.get("STRIPE_MAX_PRICE_ID")
    # Plus tier price ID is optional - if not set, Plus tier won't be available
    PLUS_PRICE_ID = os.environ.get("STRIPE_PLUS_PRICE_ID")
except KeyError as e:
    logger.critical(f"FATAL: Missing required environment variable: {e}. Payments API will not work.")
    raise RuntimeError(f"Missing environment variable: {e}") from e


# Price ID to tier mapping for determining subscription level
def get_tier_from_price(price_id: str) -> tuple[bool, bool, bool]:
    """
    Returns (is_pro, is_max, is_plus) for a given price_id.
    """
    if price_id == MAX_PRICE_ID:
        return (True, True, False)  # Max users are also pro
    elif price_id == PRO_PRICE_ID:
        return (True, False, False)
    elif price_id == PLUS_PRICE_ID:
        return (False, False, True)
    else:
        logger.warning(f"Unknown price_id: {price_id}")
        return (False, False, False)


async def has_active_subscription(email: str) -> tuple[bool, str | None, str | None, str | None]:
    """
    Single source-of-truth check for active subscriptions across all providers.

    - Apple: queries Auth0 metadata by email (cache of client-verified JWS transactions)
    - Stripe: queries Stripe directly by email (source of truth)

    Use this instead of checking JWT metadata, which can be stale.

    Args:
        email: User's email address

    Returns:
        (has_subscription, subscription_id, provider, stripe_customer_id)
        provider is "apple" or "stripe" or None
        stripe_customer_id is only set when provider is "stripe"
    """
    if not email:
        return False, None, None, None

    email = email.lower()

    # 1. Check Apple (Auth0 metadata is cache of client-verified JWS transactions)
    has_apple, apple_id = await check_apple_subscription_by_email(email)
    if has_apple:
        return True, apple_id, "apple", None

    # 2. Check Stripe directly (source of truth)
    try:
        all_customers = stripe.Customer.list(email=email, limit=100)
        for cust in all_customers.data:
            subscriptions = stripe.Subscription.list(customer=cust.id, status='all', limit=100)
            for sub in subscriptions.data:
                if sub.status in ('active', 'trialing'):
                    return True, sub.id, "stripe", cust.id
    except Exception as e:
        logger.error(f"Error checking Stripe subscription for {email}: {e}")

    return False, None, None, None


# --- URLs for Redirection ---
DEFAULT_BASE_URL = "https://app.observer-ai.com"
MANAGE_SUBSCRIPTION_RETURN_URL = "https://app.observer-ai.com/refresh"


def is_valid_return_url(url: str | None) -> bool:
    """Allow localhost, tauri, or observer-ai.com origins."""
    if not url:
        return False
    patterns = [
        r'^[a-z]+://localhost(:\d+)?',
        r'^tauri://',
        r'^https?://([^/]+\.)?observer-ai\.com',
    ]
    return any(re.match(pattern, url, re.IGNORECASE) for pattern in patterns)


def get_base_url(client_url: str | None) -> str:
    if client_url and is_valid_return_url(client_url):
        return client_url.rstrip('/')
    return DEFAULT_BASE_URL


# --- Request Models ---
class CheckoutRequest(BaseModel):
    return_base_url: str | None = None


OLD_STRIPE_KEY = os.environ.get("OLD_STRIPE_SECRET_KEY")
if OLD_STRIPE_KEY:
    logger.info("Legacy Stripe key loaded — dual-account mode active.")

logger.info("Payments router initialized successfully.")


def _create_billing_portal(customer_id: str, return_url: str):
    """Try new Stripe first, fall back to legacy Stripe for old customers."""
    try:
        return stripe.billing_portal.Session.create(customer=customer_id, return_url=return_url)
    except stripe.error.InvalidRequestError:
        if OLD_STRIPE_KEY:
            logger.info(f"Customer {customer_id} not found on new Stripe, trying legacy account.")
            return stripe.billing_portal.Session.create(customer=customer_id, return_url=return_url, api_key=OLD_STRIPE_KEY)
        raise


# --- Request Models ---
class TrialLinkRequest(BaseModel):
    """Request model for creating trial links."""
    email: EmailStr


@payments_router.post(
    "/admin/create-trial-link",
    summary="[Admin] Generate 1-Week MAX Trial Link",
    tags=["Admin"]
)
async def create_trial_link(
    request: TrialLinkRequest,
    is_admin: bool = Depends(get_admin_access)
):
    """
    Admin endpoint to generate a Stripe checkout link for a 1-week MAX tier trial.

    - No credit card required
    - Auto-cancels after 7 days if no payment method added
    - Requires X-Admin-Key header for authentication

    Args:
        request: Contains the email address of the trial recipient

    Returns:
        Stripe checkout URL to share with the recipient
    """
    email = request.email.lower()

    # Verify the user exists in Auth0
    user_id = await find_user_by_email(email)
    if not user_id:
        logger.error(f"Admin tried to create trial for non-existent email: {email}")
        raise HTTPException(
            status_code=404,
            detail=f"No Observer user found with email: {email}. User must create an account first."
        )

    # Check if user already has active subscription (source of truth, not stale metadata)
    has_sub, existing_id, provider, _ = await has_active_subscription(email)
    if has_sub:
        logger.warning(f"Admin tried to create trial for {email} but user already has {provider} subscription: {existing_id}")
        raise HTTPException(
            status_code=400,
            detail=f"User already has an active {provider} subscription."
        )

    if not MAX_PRICE_ID:
        logger.error("MAX_PRICE_ID not configured but trial checkout was requested.")
        raise HTTPException(status_code=503, detail="Max tier is not currently available.")

    try:
        checkout_session = stripe.checkout.Session.create(
            line_items=[{"price": MAX_PRICE_ID, "quantity": 1}],
            mode="subscription",

            # Link to user via email (no need to be logged in)
            customer_email=email,

            # Redirect URLs
            success_url=f"{DEFAULT_BASE_URL}/upgrade-success",
            cancel_url=DEFAULT_BASE_URL,

            # Don't require payment method for $0 trial
            payment_method_collection="if_required",

            # Trial configuration with auto-cancellation
            subscription_data={
                "trial_period_days": 7,
                "trial_settings": {
                    "end_behavior": {
                        "missing_payment_method": "cancel"  # Auto-cancel if no payment added
                    }
                },
                # Store user_id for webhook lookup (backup to email)
                "metadata": {
                    "user_id": user_id,
                    "trial_type": "giveaway"
                }
            }
        )

        logger.info(f"Admin created 7-day MAX trial link for {email} (user_id: {user_id})")
        return {
            "url": checkout_session.url,
            "email": email,
            "expires_at": "Link expires in 24 hours",
            "trial_duration": "7 days",
            "message": "Share this link with the recipient. No credit card required."
        }

    except Exception as e:
        logger.error(f"Trial link creation failed for {email}: {e}")
        raise HTTPException(status_code=500, detail="Could not create trial session.")


def _get_subscription_from_metadata(user: AuthUser) -> tuple[bool, str | None, str | None, str | None]:
    """
    Fast subscription check using JWT app_metadata (kept current by Stripe/Apple webhooks).

    Returns (has_subscription, subscription_id, provider, stripe_customer_id)
    """
    metadata = user.app_metadata if isinstance(getattr(user, 'app_metadata', None), dict) else {}

    apple_id = metadata.get("apple_transaction_id")
    if apple_id:
        return True, apple_id, "apple", None

    stripe_sub_id = metadata.get("stripe_subscription_id")
    stripe_customer_id = metadata.get("stripe_customer_id")
    if stripe_sub_id:
        return True, stripe_sub_id, "stripe", stripe_customer_id

    return False, None, None, None


def get_or_create_stripe_customer(user: AuthUser) -> str | None:
    """
    Get existing Stripe customer ID or create a new one with the Auth0 email.

    This ensures the Stripe customer always has the Auth0 email, preventing
    mismatches from Stripe Link or other payment autofill features that could
    create a customer with a different email.
    """
    # Fast path: use cached customer ID from JWT metadata
    if isinstance(getattr(user, 'app_metadata', None), dict):
        cached_id = user.app_metadata.get("stripe_customer_id")
        if cached_id:
            return cached_id

    # Fallback: query Stripe by email (new users who have no metadata yet)
    try:
        if hasattr(user, 'email') and user.email:
            existing_customers = stripe.Customer.list(email=user.email, limit=1)
            if existing_customers.data:
                return existing_customers.data[0].id
    except Exception as e:
        logger.warning(f"Stripe customer lookup failed for {user.id}: {e}")

    # No existing customer found — create one with the Auth0 email
    # so that Stripe Link cannot override it with a different email
    try:
        new_customer = stripe.Customer.create(
            email=user.email,
            metadata={"auth0_user_id": user.id}
        )
        logger.info(f"Created new Stripe customer {new_customer.id} for user {user.id} ({user.email})")
        return new_customer.id
    except Exception as e:
        logger.error(f"Failed to create Stripe customer for {user.id}: {e}")
        return None


@payments_router.post(
    "/create-checkout-session",
    summary="Create Stripe Checkout Session for New Subscription"
)
async def create_checkout_session(current_user: AuthUser, body: CheckoutRequest = None):
    """
    Creates a Stripe Checkout session for the currently authenticated user to
    purchase the Pro plan. The user's Auth0 ID is passed to Stripe for
    identification in webhooks.
    """
    base_url = get_base_url(body.return_base_url if body else None)

    has_sub, existing_id, provider, active_customer_id = _get_subscription_from_metadata(current_user)
    if has_sub:
        if provider == "apple":
            raise HTTPException(
                status_code=400,
                detail="You have an active Apple subscription. Please cancel it in iOS Settings before purchasing via Stripe."
            )
        elif provider == "stripe" and active_customer_id:
            portal = stripe.billing_portal.Session.create(
                customer=active_customer_id,
                return_url=f"{base_url}/refresh",
            )
            return {"url": portal.url, "redirect": "portal"}

    try:
        # Get or create Stripe customer with Auth0 email to prevent Link email mismatch
        customer_id = get_or_create_stripe_customer(current_user)

        # Check if user has already used a free trial
        had_trial = False
        if customer_id:
            try:
                past_subs = stripe.Subscription.list(customer=customer_id, status='all', limit=100)
                had_trial = any(sub.trial_end is not None for sub in past_subs.data)
            except Exception as e:
                logger.warning(f"Failed to check trial history for {current_user.id}: {e}")

        # Check ghost customers — accounts that were deleted and re-registered with the same email
        if not had_trial and hasattr(current_user, 'email') and current_user.email:
            try:
                email_hash = hashlib.sha256(current_user.email.lower().encode()).hexdigest()
                ghost_customers = stripe.Customer.list(email=f"{email_hash}@deleted.invalid", limit=100)
                for ghost in ghost_customers.data:
                    past_subs = stripe.Subscription.list(customer=ghost.id, status='all', limit=100)
                    if any(sub.trial_end is not None for sub in past_subs.data):
                        had_trial = True
                        break
            except Exception as e:
                logger.warning(f"Failed to check ghost trial history for {current_user.id}: {e}")

        checkout_params = {
            "line_items": [{"price": PRO_PRICE_ID, "quantity": 1}],
            "mode": "subscription",
            "client_reference_id": current_user.id,
            "success_url": f"{base_url}/upgrade-success",
            "cancel_url": base_url,
            "allow_promotion_codes": True,
        }

        if not had_trial:
            checkout_params["subscription_data"] = {"trial_period_days": 7}

        if customer_id:
            checkout_params["customer"] = customer_id

        checkout_session = stripe.checkout.Session.create(**checkout_params)
        return {"url": checkout_session.url}
    except Exception as e:
        logger.error(f"Stripe Checkout creation failed for user {current_user.id}: {e}")
        raise HTTPException(status_code=500, detail="Could not create payment session.")


@payments_router.post(
    "/create-checkout-session-max",
    summary="Create Stripe Checkout Session for Max Subscription"
)
async def create_checkout_session_max(current_user: AuthUser, body: CheckoutRequest = None):
    """
    Creates a Stripe Checkout session for the currently authenticated user to
    purchase the Max plan. The user's Auth0 ID is passed to Stripe for
    identification in webhooks.
    """
    base_url = get_base_url(body.return_base_url if body else None)

    has_sub, existing_id, provider, active_customer_id = _get_subscription_from_metadata(current_user)
    if has_sub:
        if provider == "apple":
            raise HTTPException(
                status_code=400,
                detail="You have an active Apple subscription. Please cancel it in iOS Settings before purchasing via Stripe."
            )
        elif provider == "stripe" and active_customer_id:
            portal = stripe.billing_portal.Session.create(
                customer=active_customer_id,
                return_url=f"{base_url}/refresh",
            )
            return {"url": portal.url, "redirect": "portal"}

    if not MAX_PRICE_ID:
        logger.error("MAX_PRICE_ID not configured but Max checkout was requested.")
        raise HTTPException(status_code=503, detail="Max tier is not currently available.")

    try:
        # Get or create Stripe customer with Auth0 email to prevent Link email mismatch
        customer_id = get_or_create_stripe_customer(current_user)

        checkout_params = {
            "line_items": [{"price": MAX_PRICE_ID, "quantity": 1}],
            "mode": "subscription",
            "client_reference_id": current_user.id,
            "success_url": f"{base_url}/upgrade-success",
            "cancel_url": base_url,
            "allow_promotion_codes": True,
        }

        if customer_id:
            checkout_params["customer"] = customer_id

        checkout_session = stripe.checkout.Session.create(**checkout_params)
        return {"url": checkout_session.url}
    except Exception as e:
        logger.error(f"Stripe Checkout creation failed for Max tier for user {current_user.id}: {e}")
        raise HTTPException(status_code=500, detail="Could not create payment session.")


@payments_router.post(
    "/create-checkout-session-plus",
    summary="Create Stripe Checkout Session for Plus Subscription"
)
async def create_checkout_session_plus(current_user: AuthUser, body: CheckoutRequest = None):
    """
    Creates a Stripe Checkout session for the currently authenticated user to
    purchase the Plus plan. The user's Auth0 ID is passed to Stripe for
    identification in webhooks.
    """
    base_url = get_base_url(body.return_base_url if body else None)

    has_sub, existing_id, provider, active_customer_id = _get_subscription_from_metadata(current_user)
    if has_sub:
        if provider == "apple":
            raise HTTPException(
                status_code=400,
                detail="You have an active Apple subscription. Please cancel it in iOS Settings before purchasing via Stripe."
            )
        elif provider == "stripe" and active_customer_id:
            portal = stripe.billing_portal.Session.create(
                customer=active_customer_id,
                return_url=f"{base_url}/refresh",
            )
            return {"url": portal.url, "redirect": "portal"}

    if not PLUS_PRICE_ID:
        logger.error("PLUS_PRICE_ID not configured but Plus checkout was requested.")
        raise HTTPException(status_code=503, detail="Plus tier is not currently available.")

    try:
        # Get or create Stripe customer with Auth0 email to prevent Link email mismatch
        customer_id = get_or_create_stripe_customer(current_user)

        checkout_params = {
            "line_items": [{"price": PLUS_PRICE_ID, "quantity": 1}],
            "mode": "subscription",
            "client_reference_id": current_user.id,
            "success_url": f"{base_url}/upgrade-success",
            "cancel_url": base_url,
            "allow_promotion_codes": True,
        }

        if customer_id:
            checkout_params["customer"] = customer_id

        checkout_session = stripe.checkout.Session.create(**checkout_params)
        return {"url": checkout_session.url}
    except Exception as e:
        logger.error(f"Stripe Checkout creation failed for Plus tier for user {current_user.id}: {e}")
        raise HTTPException(status_code=500, detail="Could not create payment session.")


@payments_router.post(
    "/create-customer-portal-session",
    summary="Create Stripe Customer Portal Session for Management"
)
# CORRECTED LINE: Removed '= Depends(AuthUser)'
async def create_customer_portal_session(current_user: AuthUser, body: CheckoutRequest = None):
    """
    Creates a Stripe Customer Portal session, allowing the user to manage their
    billing information, invoices, and cancel their subscription.
    """
    base_url = get_base_url(body.return_base_url if body else None)

    has_sub, existing_id, provider, customer_id = _get_subscription_from_metadata(current_user)

    if not has_sub:
        raise HTTPException(status_code=404, detail="No active subscription found to manage.")

    if provider == "apple":
        raise HTTPException(
            status_code=400,
            detail="Your subscription is managed through Apple. Please manage it in iOS Settings > Subscriptions."
        )

    if not customer_id:
        raise HTTPException(status_code=404, detail="No active subscription found to manage.")

    try:
        portal_session = _create_billing_portal(customer_id, f"{base_url}/refresh")
        return {"url": portal_session.url}
    except Exception as e:
        logger.error(f"Could not create customer portal for user {current_user.id}: {e}")
        raise HTTPException(status_code=500, detail="Could not create customer portal session.")


async def sync_user_from_stripe(stripe_customer_id: str) -> dict:
    """
    Single idempotent function to sync a user's subscription state from Stripe to Auth0.

    Uses EMAIL as the link between Stripe and Auth0 (not customer ID), so it finds
    ALL Stripe customers for the user's email and checks ALL their subscriptions.
    This prevents cancelling one duplicate customer from overriding an active sub on another.

    Safe to call multiple times - always produces the same result for the same Stripe state.

    Args:
        stripe_customer_id: The Stripe customer ID (from webhook event)

    Returns:
        dict with status, user_id, and subscription info
    """
    # 1. Get the email from the triggering Stripe customer (source of truth)
    try:
        customer = stripe.Customer.retrieve(stripe_customer_id)
        customer_email = customer.get('email')
    except Exception as e:
        logger.error(f"Could not retrieve Stripe customer {stripe_customer_id}: {e}")
        return {"status": "error", "detail": "Failed to retrieve Stripe customer"}

    if not customer_email:
        logger.error(f"Stripe customer {stripe_customer_id} has no email")
        return {"status": "error", "detail": "Customer has no email"}

    # 2. Find the Auth0 user by email (email is the canonical link)
    user_id = await find_user_by_email(customer_email)
    if not user_id:
        # Fallback: try by stripe_customer_id in Auth0 metadata
        user_id = await find_user_by_stripe_customer_id(stripe_customer_id)

    if not user_id:
        logger.error(f"sync_user_from_stripe: Cannot find Auth0 user for email {customer_email} or stripe_customer_id {stripe_customer_id}")
        return {"status": "error", "detail": "User not found"}

    # 3. Find ALL Stripe customers with this email
    try:
        all_customers = stripe.Customer.list(email=customer_email, limit=100)
    except Exception as e:
        logger.error(f"Failed to list Stripe customers for email {customer_email}: {e}")
        return {"status": "error", "detail": "Failed to query Stripe customers"}

    if len(all_customers.data) > 1:
        cust_ids = [c.id for c in all_customers.data]
        logger.warning(f"USER HAS MULTIPLE STRIPE CUSTOMERS: email={customer_email}, user_id={user_id}, customer_ids={cust_ids}")

    # 4. Query ALL subscriptions across ALL customers for this email
    is_pro, is_max, is_plus = False, False, False
    active_subscription_id = None
    active_customer_id = None
    total_active = 0

    for cust in all_customers.data:
        try:
            subscriptions = stripe.Subscription.list(customer=cust.id, limit=100)
        except Exception as e:
            logger.error(f"Failed to list subscriptions for customer {cust.id}: {e}")
            continue

        for sub in subscriptions.data:
            if sub.status in ("active", "trialing"):
                total_active += 1

                try:
                    price_id = sub["items"]["data"][0]["price"]["id"]
                    sub_is_pro, sub_is_max, sub_is_plus = get_tier_from_price(price_id)

                    # Accumulate flags (highest tier wins)
                    is_pro = is_pro or sub_is_pro
                    is_max = is_max or sub_is_max
                    is_plus = is_plus or sub_is_plus

                    # Track subscription/customer ID (prefer max > pro > plus)
                    if sub_is_max or (sub_is_pro and not is_max) or (sub_is_plus and not is_pro and not is_max):
                        active_subscription_id = sub.id
                        active_customer_id = cust.id

                except (KeyError, IndexError) as e:
                    logger.error(f"Cannot extract price from subscription {sub.id}: {e}")

    if total_active > 1:
        logger.warning(f"USER HAS MULTIPLE ACTIVE SUBSCRIPTIONS: user_id={user_id}, email={customer_email}, count={total_active}")

    # 5. Determine final state description for logging
    if is_max:
        tier_name = "Max"
    elif is_pro:
        tier_name = "Pro"
    elif is_plus:
        tier_name = "Plus"
    else:
        tier_name = "Free"

    logger.info(f"Syncing user {user_id} to {tier_name} (active_subs={total_active}, is_pro={is_pro}, is_max={is_max}, is_plus={is_plus})")

    # 6. Update Auth0
    # Store the customer ID that has the active subscription (or keep triggering ID if none active)
    # Clear stripe_subscription_id when no active subscription
    await update_user_subscription_status(
        user_id=user_id,
        is_pro=is_pro,
        is_max=is_max,
        is_plus=is_plus,
        stripe_customer_id=active_customer_id if active_customer_id else stripe_customer_id,
        stripe_subscription_id=active_subscription_id if active_subscription_id else CLEAR_FIELD
    )

    return {
        "status": "success",
        "user_id": user_id,
        "tier": tier_name,
        "active_subscriptions": total_active,
        "is_pro": is_pro,
        "is_max": is_max,
        "is_plus": is_plus
    }


@payments_router.post(
    "/sync-subscription",
    summary="Sync subscription status from Stripe"
)
async def sync_subscription_endpoint(current_user: AuthUser):
    """
    Manually sync the user's subscription status from Stripe.

    Call this when:
    - User returns from Stripe Customer Portal
    - User reports their subscription status is wrong
    - After any subscription change to ensure consistency

    Returns the synced subscription state.
    """
    # Find user's Stripe customer ID (prefer Auth0 metadata, fall back to email lookup)
    stripe_customer_id = None
    if hasattr(current_user, 'app_metadata') and isinstance(current_user.app_metadata, dict):
        stripe_customer_id = current_user.app_metadata.get("stripe_customer_id")

    if not stripe_customer_id and hasattr(current_user, 'email') and current_user.email:
        try:
            customers = stripe.Customer.list(email=current_user.email, limit=1)
            if customers.data:
                stripe_customer_id = customers.data[0].id
        except Exception as e:
            logger.warning(f"Stripe customer lookup by email failed for {current_user.id}: {e}")

    if not stripe_customer_id:
        logger.info(f"User {current_user.id} requested sync but no Stripe customer found")
        return {
            "status": "success",
            "tier": "Free",
            "message": "No subscription found"
        }

    result = await sync_user_from_stripe(stripe_customer_id)
    return result


@payments_router.post(
    "/webhooks/stripe",
    summary="Stripe Webhook Handler (Public)",
    include_in_schema=False
)
async def stripe_webhook(request: Request, stripe_signature: str = Header(None)):
    """
    Listens for events from Stripe and syncs user subscription status to Auth0.

    Architecture: All subscription events trigger the same sync function.
    The sync function queries Stripe for current state - it doesn't trust
    the webhook payload for determining final user state.
    """
    payload = await request.body()
    try:
        event = stripe.Webhook.construct_event(
            payload=payload, sig_header=stripe_signature, secret=WEBHOOK_SECRET
        )
    except (ValueError, stripe.error.SignatureVerificationError) as e:
        logger.warning(f"Invalid Stripe webhook signature: {e}")
        raise HTTPException(status_code=400, detail="Invalid webhook signature.")

    event_type = event['type']
    event_data = event['data']['object']
    logger.info(f"Received Stripe webhook: {event_type}")

    # Events that trigger a sync from Stripe (source of truth)
    SYNC_EVENTS = {
        'customer.subscription.created',
        'customer.subscription.updated',
        'customer.subscription.deleted',
        'invoice.payment_failed',
    }

    # Handle checkout.session.completed — safety net for email mismatches.
    # If Stripe Link changed the customer email, fix it using client_reference_id (Auth0 user ID).
    if event_type == 'checkout.session.completed':
        stripe_customer_id = event_data.get('customer')
        client_ref_id = event_data.get('client_reference_id')
        if stripe_customer_id and client_ref_id:
            try:
                customer = stripe.Customer.retrieve(stripe_customer_id)
                # Look up the Auth0 user's email from client_reference_id
                auth0_email = (get_email_by_id(client_ref_id) or '').lower()
                customer_email = (customer.get('email') or '').lower()

                if auth0_email and customer_email and auth0_email != customer_email:
                    logger.warning(
                        f"Stripe customer {stripe_customer_id} email ({customer_email}) "
                        f"doesn't match Auth0 user {client_ref_id} email ({auth0_email}). "
                        f"Updating Stripe customer email."
                    )
                    stripe.Customer.modify(stripe_customer_id, email=auth0_email)
            except Exception as e:
                logger.error(f"Failed to verify/fix customer email on checkout.session.completed: {e}")

        # Backfill customer name and address from checkout session details.
        # Since we pre-create the customer with only an email, Stripe doesn't
        # have name/address until the user fills them in during checkout.
        if stripe_customer_id:
            try:
                customer_details = event_data.get('customer_details', {})
                update_fields = {}

                name = customer_details.get('name')
                if name:
                    update_fields['name'] = name

                address = customer_details.get('address')
                if address:
                    update_fields['address'] = address

                if update_fields:
                    stripe.Customer.modify(stripe_customer_id, **update_fields)
                    logger.info(f"Backfilled customer {stripe_customer_id} with checkout details: {list(update_fields.keys())}")
            except Exception as e:
                logger.error(f"Failed to backfill customer details for {stripe_customer_id}: {e}")

        # Also trigger a sync for this customer
        if stripe_customer_id:
            result = await sync_user_from_stripe(stripe_customer_id)
            return result
        return {"status": "success"}

    # Get customer ID from event
    stripe_customer_id = event_data.get('customer')

    if event_type in SYNC_EVENTS and stripe_customer_id:
        result = await sync_user_from_stripe(stripe_customer_id)
        return result

    logger.info(f"Ignoring Stripe event: {event_type}")
    return {"status": "success"}
