from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import threading
import os
import importlib.util
from pathlib import Path
from core.base_agent import BaseAgent
from pydantic import BaseModel
import json
from pathlib import Path
import requests
from typing import Optional
import yaml
import logging
from datetime import datetime, timedelta
import re



class ServerAddress(BaseModel):
    host: str
    port: str

class GlobalConfig:
    ollama_host: str = "localhost"
    ollama_port: str = "11434"

class AgentConfig(BaseModel):
    name: str
    description: str
    model_name: str
    system_prompt: str
    loop_interval_seconds: float = 1.0  

class CodeUpdate(BaseModel):
    code: str

class CreateAgentRequest(BaseModel):
    agent_id: str
    config: AgentConfig
    code: str
    commands: str

config = GlobalConfig()

# Configure logging
logging.basicConfig(
    level=logging.DEBUG,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:1420",
        "http://127.0.0.1:1420",
        "http://localhost:1430",
        "http://127.0.0.1:1430",
        "tauri://localhost"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"]
)

@app.post("/config/update-server")
async def update_server(address: ServerAddress):
    """Update global Ollama server address"""
    config.ollama_host = address.host
    config.ollama_port = address.port
    return {"status": "updated"}

@app.post("/config/check-server")
async def check_server(address: ServerAddress):
    """Check if Ollama server is accessible"""
    try:
        # Update the global config when checking
        config.ollama_host = address.host
        config.ollama_port = address.port
        
        response = requests.get(
            f"http://{address.host}:{address.port}/",
            timeout=5
        )
        if response.status_code == 200:
            return {"status": "online"}
        return {"status": "offline", "error": f"Server responded with status {response.status_code}"}
    except requests.exceptions.ConnectionError:
        return {"status": "offline", "error": "Could not connect to server"}
    except requests.exceptions.Timeout:
        return {"status": "offline", "error": "Connection timed out"}
    except Exception as e:
        logger.error(f"Error checking Ollama server: {e}")
        return {"status": "offline", "error": str(e)}


@app.middleware("http")
async def debug_cors(request, call_next):
    logger.debug(f"Incoming request from origin: {request.headers.get('origin')}")
    logger.debug(f"Request headers: {request.headers}")
    response = await call_next(request)
    logger.debug(f"Response headers: {response.headers}")
    return response

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "ok",
        "timestamp": datetime.now().isoformat(),
        "endpoints": ["/health", "/agents", "/agents/{agent_id}/start", "/agents/{agent_id}/stop"]
    }

# Store running agents and threads
running_agents = {}
agent_threads = {}


def discover_agents():
    """Scan the agents directory and return available agents"""
    agents_dir = Path(__file__).parent / "agents"
    available_agents = []
    
    for agent_dir in agents_dir.iterdir():
        if agent_dir.is_dir() and not agent_dir.name.startswith('__'):
            agent_id = agent_dir.name
            
            if (agent_dir / "agent.py").exists() and (agent_dir / "config.yaml").exists():
                try:
                    # Load config.yaml to get model_name and description
                    with open(agent_dir / "config.yaml", 'r') as f:
                        config = yaml.safe_load(f)
                    
                    spec = importlib.util.spec_from_file_location("module", agent_dir / "agent.py")
                    module = importlib.util.module_from_spec(spec)
                    spec.loader.exec_module(module)
                    
                    all_classes = [(name, cls) for name, cls in module.__dict__.items() 
                                 if isinstance(cls, type)]
                    agent_classes = [(name, cls) for name, cls in all_classes 
                                   if name.endswith('Agent')]
                    specific_agents = [(name, cls) for name, cls in agent_classes 
                                     if name != 'BaseAgent' and issubclass(cls, BaseAgent)]
                    
                    if specific_agents:
                        agent_name, agent_class = specific_agents[0]
                        available_agents.append({
                            "id": agent_id,
                            "name": agent_name,
                            "model": config.get('model_name', 'Not specified'),
                            "description": config.get('description', 'No description available'),
                            "status": "running" if agent_id in running_agents else "stopped"
                        })
                        
                except Exception as e:
                    logger.error(f"Error loading agent from {agent_id}: {e}")
    
    return available_agents

def run_agent(agent_id, agent):
    """Run agent in thread"""
    try:
        agent.start()
    except Exception as e:
        print(f"Agent error: {e}")
    finally:
        if agent_id in running_agents:
            del running_agents[agent_id]
        if agent_id in agent_threads:
            del agent_threads[agent_id]


@app.get("/agents")
async def get_agents():
    """List all available agents and their status"""
    logger.debug("Receiving request to /agents endpoint")
    try:
        agents = discover_agents()
        logger.debug(f"Found agents: {agents}")
        return agents
    except Exception as e:
        logger.error(f"Error discovering agents: {e}", exc_info=True)
        raise

@app.post("/agents/{agent_id}/start")
async def start_agent(agent_id: str):
    """Start an agent"""
    logger.debug(f"Attempting to start agent: {agent_id}")
    
    if agent_id in running_agents:
        logger.debug(f"Agent {agent_id} is already running")
        return {"error": "Already running"}
    
    # Find and load the agent class
    agent_path = Path(__file__).parent / "agents" / agent_id / "agent.py"
    if not agent_path.exists():
        logger.error(f"Agent path not found: {agent_path}")
        return {"error": "Agent not found"}
    try:
        # Import the agent module
        logger.debug(f"Loading module from {agent_path}")
        spec = importlib.util.spec_from_file_location("module", agent_path)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        
        # Find all classes in the module
        all_classes = [(name, cls) for name, cls in module.__dict__.items() 
                      if isinstance(cls, type)]
        logger.debug("Found classes in module:")
        for name, cls in all_classes:
            logger.debug(f"  {name}: {cls.__bases__}")
        
        # Get all classes that end with 'Agent'
        agent_classes = [(name, cls) for name, cls in all_classes 
                        if name.endswith('Agent')]
        logger.debug("\nFound agent classes:")
        for name, cls in agent_classes:
            logger.debug(f"  {name}: {cls.__bases__}")
        
        # Find the most specific agent class (one that inherits from BaseAgent)
        specific_agents = [(name, cls) for name, cls in agent_classes 
                          if name != 'BaseAgent' and issubclass(cls, BaseAgent)]
        
        logger.debug("\nFound specific agents:")
        for name, cls in specific_agents:
            logger.debug(f"  {name}: {cls.__bases__}")
        
        if not specific_agents:
            logger.error("No specific agent class found")
            return {"error": "Agent class not found"}
        
        # Take the first specific agent class
        agent_name, agent_class = specific_agents[0]
        logger.debug(f"\nSelected specific agent: {agent_name}")

         # Create and start the agent with the current config
        agent = agent_class(
            agent_model="deepseek-r1:8b", 
            host=config.ollama_host  # Use the stored host
        )
        running_agents[agent_id] = agent
        
        thread = threading.Thread(target=run_agent, args=(agent_id, agent))
        agent_threads[agent_id] = thread
        thread.start()
        
        logger.debug(f"Successfully started agent: {agent_id} ({agent_name})")
        return {"status": "started"}
        
    except Exception as e:
        logger.error(f"Error starting agent: {e}", exc_info=True)
        return {"error": f"Failed to start agent: {str(e)}"}       

@app.post("/agents/{agent_id}/stop")
async def stop_agent(agent_id: str):
    """Stop an agent"""
    logger.debug(f"Attempting to stop agent: {agent_id}")
    
    if agent_id not in running_agents:
        logger.warning(f"Agent {agent_id} not found in running agents")
        return {"error": "Not running"}
    
    try:
        agent = running_agents[agent_id]
        logger.debug(f"Found agent {agent_id}, attempting to stop")
        
        # Stop the agent
        agent.stop()
        logger.debug(f"Agent {agent_id} stop() called")
        
        # Get the thread
        thread = agent_threads.get(agent_id)
        if thread:
            logger.debug(f"Waiting for agent thread to finish")
            thread.join(timeout=2)  # Increased timeout
            
            if thread.is_alive():
                logger.warning(f"Agent thread didn't stop within timeout")
                # Could implement force stop here if needed
        
        # Clean up
        if agent_id in running_agents:
            del running_agents[agent_id]
        if agent_id in agent_threads:
            del agent_threads[agent_id]
            
        logger.debug(f"Agent {agent_id} successfully stopped and cleaned up")
        return {"status": "stopped"}
        
    except Exception as e:
        logger.error(f"Error stopping agent {agent_id}: {e}", exc_info=True)
        return {"error": f"Failed to stop agent: {str(e)}"}


@app.get("/agents/{agent_id}/config")
async def get_agent_config(agent_id: str):
    """Get agent configuration"""
    try:
        config_path = Path(__file__).parent / "agents" / agent_id / "config.yaml"
        if not config_path.exists():
            return {"error": "Agent configuration not found"}
            
        with open(config_path, 'r') as f:
            config = yaml.safe_load(f)
            
        return {
            "name": config.get("name", ""),
            "description": config.get("description", ""),
            "model_name": config.get("model_name", ""),
            "system_prompt": config.get("system_prompt", ""),
            "loop_interval_seconds": config.get("loop_interval_seconds", 1.0)  # Add with default
        }
    except Exception as e:
        logger.error(f"Error reading agent config: {e}")
        return {"error": f"Failed to read agent configuration: {str(e)}"}

@app.post("/agents/{agent_id}/config")
async def update_agent_config(agent_id: str, config: AgentConfig):
    """Update agent configuration"""
    try:
        # First check if agent is running
        if agent_id in running_agents:
            return {"error": "Cannot update configuration while agent is running"}
            
        config_path = Path(__file__).parent / "agents" / agent_id / "config.yaml"
        if not config_path.exists():
            return {"error": "Agent configuration not found"}
        
        # Validate loop interval
        if config.loop_interval_seconds < 0.1:
            return {"error": "Loop interval must be at least 0.1 seconds"}
            
        # Read existing config
        with open(config_path, 'r') as f:
            existing_config = yaml.safe_load(f)
            
        # Update config values
        existing_config["name"] = config.name
        existing_config["description"] = config.description
        existing_config["model_name"] = config.model_name
        existing_config["system_prompt"] = config.system_prompt
        existing_config["loop_interval_seconds"] = config.loop_interval_seconds
        
        # Write updated config
        with open(config_path, 'w') as f:
            yaml.dump(existing_config, f)
            
        return {"status": "updated"}
    except Exception as e:
        logger.error(f"Error updating agent config: {e}")
        return {"error": f"Failed to update agent configuration: {str(e)}"}


@app.get("/agents/{agent_id}/code")
async def get_agent_code(agent_id: str):
    """Get agent Python code"""
    try:
        code_path = Path(__file__).parent / "agents" / agent_id / "agent.py"
        if not code_path.exists():
            return {"error": "Agent code not found"}
            
        with open(code_path, 'r') as f:
            code = f.read()
            
        return {
            "code": code
        }
    except Exception as e:
        logger.error(f"Error reading agent code: {e}")
        return {"error": f"Failed to read agent code: {str(e)}"}

@app.post("/agents/{agent_id}/code")
async def update_agent_code(agent_id: str, code_update: CodeUpdate):
    """Update agent Python code"""
    try:
        # First check if agent is running
        if agent_id in running_agents:
            return {"error": "Cannot update code while agent is running"}
            
        code_path = Path(__file__).parent / "agents" / agent_id / "agent.py"
        if not code_path.exists():
            return {"error": "Agent code not found"}
            
        # Write the new code
        with open(code_path, 'w') as f:
            f.write(code_update.code)
            
        return {"status": "updated"}
    except Exception as e:
        logger.error(f"Error updating agent code: {e}")
        return {"error": f"Failed to update agent code: {str(e)}"}


@app.get("/agents/{agent_id}/logs")
async def get_agent_logs(agent_id: str, days: int = 1):
    """Get agent logs for the specified number of past days"""
    try:
        # Calculate the date range
        end_date = datetime.now()
        start_date = end_date - timedelta(days=days)
        
        # Get the agent's data directory
        agent_dir = Path(__file__).parent / "agents" / agent_id / "data"
        if not agent_dir.exists():
            return {"error": "Agent logs directory not found"}
            
        # Find all log files in the date range
        log_files = []
        for date in (start_date + timedelta(n) for n in range(days + 1)):
            log_file = agent_dir / f"log_{date.strftime('%Y%m%d')}.txt"
            if log_file.exists():
                log_files.append(log_file)
        
        # Read and parse logs
        logs = []
        current_cot = []
        current_timestamp = None
        recording_cot = False
        
        for log_file in log_files:
            with open(log_file, 'r') as f:
                for line in f:
                    # Parse timestamp and message
                    match = re.match(r'\[([\d:]+)\]\s*(.+)', line.strip())
                    if not match:
                        continue
                        
                    time, message = match.groups()
                    
                    # Handle CoT blocks
                    if "=== BEGIN COT BLOCK ===" in message:
                        recording_cot = True
                        current_cot = []
                        current_timestamp = time
                        continue
                    elif "=== END COT BLOCK ===" in message:
                        recording_cot = False
                        if current_cot:
                            logs.append({
                                'timestamp': current_timestamp,
                                'message': '\n'.join(current_cot),
                                'type': 'cot'
                            })
                        continue
                    
                    if recording_cot:
                        if "=== PROMPT ===" in message:
                            current_cot.append("PROMPT:")
                        elif "=== RESPONSE ===" in message:
                            current_cot.append("\nRESPONSE:")
                        elif "=== SCREEN CONTENT ===" in message:
                            current_cot.append("\nSCREEN CONTENT:")
                        else:
                            current_cot.append(message)
                    elif "Executing command:" in message:
                        logs.append({
                            'timestamp': time,
                            'message': message,
                            'type': 'action'
                        })
        
        return sorted(logs, key=lambda x: x['timestamp'], reverse=True)
        
    except Exception as e:
        logger.error(f"Error reading agent logs: {e}")
        return {"error": f"Failed to read agent logs: {str(e)}"}

@app.get("/agents/{agent_id}/commands")
async def get_agent_commands(agent_id: str):
    """Get agent commands"""
    try:
        commands_path = Path(__file__).parent / "agents" / agent_id / "commands.py"
        if not commands_path.exists():
            return {"commands": ""}
            
        with open(commands_path, 'r') as f:
            commands = f.read()
            
        return {"commands": commands}
    except Exception as e:
        logger.error(f"Error reading agent commands: {e}")
        return {"error": f"Failed to read agent commands: {str(e)}"}

@app.post("/agents/{agent_id}/commands")
async def update_agent_commands(agent_id: str, commands: dict):
    """Update agent commands"""
    try:
        # First check if agent is running
        if agent_id in running_agents:
            return {"error": "Cannot update commands while agent is running"}
            
        commands_path = Path(__file__).parent / "agents" / agent_id / "commands.py"
            
        # Write the new commands
        with open(commands_path, 'w') as f:
            f.write(commands["commands"])
            
        return {"status": "updated"}
    except Exception as e:
        logger.error(f"Error updating agent commands: {e}")
        return {"error": f"Failed to update agent commands: {str(e)}"}

@app.post("/agents/create")
async def create_agent(request: CreateAgentRequest):
    """Create a new agent with the provided configuration"""
    try:
        # Validate agent_id format
        if not request.agent_id or not request.agent_id.replace('_', '').isalnum():
            return {"error": "Invalid agent ID. Use only letters, numbers, and underscores."}
            
        # Create agent directory path
        agents_dir = Path(__file__).parent / "agents"
        agent_dir = agents_dir / request.agent_id
        
        # Check if agent already exists
        if agent_dir.exists():
            return {"error": f"Agent with ID '{request.agent_id}' already exists"}
            
        # Create agent directory
        os.makedirs(agent_dir, exist_ok=True)
        
        # Create data subdirectory
        data_dir = agent_dir / "data"
        os.makedirs(data_dir, exist_ok=True)
        
        # Create config.yaml file
        config_path = agent_dir / "config.yaml"
        with open(config_path, 'w') as f:
            yaml.dump({
                "name": request.config.name,
                "description": request.config.description,
                "model_name": request.config.model_name,
                "system_prompt": request.config.system_prompt
            }, f)
            
        # Create agent.py file
        agent_path = agent_dir / "agent.py"
        with open(agent_path, 'w') as f:
            f.write(request.code)
            
        # Create commands.py file
        commands_path = agent_dir / "commands.py"
        with open(commands_path, 'w') as f:
            f.write(request.commands)
            
        logger.info(f"Successfully created new agent: {request.agent_id}")
        return {"status": "created", "agent_id": request.agent_id}
        
    except Exception as e:
        logger.error(f"Error creating agent: {e}", exc_info=True)
        # Clean up any partial files if an error occurred
        if 'agent_dir' in locals() and agent_dir.exists():
            try:
                import shutil
                shutil.rmtree(agent_dir)
            except Exception as cleanup_error:
                logger.error(f"Error cleaning up after failed agent creation: {cleanup_error}")
                
        raise HTTPException(status_code=500, detail=f"Failed to create agent: {str(e)}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)


