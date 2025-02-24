#!/usr/bin/env python
import uvicorn
from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import time
import logging
import base64
import sys
import requests
import threading
import json
from datetime import datetime

# Configure logging
logging.basicConfig(
    level=logging.DEBUG,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler(f"ocr_debug_{datetime.now().strftime('%Y%m%d_%H%M%S')}.log")
    ]
)
logger = logging.getLogger("ocr-debug")

# Create FastAPI app
app = FastAPI(title="OCR Debug Server")

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # For debugging, allow all origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Pydantic models
class SimpleOCRRequest(BaseModel):
    image: str

class SimpleOCRResponse(BaseModel):
    text: str

class OCRTextSubmission(BaseModel):
    text: str

# Testing image - a simple base64 encoded white image with black text "TEST OCR"
TEST_IMAGE = "iVBORw0KGgoAAAANSUhEUgAAAMgAAABkCAYAAADDhn8LAAAAAXNSR0IArs4c6QAAAERlWElmTU0AKgAAAAgAAYdpAAQAAAABAAAAGgAAAAAAA6ABAAMAAAABAAEAAKACAAQAAAABAAAAyKADAAQAAAABAAAAZAAAAADZhPHIAAADD0lEQVR4Ae3dMW7bQBBAUcop4NqnSu8DpPQZfA9XKXxTF+5TpkgT26AIBBmwlBhGsmbeCw7i7HK58PaHoSiVp+fn538Oh8MlFEFdgX9X5RoECHwrIBDfDAQGAgLxx0FgICCQAZA6AYH4HiAwEBDIAEidgEB8DxAYCAhkAKROQCC+BwgMBAQyAFInIBDfAwQGAgIZAKkTEIjvAQIDAYEMgNQJCMT3AIGBgEAGQOoEBOJ7gMBAQCADIHUCAvE9QGAgIJABkDoBgfgeIDAQEMgASJ2AQHwPEBgICGQApE5AIL4HCAwEBDIAUicgEN8DBAYCAhkAqRMQiO8BAgMBgQyA1AkIxPcAgYGAQAZA6gQE4nuAwEBAIAMgdQIC8T1AYCAgkAGQOgGB+B4gMBAQyABInYBAfA8QGAgIZACkTkAgvgcIDAQEMgBSJyAQ3wMEBgICGQCpExCI7wECAwGBDIDUCQjE9wCBgYBABkDqBATie4DAQGCvQP7u1TUuAhSBx+PxL+NJ4GrP0/n9Ecp11H4QGApcz2f2wWMh8CoCAnnVlT6/zy2nVtevIJPHNQr0Xw/nOv3Ht1+TuP7bz7d9PP3Hu+EkcL0Huf43/HJ+/zV55PnUf5Ot3++ORICAwRzDuV5o13H0BdeB7OUJILAREB/IDYX6rp+C7HEJEBgIGMwBkDqBPR8Gn6/nVusD3kFgu4NcDuf3P40rgS2N74+AwEDAYA6A1AkIxPcAgYGAwRwAqRPY87vI+Wf/5NsO4h0EtjvI5efxbzKuBLY0vj8CAgMBgzkAUicgEN8DBAYCBnMApE5gzwfF89vLyfdPvgV4B4HtDnK5/P5OxpXAlsb3R0BgIGAwB0DqBATie4DAQMBgDoDUCRjMNZE+gT3fQfq6OgT2EdjzD4v2GdVRELgR2HOKdTPMboDAjYBAbkj8h8BeAgLZS9JxENgICGQD5G4CewkIZC9Jx0FgIyCQDZC7CewlIJC9JB0HgY2AQDZAbibwtPkTl0BgJ4Gn8/n9/+eYdhrSYRB4GYH/AUgbPQquv9KHAAAAAElFTkSuQmCC"

# App state tracking
class AppState:
    def __init__(self):
        self.latest_ocr_image = None
        self.latest_ocr_text = ""
        self.request_count = 0
        self.success_count = 0
        self.error_count = 0
        self.test_results = []
        self.testing_active = False
        self.frontend_detected = False
        self.last_contact_time = None

app.state = AppState()

# Active test runner that will periodically send test images
def ocr_test_runner():
    """Background thread that periodically sends test images to test the OCR service"""
    test_count = 0
    while True:
        try:
            if app.state.testing_active:
                test_count += 1
                logger.info(f"======= Starting OCR Test #{test_count} =======")
                
                # Reset state for new test
                app.state.latest_ocr_image = TEST_IMAGE
                app.state.latest_ocr_text = ""
                
                # Record start time
                start_time = time.time()
                
                # Wait for a response (up to 30 seconds)
                wait_time = 0
                success = False
                
                while wait_time < 30:
                    if app.state.latest_ocr_text:
                        success = True
                        break
                    
                    time.sleep(1)
                    wait_time += 1
                    if wait_time % 5 == 0:
                        logger.debug(f"Waiting for OCR response... ({wait_time}s)")
                
                # Record test result
                end_time = time.time()
                result = {
                    "test_id": test_count,
                    "timestamp": datetime.now().isoformat(),
                    "success": success,
                    "duration": end_time - start_time,
                    "text_received": app.state.latest_ocr_text if success else None
                }
                
                app.state.test_results.append(result)
                
                if success:
                    logger.info(f"✅ Test #{test_count} PASSED - OCR text received in {result['duration']:.2f}s")
                    logger.info(f"OCR Result: {app.state.latest_ocr_text}")
                else:
                    logger.error(f"❌ Test #{test_count} FAILED - No response after {wait_time}s")
                
                # Wait between tests
                time.sleep(15)
            else:
                time.sleep(5)
        except Exception as e:
            logger.error(f"Error in test runner: {str(e)}")
            time.sleep(5)

# Start the test runner thread
@app.on_event("startup")
async def startup_event():
    threading.Thread(target=ocr_test_runner, daemon=True).start()
    logger.info("OCR debug server started with active test runner")

@app.get("/")
async def root():
    """Root endpoint to verify the server is running"""
    return {
        "status": "running",
        "frontend_detected": app.state.frontend_detected,
        "last_contact": app.state.last_contact_time,
        "statistics": {
            "requests": app.state.request_count,
            "successes": app.state.success_count,
            "errors": app.state.error_count,
        },
        "latest_test_results": app.state.test_results[-5:] if app.state.test_results else []
    }

@app.post("/ocr/simple", response_model=SimpleOCRResponse)
async def simple_ocr(request: SimpleOCRRequest):
    """Simple OCR endpoint: receive image directly from application"""
    app.state.request_count += 1
    
    logger.info(f"Direct OCR request received from application, image size: {len(request.image)}")
    
    try:
        # Store the image for the frontend to process
        app.state.latest_ocr_image = request.image
        
        # Wait for frontend to process (simple polling)
        timeout = 45  # seconds
        start_time = time.time()
        logger.debug(f"Waiting up to {timeout}s for frontend processing")
        
        while time.time() - start_time < timeout:
            if app.state.latest_ocr_text:
                text = app.state.latest_ocr_text
                logger.info(f"Frontend OCR completed, text length: {len(text)}")
                if text:
                    logger.info(f"OCR result: {text[:100]}")
                app.state.success_count += 1
                return SimpleOCRResponse(text=text)
            
            # Wait a bit before checking again
            time.sleep(0.5)
        
        # If no result after timeout, return error
        logger.error("OCR processing timed out")
        app.state.error_count += 1
        return SimpleOCRResponse(text="OCR processing timed out")
        
    except Exception as e:
        logger.error(f"Error in simple OCR: {str(e)}")
        app.state.error_count += 1
        return SimpleOCRResponse(text=f"Error: {str(e)}")

@app.get("/ocr/image")
async def get_latest_image():
    """Endpoint for frontend to get the latest image to process"""
    app.state.frontend_detected = True
    app.state.last_contact_time = datetime.now().isoformat()
    logger.info("👋 Frontend contacted the server to get an image")
    
    # Always provide the test image
    return {"image": app.state.latest_ocr_image or TEST_IMAGE}

@app.post("/ocr/text")
async def submit_ocr_text(request: OCRTextSubmission):
    """Endpoint for frontend to submit OCR text result"""
    app.state.frontend_detected = True
    app.state.last_contact_time = datetime.now().isoformat()
    
    text = request.text
    logger.info(f"✅ Frontend submitted OCR text! Length: {len(text)}")
    if text:
        logger.info(f"OCR Result: {text[:100]}")
    
    app.state.latest_ocr_text = text
    return {"success": True}

@app.get("/test/start")
async def start_testing():
    """Start automated testing"""
    app.state.testing_active = True
    logger.info("🚀 Automated testing started")
    return {"status": "testing_started"}

@app.get("/test/stop")
async def stop_testing():
    """Stop automated testing"""
    app.state.testing_active = False
    logger.info("⏹️ Automated testing stopped")
    return {"status": "testing_stopped"}

@app.get("/test/results")
async def get_test_results():
    """Get all test results"""
    return {
        "total_tests": len(app.state.test_results),
        "success_rate": sum(1 for r in app.state.test_results if r["success"]) / len(app.state.test_results) if app.state.test_results else 0,
        "results": app.state.test_results
    }

@app.get("/test/manual")
async def trigger_manual_test():
    """Manually trigger a single test"""
    app.state.latest_ocr_image = TEST_IMAGE
    app.state.latest_ocr_text = ""
    logger.info("🔍 Manual test initiated - Test image set for OCR processing")
    return {"status": "test_initiated", "message": "Test image set for OCR processing"}

@app.get("/clear")
async def clear_state():
    """Clear the current state"""
    app.state.latest_ocr_image = None
    app.state.latest_ocr_text = ""
    logger.info("🧹 State cleared")
    return {"status": "cleared"}

if __name__ == "__main__":
    print("🚀 Starting OCR Debug Server with active testing...")
    print("✅ Server will run on http://localhost:8000")
    print("✅ OCR service will be actively tested")
    print("✅ Visit /test/start to begin automated testing")
    print("✅ Visit /test/stop to stop automated testing")
    print("✅ Visit /test/manual to trigger a single test")
    print("✅ Visit /test/results to see all test results")
    print("✅ Visit / to check server status")
    uvicorn.run(app, host="127.0.0.1", port=8000)
