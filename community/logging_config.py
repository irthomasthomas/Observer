import logging
import sys
from python_json_logger import jsonlogger

def setup_logging():
    """
    Configures logging to output structured JSON.
    This should be called once when the application starts.
    """
    # Get the root logger
    logger = logging.getLogger()
    logger.setLevel(logging.INFO) # Set the lowest level you want to capture

    # Remove any existing handlers
    if logger.hasHandlers():
        logger.handlers.clear()

    # Create a handler to write to standard output (which systemd will capture)
    logHandler = logging.StreamHandler(sys.stdout)

    # Use a custom formatter for JSON output
    # Add any fields you want to be standard in every log message here
    formatter = jsonlogger.JsonFormatter(
        '%(asctime)s %(name)s %(levelname)s %(message)s %(module)s %(funcName)s %(lineno)d'
    )

    logHandler.setFormatter(formatter)
    logger.addHandler(logHandler)

    # Prevent propagation to the old root logger
    logging.getLogger().propagate = False

    logging.info("Structured JSON logging configured.")

# Example usage (you'll call this from api.py)
if __name__ == '__main__':
    setup_logging()
    logging.warning("This is a test warning message.", extra={'test_key': 'test_value'})
    logging.info("This is an info message.")
