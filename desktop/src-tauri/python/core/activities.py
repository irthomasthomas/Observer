import logging
from functools import wraps
from typing import Dict, Callable

logger = logging.getLogger(__name__)

class ActivityRegistry:
    def __init__(self):
        self.commands: Dict[str, Callable] = {}
        self.files: Dict[str, str] = {}
    
    def register_command(self, name: str) -> Callable:
        def decorator(func: Callable) -> Callable:
            @wraps(func)
            def wrapper(*args, **kwargs):
                return func(*args, **kwargs)
            self.commands[name] = wrapper
            return wrapper
        return decorator
    
    def register_file(self, name: str):
        def decorator(func: Callable) -> Callable:
            filepath = func()
            self.files[name] = filepath
            return func
        return decorator
    
    def inject_files(self, prompt: str) -> str:
        result = prompt
        for name, filepath in self.files.items():
            if name in result:
                try:
                    with open(filepath, 'r') as f:
                        content = f.read().strip()
                    result = result.replace(name, content)
                except Exception as e:
                    logger.error(f"Failed to read {filepath}: {e}")
        return result

registry = ActivityRegistry()

def command(name: str) -> Callable:
    return registry.register_command(name)

def file(name: str) -> Callable:
    return registry.register_file(name)

__all__ = ['command', 'file', 'registry']
