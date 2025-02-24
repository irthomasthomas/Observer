#!/usr/bin/env python
import requests
import time
import os
import sys
from datetime import datetime

# Configuration
API_BASE_URL = "http://localhost:8000"
TEST_IMAGE = "iVBORw0KGgoAAAANSUhEUgAAAMgAAABkCAYAAADDhn8LAAAAAXNSR0IArs4c6QAAAERlWElmTU0AKgAAAAgAAYdpAAQAAAABAAAAGgAAAAAAA6ABAAMAAAABAAEAAKACAAQAAAABAAAAyKADAAQAAAABAAAAZAAAAADZhPHIAAADD0lEQVR4Ae3dMW7bQBBAUcop4NqnSu8DpPQZfA9XKXxTF+5TpkgT26AIBBmwlBhGsmbeCw7i7HK58PaHoSiVp+fn538Oh8MlFEFdgX9X5RoECHwrIBDfDAQGAgLxx0FgICCQAZA6AYH4HiAwEBDIAEidgEB8DxAYCAhkAKROQCC+BwgMBAQyAFInIBDfAwQGAgIZAKkTEIjvAQIDAYEMgNQJCMT3AIGBgEAGQOoEBOJ7gMBAQCADIHUCAvE9QGAgIJABkDoBgfgeIDAQEMgASJ2AQHwPEBgICGQApE5AIL4HCAwEBDIAUicgEN8DBAYCAhkAqRMQiO8BAgMBgQyA1AkIxPcAgYGAQAZA6gQE4nuAwEBAIAMgdQIC8T1AYCAgkAGQOgGB+B4gMBAQyABInYBAfA8QGAgIZACkTkAgvgcIDAQEMgBSJyAQ3wMEBgICGQCpExCI7wECAwGBDIDUCQjE9wCBgYBABkDqBATie4DAQGCvQP7u1TUuAhSBx+PxL+NJ4GrP0/n9Ecp11H4QGApcz2f2wWMh8CoCAnnVlT6/zy2nVtevIJPHNQr0Xw/nOv3Ht1+TuP7bz7d9PP3Hu+EkcL0Huf43/HJ+/zV55PnUf5Ot3++ORICAwRzDuV5o13H0BdeB7OUJILAREB/IDYX6rp+C7HEJEBgIGMwBkDqBPR8Gn6/nVusD3kFgu4NcDuf3P40rgS2N74+AwEDAYA6A1AkIxPcAgYGAwRwAqRPY87vI+Wf/5NsO4h0EtjvI5efxbzKuBLY0vj8CAgMBgzkAUicgEN8DBAYCBnMApE5gzwfF89vLyfdPvgV4B4HtDnK5/P5OxpXAlsb3R0BgIGAwB0DqBATie4DAQMBgDoDUCRjMNZE+gT3fQfq6OgT2EdjzD4v2GdVRELgR2HOKdTPMboDAjYBAbkj8h8BeAgLZS9JxENgICGQD5G4CewkIZC9Jx0FgIyCQDZC7CewlIJC9JB0HgY2AQDZAbibwtPkTl0BgJ4Gn8/n9/+eYdhrSYRB4GYH/AUgbPQquv9KHAAAAAElFTkSuQmCC"

def clear_screen():
    """Clear the terminal screen"""
    os.system('cls' if os.name == 'nt' else 'clear')

def make_request(url, method="GET", data=None):
    """Make a request to the API and display the result"""
    try:
        if method == "GET":
            response = requests.get(url)
        elif method == "POST":
            response = requests.post(url, json=data)
        
        print(f"Status Code: {response.status_code}")
        try:
            result = response.json()
            print("Response:")
            print(result)
        except:
            print("Response (not JSON):", response.text[:200])
    except Exception as e:
        print(f"Error: {str(e)}")
    
    input("\nPress Enter to continue...")

def display_menu():
    """Display the debug menu"""
    clear_screen()
    print("===================================")
    print("OCR Debug Menu")
    print("===================================")
    print(f"API URL: {API_BASE_URL}")
    print("-----------------------------------")
    print("1. Check Server Status")
    print("2. Trigger OCR Test (send test image)")
    print("3. Get Image (pretend to be frontend)")
    print("4. Submit OCR Text (pretend to be frontend)")
    print("5. Start Automated Testing")
    print("6. Stop Automated Testing")
    print("7. View Test Results")
    print("8. Clear State")
    print("9. Exit")
    print("-----------------------------------")

def main():
    """Main function to run the debug menu"""
    while True:
        display_menu()
        choice = input("Enter your choice (1-9): ")
        
        if choice == "1":
            # Check server status
            make_request(f"{API_BASE_URL}/")
        
        elif choice == "2":
            # Trigger a manual test
            make_request(f"{API_BASE_URL}/test/manual")
        
        elif choice == "3":
            # Act as frontend getting image
            make_request(f"{API_BASE_URL}/ocr/image")
        
        elif choice == "4":
            # Act as frontend submitting text
            text = input("Enter OCR text to submit: ")
            make_request(f"{API_BASE_URL}/ocr/text", method="POST", data={"text": text})
        
        elif choice == "5":
            # Start automated testing
            make_request(f"{API_BASE_URL}/test/start")
        
        elif choice == "6":
            # Stop automated testing
            make_request(f"{API_BASE_URL}/test/stop")
        
        elif choice == "7":
            # View test results
            make_request(f"{API_BASE_URL}/test/results")
        
        elif choice == "8":
            # Clear state
            make_request(f"{API_BASE_URL}/clear")
        
        elif choice == "9":
            # Exit
            clear_screen()
            print("Exiting OCR Debug Menu...")
            sys.exit(0)
        
        else:
            input("Invalid choice. Press Enter to continue...")

if __name__ == "__main__":
    try:
        # Check if the API is available
        requests.get(f"{API_BASE_URL}/")
        print("API is available! Starting menu...")
        time.sleep(1)
        main()
    except requests.exceptions.ConnectionError:
        print(f"Error: Cannot connect to the API at {API_BASE_URL}")
        print("Make sure the OCR debug server is running.")
        sys.exit(1)
