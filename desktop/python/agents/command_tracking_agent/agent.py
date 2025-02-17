from core.base_agent import BaseAgent
from datetime import datetime

class CommandTrackingAgent(BaseAgent):
    def __init__(self, host="127.0.0.1", agent_model="deepseek-r1:7b"):
        super().__init__(agent_name="command_tracking_agent", host=host, agent_model=agent_model)
        self.command_file = self.get_data_path("commands.txt")
        self.last_command = None
    
    def process_command(self, line):
        if not line.startswith("COMMAND:"):
            return
            
        command = line.replace("COMMAND:", "").strip()
        if command != self.last_command:  # Only log if it's a new command
            timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            with open(self.command_file, "a") as f:
                f.write(f"[{timestamp}] {command}\n")
            self.last_command = command
