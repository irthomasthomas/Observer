# capture.py
import mss
import mss.tools
import pytesseract
from PIL import Image
import io

class Capture:
    def __init__(self):
        self.sct = mss.mss()
    
    def take_screenshot(self):
        """Take a screenshot of the main monitor"""
        screenshot = self.sct.grab(self.sct.monitors[1])
        return mss.tools.to_png(screenshot.rgb, screenshot.size)
    
    def get_text(self, image_data):
        """Extract text from image using OCR"""
        image = Image.open(io.BytesIO(image_data))
        return pytesseract.image_to_string(image)

    def __del__(self):
        self.sct.close()
