from core.base_agent import BaseAgent

class CustomAgent(BaseAgent):
    """A custom agent implementation"""
    def __init__(self, host="127.0.0.1", agent_model="deepseek-r1:7b"):
        super().__init__(agent_name="agent_custom2", host=host, agent_model=agent_model)