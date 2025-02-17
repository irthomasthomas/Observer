import time
import yaml
import os
import re
from datetime import datetime
from pathlib import Path

class BaseAgent:
    def __init__(self, agent_name, host="127.0.0.1", agent_model="deepseek-r1:7b"):
        # Get the base directory (project root)
        self.base_dir = Path(__file__).parent.parent
        self.agent_name = agent_name
        
        # Set up agent-specific paths
        self.agent_path = self.base_dir / "agents" / agent_name
        self.data_path = self.agent_path / "data"
        
        # Load configuration first to get model name
        self.config = self._load_config()
        
        # Use model name from config or fallback to parameter
        self.agent_model = self.config.get('model_name', agent_model)
        self.description = self.config.get('description', 'No description available')
        
        # Create data directory if it doesn't exist
        os.makedirs(self.data_path, exist_ok=True)
        
        # Initialize components
        from core.capture import Capture
        from core.model import Model
        self.capture = Capture()
        self.model = Model(model_name=self.agent_model, host=host)
        self.running = False
        
        # Set up logging
        log_file = self.data_path / f"log_{datetime.now().strftime('%Y%m%d')}.txt"
        self.log_file = open(log_file, 'a')

    def _load_config(self):
        """Load agent-specific configuration from YAML"""
        config_path = self.agent_path / "config.yaml"
        if not config_path.exists():
            raise FileNotFoundError(f"No config.yaml found in {self.agent_path}")
            
        with open(config_path, 'r') as f:
            return yaml.safe_load(f)

    def get_data_path(self, filename):
        """Get the full path for a data file in agent's data directory"""
        return self.data_path / filename

    def log(self, message):
        """Simple log to file with timestamp"""
        timestamp = datetime.now().strftime("%H:%M:%S")
        self.log_file.write(f"[{timestamp}] {message}\n")
        self.log_file.flush()

    def extract_commands(self, text):
        """Extract commands from text, handling markdown and formatting"""
        # Remove markdown formatting
        text = re.sub(r'\*\*(.+?)\*\*', r'\1', text)  # Remove bold
        text = re.sub(r'\*(.+?)\*', r'\1', text)      # Remove italic
        
        # Find lines containing command patterns
        commands = []
        for line in text.split('\n'):
            # Look for command pattern: COMMAND: param1|param2|...
            match = re.search(r'^([A-Z_]+):\s*(.+)$', line.strip())
            if match:
                command = match.group(1)
                params = [p.strip() for p in match.group(2).split('|')]
                commands.append((command, params))
                self.log(f"Found command: {command} with params: {params}")
        
        return commands

    def get_state_data(self):
        """Override this to provide state data for prompt"""
        return {}

    def start(self):
        """Start the observation loop"""
        self.running = True
        
        while self.running:
            try:
                screen_text = self.capture.get_text(self.capture.take_screenshot())
                
                # Get current state data and format prompt
                state_data = self.get_state_data()
                system_prompt = self.config['system_prompt'].format(**state_data)
                prompt = f"{system_prompt}\nCurrent screen content:\n{screen_text}"
                
                self.log("PROMPT with state:")
                self.log(prompt)
                
                response = self.model.generate(prompt)
                self.log("RESPONSE:")
                self.log(response)
                
                # Process commands
                commands = self.extract_commands(response)
                for command, params in commands:
                    self.process_command(f"{command}: {' | '.join(params)}")
                
                time.sleep(1)
                
            except KeyboardInterrupt:
                self.stop()
            except Exception as e:
                self.log(f"Error: {e}")
                time.sleep(1)

    def stop(self):
        """Stop the agent"""
        try:
            self.running = False
            
            # Close model connection if exists
            if hasattr(self, 'model'):
                try:
                    # Add any necessary cleanup for the model
                    self.model = None
                except Exception as e:
                    self.log(f"Error cleaning up model: {e}")
            
            # Close capture if exists
            if hasattr(self, 'capture'):
                try:
                    self.capture.sct.close()
                    self.capture = None
                except Exception as e:
                    self.log(f"Error cleaning up capture: {e}")
            
            # Call agent-specific cleanup if exists
            if hasattr(self, 'cleanup'):
                try:
                    self.cleanup()
                except Exception as e:
                    self.log(f"Error in cleanup: {e}")
            
            # Close log file
            if hasattr(self, 'log_file') and self.log_file:
                try:
                    if not self.log_file.closed:
                        self.log_file.flush()
                        self.log_file.close()
                except Exception as e:
                    print(f"Error closing log file: {e}")
                    
        except Exception as e:
            print(f"Error during agent stop: {e}")
            raise
        def process_command(self, line):
            """Should be implemented by specific agents"""
            raise NotImplementedError("Agents must implement process_command")


# import time
# import yaml
# import os
# import re
# from datetime import datetime
# from pathlib import Path
#
# class BaseAgent:
#     def __init__(self, agent_name, host="10.0.0.72"):
#         # Get the base directory (project root)
#         self.base_dir = Path(__file__).parent.parent
#         self.agent_name = agent_name
#
#         # Set up agent-specific paths
#         self.agent_path = self.base_dir / "agents" / agent_name
#         self.data_path = self.agent_path / "data"
#
#         # Create data directory if it doesn't exist
#         os.makedirs(self.data_path, exist_ok=True)
#
#         # Initialize components
#         from core.capture import Capture
#         from core.model import Model
#         self.capture = Capture()
#         self.model = Model(host=host)
#         self.running = False
#
#         # Load configuration
#         self.config = self._load_config()
#
#         # Set up logging
#         log_file = self.data_path / f"log_{datetime.now().strftime('%Y%m%d')}.txt"
#         self.log_file = open(log_file, 'a')
#
#     def _load_config(self):
#         """Load agent-specific configuration from YAML"""
#         config_path = self.agent_path / "config.yaml"
#         if not config_path.exists():
#             raise FileNotFoundError(f"No config.yaml found in {self.agent_path}")
#
#         with open(config_path, 'r') as f:
#             return yaml.safe_load(f)
#
#     def get_data_path(self, filename):
#         """Get the full path for a data file in agent's data directory"""
#         return self.data_path / filename
#
#     def log(self, message):
#         """Simple log to file with timestamp"""
#         timestamp = datetime.now().strftime("%H:%M:%S")
#         self.log_file.write(f"[{timestamp}] {message}\n")
#         self.log_file.flush()
#
#     def extract_commands(self, text):
#         """Extract commands from text, handling markdown and formatting"""
#         # Remove markdown formatting
#         text = re.sub(r'\*\*(.+?)\*\*', r'\1', text)  # Remove bold
#         text = re.sub(r'\*(.+?)\*', r'\1', text)      # Remove italic
#
#         # Find lines containing command patterns
#         commands = []
#         for line in text.split('\n'):
#             # Look for command pattern: COMMAND: param1|param2|...
#             match = re.search(r'^([A-Z_]+):\s*(.+)$', line.strip())
#             if match:
#                 command = match.group(1)
#                 params = [p.strip() for p in match.group(2).split('|')]
#                 commands.append((command, params))
#                 self.log(f"Found command: {command} with params: {params}")
#
#         return commands
#
#     def start(self):
#         """Start the observation loop"""
#         self.running = True
#
#         while self.running:
#             try:
#                 screen_text = self.capture.get_text(self.capture.take_screenshot())
#                 prompt = f"{self.config['system_prompt']}\nCurrent screen content:\n{screen_text}"
#
#                 self.log("PROMPT:")
#                 self.log(prompt)
#
#                 response = self.model.generate(prompt)
#                 self.log("RESPONSE:")
#                 self.log(response)
#
#                 # Process commands
#                 commands = self.extract_commands(response)
#                 for command, params in commands:
#                     self.process_command(f"{command}: {' | '.join(params)}")
#
#                 time.sleep(1)
#
#             except KeyboardInterrupt:
#                 self.stop()
#             except Exception as e:
#                 self.log(f"Error: {e}")
#                 time.sleep(1)
#
#     def stop(self):
#         """Stop the agent"""
#         self.running = False
#         if hasattr(self, 'cleanup'):
#             self.cleanup()
#         self.log_file.close()
#
#     def process_command(self, line):
#         """Should be implemented by specific agents"""
#         raise NotImplementedError("Agents must implement process_command")
