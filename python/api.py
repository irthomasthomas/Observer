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

import logging

class ServerAddress(BaseModel):
    host: str
    port: str



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


@app.post("/config/check-server")
async def check_server(address: ServerAddress):
    """Check if Ollama server is accessible"""
    try:
        response = requests.get(
            f"http://{address.host}:{address.port}/",  # Changed to root endpoint
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
                            "status": "running" if agent_id in running_agents else "stopped"
                        })
                        
                except Exception as e:
                    logger.error(f"Error loading agent from {agent_id}: {e}")
    
    return available_agents


# def discover_agents():
#     """Scan the agents directory and return available agents"""
#     agents_dir = Path(__file__).parent / "agents"
#     available_agents = []
#
#     logger.debug(f"Scanning agents directory: {agents_dir}")
#
#     # Skip __pycache__ and __init__.py
#     for agent_dir in agents_dir.iterdir():
#         if agent_dir.is_dir() and not agent_dir.name.startswith('__'):
#             agent_id = agent_dir.name
#             logger.debug(f"\nProcessing directory: {agent_id}")
#
#             # Check for agent.py and config.yaml
#             agent_file = agent_dir / "agent.py"
#             config_file = agent_dir / "config.yaml"
#
#             logger.debug(f"Checking files:")
#             logger.debug(f"  agent.py exists: {agent_file.exists()}")
#             logger.debug(f"  config.yaml exists: {config_file.exists()}")
#
#             if agent_file.exists() and config_file.exists():
#                 try:
#                     # Try to load agent class name from the module
#                     logger.debug(f"Loading module from {agent_file}")
#                     spec = importlib.util.spec_from_file_location("module", agent_file)
#                     module = importlib.util.module_from_spec(spec)
#                     spec.loader.exec_module(module)
#
#                     # Log all classes in the module
#                     all_classes = [(name, cls) for name, cls in module.__dict__.items() 
#                                  if isinstance(cls, type)]
#                     logger.debug("Found classes in module:")
#                     for name, cls in all_classes:
#                         logger.debug(f"  {name}: {cls.__bases__}")
#
#                     agent_classes = [(name, cls) for name, cls in all_classes 
#                                    if name.endswith('Agent')]
#                     logger.debug("\nFound agent classes:")
#                     for name, cls in agent_classes:
#                         logger.debug(f"  {name}: {cls.__bases__}")
#
#                     specific_agents = [(name, cls) for name, cls in agent_classes 
#                                      if name != 'BaseAgent' and issubclass(cls, BaseAgent)]
#
#                     logger.debug("\nFound specific agents:")
#                     for name, cls in specific_agents:
#                         logger.debug(f"  {name}: {cls.__bases__}")
#
#                     if specific_agents:
#                         # Take the first specific agent class
#                         agent_name, agent_class = specific_agents[0]
#                         logger.debug(f"\nSelected specific agent: {agent_name}")
#
#                         available_agents.append({
#                             "id": agent_id,
#                             "name": agent_name,
#                             "status": "running" if agent_id in running_agents else "stopped"
#                         })
#                     else:
#                         logger.debug("No specific agent class found")
#
#                 except Exception as e:
#                     logger.error(f"Error loading agent module: {e}", exc_info=True)
#
#     logger.debug(f"\nFinal available agents: {available_agents}")
#     return available_agents

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
        
        # Create and start the agent
        agent = agent_class(agent_model="deepseek-r1:8b", host="10.0.0.72")
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
    if agent_id not in running_agents:
        return {"error": "Not running"}
    
    agent = running_agents[agent_id]
    agent.stop()
    
    if agent_id in agent_threads:
        agent_threads[agent_id].join(timeout=1)  # Wait up to 1 second
    
    return {"status": "stopped"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)


