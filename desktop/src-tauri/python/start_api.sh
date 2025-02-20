#!/bin/bash
# Log startup information
LOG_FILE="/tmp/observer_api_log.txt"
echo "Starting API wrapper script at $(date)" >> "$LOG_FILE"
echo "Working directory: $(pwd)" >> "$LOG_FILE"
echo "Python version: $(python3 --version 2>&1)" >> "$LOG_FILE"

# Force using system Python
/usr/bin/python3 "$(dirname "$0")/api.py"
