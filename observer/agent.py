import time
from observer.capture import Capture
from observer.model import Model
from observer.tools import AgentTools
from datetime import datetime

class Agent:
    def __init__(self, task_description, host="10.0.0.72"):
        self.capture = Capture()
        self.model = Model(host=host)
        self.tools = AgentTools()
        self.task = task_description
        self.running = False
        
        # Open log file
        self.log_file = open(f"agent_log_{datetime.now().strftime('%Y%m%d')}.txt", 'a')
        
        self.system_prompt = f"""
You are an AI assistant that analyzes screen content and assists with: {task_description}
IMPORTANT: You must use tools with EXACT syntax - no markdown, no stars, no formatting:
NOTIFY: Title | Message    (Example: "NOTIFY: New Task | Check your calendar")
SEARCH: Query | Source     (Example: "SEARCH: Python tutorials | google")
CLIPBOARD: get | None      (Example: "CLIPBOARD: get | None")
CLIPBOARD: set | Content   (Example: "CLIPBOARD: set | Important meeting at 3pm")
Your response structure:
1. First analyze the screen content
2. Then decide if any actions are needed
3. Finally use tools with the exact syntax above - no other formatting allowed
Remember: Never use markdown or stars (**) around commands. Write them exactly as shown in the examples.
"""

    def log(self, message):
        """Simple log to file with timestamp"""
        timestamp = datetime.now().strftime("%H:%M:%S")
        self.log_file.write(f"[{timestamp}] {message}\n")
        self.log_file.flush()

    def process_command(self, line):
        """Execute a tool command"""
        try:
            if line.startswith("NOTIFY:"):
                parts = line[7:].split("|", 1)  
                if len(parts) == 2:
                    title, msg = parts
                    self.tools.notify(title.strip(), msg.strip())
            
            elif line.startswith("SEARCH:"):
                parts = line[7:].split("|", 1)
                query = parts[0].strip()
                source = parts[1].strip() if len(parts) > 1 else "google"
                self.tools.search(query, source)
            
            elif line.startswith("CLIPBOARD:"):
                parts = line[9:].split("|", 1)
                action = parts[0].strip()
                content = parts[1].strip() if len(parts) > 1 else ""
                self.tools.clipboard(action, content)
        except Exception as e:
            self.log(f"Error: {e}")

    def start(self):
        """Start the observation loop"""
        self.running = True
        
        while self.running:
            try:
                # Capture and analyze screen
                screen_text = self.capture.get_text(self.capture.take_screenshot())
                
                # Generate prompt and get response
                prompt = f"{self.system_prompt}\nCurrent screen content:\n{screen_text}"
                
                # Log the prompt
                self.log("PROMPT:")
                self.log(prompt)
                
                # Get and log response
                response = self.model.generate(prompt)
                self.log("RESPONSE:")
                self.log(response)
                
                # Process any tool commands in the response
                for line in response.split('\n'):
                    if any(line.startswith(cmd) for cmd in ["NOTIFY:", "SEARCH:", "CLIPBOARD:"]):
                        self.process_command(line)
                
                time.sleep(1)
                
            except KeyboardInterrupt:
                self.stop()
            except Exception as e:
                self.log(f"Error: {e}")
                time.sleep(1)

    def stop(self):
        """Stop the agent"""
        self.running = False
        self.tools.notify("Agent Stopping", "AI assistant has been stopped")
        self.tools.clipboard("set", "")
        self.log_file.close()
