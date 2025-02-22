#!/usr/bin/env python3
import os
import sys
from pathlib import Path

# Add the parent directory to sys.path
current_dir = Path(__file__).parent
parent_dir = current_dir.parent
sys.path.append(str(parent_dir))

# Import the Capture class
from core.capture import Capture

def main():
    print("Initializing Capture...")
    capture = Capture()
    
    print("Taking screenshot...")
    screenshot = capture.take_screenshot()
    
    print(f"Screenshot size: {len(screenshot)} bytes")
    
    print("Extracting text...")
    text = capture.get_text(screenshot)
    
    print("=" * 50)
    print("Extracted Text:")
    print("=" * 50)
    print(text)
    print("=" * 50)
    
    print("Cleaning up...")
    del capture
    
    print("Done!")

if __name__ == "__main__":
    main()
