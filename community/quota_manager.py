# quota_manager.py (Final Version)

import datetime
import logging
from threading import Lock
from typing import Dict

logger = logging.getLogger('quota_manager')

# --- Configuration ---
QUOTA_LIMITS = {
    "chat": 30,
    "sms": 10,
    "email": 20,
}

# --- In-Memory State ---
_user_daily_usage: Dict[str, Dict[str, int]] = {}
_current_day = datetime.date.today()
_lock = Lock()

def _check_and_reset_if_new_day():
    """Internal function to reset the usage dict on a new day."""
    global _current_day, _user_daily_usage
    today = datetime.date.today()
    if today != _current_day:
        logger.info(f"New day detected. Resetting all usage quotas from {_current_day} to {today}.")
        _user_daily_usage.clear()
        _current_day = today

def increment_usage(user_id: str, service: str) -> int:
    """
    Increments the request count for a given user and service for the current day.
    Returns the new count for that service.
    """
    with _lock:
        _check_and_reset_if_new_day()
        user_services = _user_daily_usage.setdefault(user_id, {})
        current_usage = user_services.get(service, 0)
        new_usage = current_usage + 1
        user_services[service] = new_usage
        return new_usage

def get_usage_for_service(user_id: str, service: str) -> int:
    """
    Retrieves the current usage count for a specific service for a user.
    """
    with _lock:
        _check_and_reset_if_new_day()
        user_services = _user_daily_usage.get(user_id, {})
        return user_services.get(service, 0)

def get_all_usage_data() -> dict:
    """
    Returns the entire usage database. For admin purposes.
    """
    with _lock:
        _check_and_reset_if_new_day()
        return dict(_user_daily_usage)

