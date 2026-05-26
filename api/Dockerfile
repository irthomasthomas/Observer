# Multi-stage build for Observer API
FROM python:3.11-slim as base

# Install system dependencies
RUN apt-get update && apt-get install -y \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy requirements first for better caching
COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY *.py .
COPY *.html .

# Create necessary directories
RUN mkdir -p /app/temp_images /app/logs

# Expose port
EXPOSE 3839

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3839/ || exit 1

# Run the application
CMD ["python", "api.py", "--port", "3839"]
