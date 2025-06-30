# quota_manager.py

import datetime
import logging
from threading import Lock

logger = logging.getLogger('quota_manager')

# --- Configuration ---
DAILY_CREDIT_LIMIT = 30

# --- In-Memory State ---
# This dictionary will store usage counts for the current day.
# It is thread-safe thanks to the lock.
_user_daily_usage = {}
_current_day = datetime.date.today()
_lock = Lock()

def _check_and_reset_if_new_day():
    """Internal function to reset the usage dict on a new day."""
    global _current_day, _user_daily_usage
    today = datetime.date.today()
    if today != _current_day:
        logger.info(f"New day detected. Resetting daily usage credits from {_current_day} to {today}.")
        _user_daily_usage.clear()
        _current_day = today

def increment_usage(user_id: str) -> int:
    """
    Increments the request count for a given user for the current day.
    Returns the new count.
    """
    with _lock:
        _check_and_reset_if_new_day()
        current_usage = _user_daily_usage.get(user_id, 0)
        new_usage = current_usage + 1
        _user_daily_usage[user_id] = new_usage
        return new_usage

def get_usage(user_id: str) -> dict:
    """
    Retrieves the current usage and remaining credits for a user.
    """
    with _lock:
        _check_and_reset_if_new_day()
        used = _user_daily_usage.get(user_id, 0)
        remaining = max(0, DAILY_CREDIT_LIMIT - used)
        return {"used": used, "remaining": remaining, "limit": DAILY_CREDIT_LIMIT}
