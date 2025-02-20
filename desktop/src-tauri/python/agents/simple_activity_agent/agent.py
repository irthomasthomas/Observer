from core.base_agent import BaseAgent

class SimpleActivityAgent(BaseAgent):
    """Just used for agent type identification"""
    def __init__(self, host="127.0.0.1", agent_model="deepseek-r1:7b"):
        super().__init__(agent_name="simple_activity_agent", host=host, agent_model=agent_model)