import json
from datetime import datetime
import os
from core.base_agent import BaseAgent

class TimestampAgent(BaseAgent):
    def __init__(self, host="10.0.0.72", agent_model = "deepseek-r1:8b"):
        super().__init__(agent_name="timestamp_agent", host=host, agent_model = agent_model)
        
        # Initialize activity log file
        self.activity_file = self.get_data_path("activity_log.json")
        if not os.path.exists(self.activity_file):
            with open(self.activity_file, 'w') as f:
                json.dump([], f)
        
        self.last_activity = None
        self.last_timestamp = None

    def process_command(self, line):
        try:
            if ':' not in line:
                return
                
            command, *params = line.split(':', 1)
            params = [p.strip() for p in params[0].split('|')] if params else []

            if command == "WRITE_ACTIVITY" and params:
                self.write_activity(params[0])
            elif command == "READ_LAST_ACTIVITY":
                self.read_last_activity()
        except Exception as e:
            self.log(f"Error processing command: {e}")

    def read_last_activity(self):
        try:
            with open(self.activity_file, 'r') as f:
                activities = json.load(f)
                return activities[-1] if activities else None
        except Exception as e:
            self.log(f"Error reading activity: {e}")
            return None

    def write_activity(self, activity_description):
        try:
            if activity_description != self.last_activity:
                timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                
                with open(self.activity_file, 'r') as f:
                    activities = json.load(f)
                
                activities.append({
                    "timestamp": timestamp,
                    "activity": activity_description
                })
                
                with open(self.activity_file, 'w') as f:
                    json.dump(activities, f, indent=2)
                
                self.last_activity = activity_description
                self.last_timestamp = timestamp
                return True
            return False
        except Exception as e:
            self.log(f"Error writing activity: {e}")
            return False

