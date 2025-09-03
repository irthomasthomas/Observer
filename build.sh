#!/bin/bash

echo "Building Observer..."
cd app

# Disable signing for local builds
unset TAURI_SIGNING_PRIVATE_KEY
unset TAURI_SIGNING_PRIVATE_KEY_PASSWORD

npm run tauri build -- --bundles deb

# Always try to run the binary if it exists
if [ -f "./src-tauri/target/release/app" ]; then
    echo "Running Observer..."
    ./src-tauri/target/release/app
else
    echo "Binary not found! Build may have failed completely."
    exit 1
fi