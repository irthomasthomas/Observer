import webbrowser
import requests
import pyperclip
from plyer import notification
class AgentTools:
    def notify(self, title, message):
        """Send a simple system notification to the user"""
        try:
            notification.notify(
                title=title,
                message=message,
                app_name="AI Assistant",
                timeout=10
            )
        except Exception as e:
            print(f"Notification failed: {e}")
            print(f"Notification: {title} - {message}")
    def search(self, query, source="google"):
        """Search the web using Google or Wikipedia"""
        base_urls = {
            "google": "https://www.google.com/search?q=",
            "wikipedia": "https://en.wikipedia.org/wiki/Special:Search?search="
        }

        url = base_urls.get(source, base_urls["google"]) + requests.utils.quote(query)
        try:
            webbrowser.open(url)
            return True
        except Exception as e:
            print(f"Search failed: {e}")
            return False
    def clipboard(self, action="get", content=None):
        """Manage clipboard operations"""
        try:
            if action == "get":
                return pyperclip.paste()
            elif action == "set" and content:
                pyperclip.copy(content)
                return True
            return False
        except Exception as e:
            print(f"Clipboard operation failed: {e}")
            return None
