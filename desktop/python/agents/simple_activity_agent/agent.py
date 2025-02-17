from core.base_agent import BaseAgent
from datetime import datetime

class SimpleActivityAgent(BaseAgent):
    def __init__(self, host="127.0.0.1", agent_model="deepseek-r1:7b"):
        super().__init__(agent_name="simple_activity_agent", host=host, agent_model=agent_model)
        self.activity_file = self.get_data_path("activities.txt")
        self.last_activity = None
    
    def process_command(self, line):
        if not line.startswith("ACTIVITY:"):
            return
            
        activity = line.replace("ACTIVITY:", "").strip()
        if activity != self.last_activity:
            timestamp = datetime.now().strftime("%I:%M%p").lower()
            with open(self.activity_file, "a") as f:
                f.write(f"{timestamp}: {activity}\n")
            self.last_activity = activity
