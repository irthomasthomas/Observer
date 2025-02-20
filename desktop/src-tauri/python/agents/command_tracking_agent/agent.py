from core.base_agent import BaseAgent
from datetime import datetime

class CommandTrackingAgent(BaseAgent):
    def __init__(self, host="127.0.0.1", agent_model="deepseek-r1:7b"):
        super().__init__(agent_name="command_tracking_agent", host=host, agent_model=agent_model)
