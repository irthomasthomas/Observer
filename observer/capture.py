# capture.py
import mss
import mss.tools
import pytesseract
from PIL import Image
import io
import time

class ScreenCapture:
    def __init__(self):
        """Initialize the screen capture tool"""
        self.sct = mss.mss()

    def capture_screen(self):
        """Capture the entire main screen and return the image data"""
        # Grab the main monitor (usually index 1)
        screen = self.sct.monitors[1]
        screenshot = self.sct.grab(screen)
        return mss.tools.to_png(screenshot.rgb, screenshot.size)

    def capture_region(self, left, top, width, height):
        """Capture a specific region of the screen"""
        region = {
            "left": left,
            "top": top,
            "width": width,
            "height": height
        }
        screenshot = self.sct.grab(region)
        return mss.tools.to_png(screenshot.rgb, screenshot.size)

    def get_text_from_image(self, image_data):
        """Extract text from image data using OCR"""
        image = Image.open(io.BytesIO(image_data))
        return pytesseract.image_to_string(image)

    def __del__(self):
        """Clean up when the object is destroyed"""
        self.sct.close()

# Example usage
if __name__ == "__main__":
    # Create a screen capture instance
    screen_cap = ScreenCapture()

    # Take a full screenshot and get text
    screenshot = screen_cap.capture_screen()
    text = screen_cap.get_text_from_image(screenshot)
    print("Text found on screen:", text)

    # Capture a specific region (e.g., top-left corner)
    region_shot = screen_cap.capture_region(0, 0, 500, 500)
    region_text = screen_cap.get_text_from_image(region_shot)
    print("Text in region:", region_text)
