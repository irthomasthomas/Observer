from functools import wraps
from typing import Callable, Dict
import logging

logger = logging.getLogger(__name__)

class CommandRegistry:
    def __init__(self):
        self.commands: Dict[str, Callable] = {}
        logger.debug("Created new CommandRegistry")

    def register(self, name: str) -> Callable:
        logger.debug(f"Registering command: {name}")
        def decorator(func: Callable) -> Callable:
            @wraps(func)
            def wrapper(*args, **kwargs):
                logger.debug(f"Executing command {name} with args: {args}, kwargs: {kwargs}")
                return func(*args, **kwargs)
            self.commands[name] = wrapper
            logger.debug(f"Registered command {name}. Current commands: {list(self.commands.keys())}")
            return wrapper
        return decorator

# Create a global registry instance
registry = CommandRegistry()

# Decorator for registering commands
def command(name: str) -> Callable:
    """Decorator to register a command handler"""
    logger.debug(f"Command decorator called for: {name}")
    return registry.register(name)

# Export the registry instance
__all__ = ['command', 'registry']
