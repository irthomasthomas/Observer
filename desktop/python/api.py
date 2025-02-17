from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import threading
import os
import importlib.util
from pathlib import Path
from datetime import datetime  # Add this import
from core.base_agent import BaseAgent
from pydantic import BaseModel
import json
from pathlib import Path
import requests
from typing import Optional
import yaml
import logging

class ServerAddress(BaseModel):
    host: str
    port: str

class GlobalConfig:
    ollama_host: str = "localhost"
    ollama_port: str = "11434"

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

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)


