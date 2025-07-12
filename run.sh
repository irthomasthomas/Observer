#!/bin/bash

# A simple script to build and serve the Observer webapp locally.
# Ideal for users who already have an OpenAI-compatible API
# (like Llama.cpp, vLLM, etc.) and just need the UI.

# Navigate to the app directory
cd app || { echo "Error: 'app' directory not found. Make sure you are in the project root."; exit 1; }

# Check if node_modules exists, if not, install dependencies
if [ ! -d "node_modules" ]; then
  echo "Node modules not found. Running 'npm install'..."
  npm install
fi

echo "Building the webapp for production..."
npm run build

echo "Starting the webapp server on http://localhost:8080"
echo "You can now connect to your own local model endpoint from the UI."
npm run preview
