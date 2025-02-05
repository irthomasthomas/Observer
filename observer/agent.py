# agent.py
import time
from .capture import Capture
from .model import Model

class Agent:
    def __init__(self, task_description):
        self.capture = Capture()
        self.model = Model()
        self.task = task_description
        self.running = False
    
    def start(self):
        """Start the agent's observation loop"""
        self.running = True
        while self.running:
            try:
                # Take screenshot
                image_data = self.capture.take_screenshot()
                
                # Extract text
                text = self.capture.get_text(image_data)
                
                # Generate response based on task
                prompt = f"""
                Task: {self.task}
                
                Current screen content:
                {text}
                
                What should be done based on this content?
                """
                
                response = self.model.generate(prompt)
                print(f"Agent's thoughts: {response}")
                
                # Sleep to prevent high CPU usage
                time.sleep(1)
                
            except KeyboardInterrupt:
                self.stop()
            except Exception as e:
                print(f"Error: {e}")
                time.sleep(1)
    
    def stop(self):
        """Stop the agent"""
        self.running = False

# Example usage:
if __name__ == "__main__":
    # Create an agent that takes notes
    agent = Agent("Take notes of important information you see on the screen and save them to notes.txt")
    agent.start()
