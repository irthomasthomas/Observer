import time
import yaml
import os
import re
import importlib.util
from datetime import datetime
from pathlib import Path
from core.commands import registry, command

class BaseAgent:
    def __init__(self, agent_name, host="127.0.0.1", agent_model="deepseek-r1:7b"):
        # Get the base directory (project root)
        self.base_dir = Path(__file__).parent.parent
        self.agent_name = agent_name
        
        # Set up agent-specific paths
        self.agent_path = self.base_dir / "agents" / agent_name
        self.data_path = self.agent_path / "data"
        
        # Create data directory if it doesn't exist
        os.makedirs(self.data_path, exist_ok=True)
        
        # Set up logging FIRST
        log_file = self.data_path / f"log_{datetime.now().strftime('%Y%m%d')}.txt"
        self.log_file = open(log_file, 'a')
        
        # Now load commands
        self.load_commands()
        self.log(f"Agent initialized with registry commands: {list(registry.commands.keys())}")
        
        # Load configuration to get model name
        self.config = self._load_config()
        
        # Use model name from config or fallback to parameter
        self.agent_model = self.config.get('model_name', agent_model)
        self.description = self.config.get('description', 'No description available')
        
        # Initialize components
        from core.capture import Capture
        from core.model import Model
        self.capture = Capture()
        self.model = Model(model_name=self.agent_model, host=host)
        self.running = False

    def _load_config(self):
        """Load agent-specific configuration from YAML"""
        config_path = self.agent_path / "config.yaml"
        if not config_path.exists():
            raise FileNotFoundError(f"No config.yaml found in {self.agent_path}")
            
        with open(config_path, 'r') as f:
            return yaml.safe_load(f)

    def log(self, message):
        """Enhanced log method with better formatting"""
        timestamp = datetime.now().strftime("%H:%M:%S")
        formatted_message = f"[{timestamp}] {message}"
        
        # Write to log file, ensuring each line of multi-line messages is properly timestamped
        if '\n' in message:
            # For multi-line messages, add timestamp to each line
            lines = message.split('\n')
            for line in lines:
                if line.strip():  # Only log non-empty lines
                    self.log_file.write(f"[{timestamp}] {line}\n")
        else:
            self.log_file.write(formatted_message + '\n')
        
        self.log_file.flush()

    def load_commands(self):
        """Load commands from commands.py"""
        commands_path = self.agent_path / "commands.py"
        self.log(f"Looking for commands in: {commands_path}")
        
        if commands_path.exists():
            try:
                self.log("Found commands.py, loading...")
                # Import commands module
                spec = importlib.util.spec_from_file_location(
                    "commands", commands_path
                )
                commands_module = importlib.util.module_from_spec(spec)
                spec.loader.exec_module(commands_module)
                
                self.log(f"Commands module loaded. Available commands: {list(registry.commands.keys())}")
            except Exception as e:
                self.log(f"Error loading commands: {e}")
                raise  # Re-raise to see full traceback
        else:
            self.log("No commands.py found")

    def process_command(self, line):
        """Process a command line"""
        if ':' not in line:
            return

        command, params = line.split(':', 1)
        command = command.strip()
        params = params.strip()

        self.log(f"Processing command: {command}")
        self.log(f"Current registry commands: {list(registry.commands.keys())}")

        if command in registry.commands:
            try:
                self.log(f"Executing {command} with params: {params}")
                registry.commands[command](self, params)
            except Exception as e:
                self.log(f"Error executing command {command}: {e}")
                raise  # Re-raise to see full traceback
        else:
            self.log(f"Unknown command: {command}")

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

    def start(self):
        """Start the observation loop"""
        self.running = True
        loop_interval = float(self.config.get('loop_interval_seconds', 1.0))
        
        while self.running:
            try:
                cycle_start_time = time.time()
                
                # Execute agent cycle
                screen_text = self.capture.get_text(self.capture.take_screenshot())
                state_data = self.get_state_data()
                system_prompt = self.config['system_prompt'].format(**state_data)
                prompt = f"{system_prompt}\nCurrent screen content:\n{screen_text}"
                
                self.log("=== BEGIN COT BLOCK ===")
                self.log("=== PROMPT ===")
                self.log(system_prompt)
                self.log("=== SCREEN CONTENT ===")
                self.log(screen_text)
                
                response = self.model.generate(prompt)
                self.log("=== RESPONSE ===")
                self.log(response)
                self.log("=== END COT BLOCK ===")
                
                # Process commands
                commands = self.extract_commands(response)
                for command, params in commands:
                    command_str = f"{command}: {' | '.join(params)}"
                    self.log(f"Executing command: {command_str}")
                    self.process_command(command_str)
                
                # Calculate sleep time based on execution duration
                execution_time = time.time() - cycle_start_time
                sleep_time = max(0, loop_interval - execution_time)
                
                if sleep_time > 0:
                    time.sleep(sleep_time)
                
            except KeyboardInterrupt:
                self.stop()
            except Exception as e:
                self.log(f"Error in observation loop: {str(e)}")
                # Still maintain timing on error
                execution_time = time.time() - cycle_start_time
                sleep_time = max(0, loop_interval - execution_time)
                if sleep_time > 0:
                    time.sleep(sleep_time)

    def stop(self):
        """Stop the agent"""
        try:
            self.running = False
            
            # Close model connection if exists
            if hasattr(self, 'model'):
                try:
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

    def get_state_data(self):
        """Override this to provide state data for prompt"""
        return {}
