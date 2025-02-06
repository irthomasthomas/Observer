# tools/notification.py
from core.base_tool import BaseTool
from plyer import notification

class NotificationTool(BaseTool):
    command_prefix = "NOTIFY:"

    def execute(self, title: str, message: str) -> bool:
        try:
            notification.notify(
                title=title.strip(),
                message=message.strip(),
                app_name="AI Assistant",
                timeout=10
            )
            return True
        except Exception as e:
            print(f"Notification failed: {e}")
            return False

    @property
    def help_text(self):
        return "NOTIFY: title | message - Send a system notification"
