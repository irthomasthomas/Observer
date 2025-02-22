import mss
import mss.tools
import base64
import requests
import time

class Capture:
    def __init__(self):
        self.sct = mss.mss()
        self.ocr_endpoint = "http://localhost:8000/ocr/simple"
    
    def take_screenshot(self):
        """Take a screenshot of the main monitor"""
        print("[DEBUG] Taking screenshot")
        screenshot = self.sct.grab(self.sct.monitors[1])
        return mss.tools.to_png(screenshot.rgb, screenshot.size)
    
    def get_text(self, image_data):
        """Direct OCR: send image, get text back"""
        try:
            print(f"[DEBUG] Converting image to base64, size: {len(image_data)} bytes")
            base64_image = base64.b64encode(image_data).decode('utf-8')
            
            print(f"[DEBUG] Sending to OCR endpoint, base64 size: {len(base64_image)}")
            start_time = time.time()
            
            response = requests.post(
                self.ocr_endpoint, 
                json={"image": base64_image},
                timeout=30
            )
            
            elapsed = time.time() - start_time
            print(f"[DEBUG] OCR request completed in {elapsed:.2f} seconds")
            
            if response.status_code == 200:
                result = response.json()
                text = result.get("text", "")
                print(f"[DEBUG] OCR text received, length: {len(text)}")
                if text:
                    print(f"[DEBUG] First 100 chars: {text[:100]}")
                return text
            else:
                print(f"[DEBUG] OCR request failed: {response.status_code}")
                print(f"[DEBUG] Response: {response.text}")
                return "OCR processing failed"
                
        except Exception as e:
            print(f"[DEBUG] Error in OCR: {str(e)}")
            return "OCR processing error"
    
    def __del__(self):
        if hasattr(self, 'sct'):
            self.sct.close()
