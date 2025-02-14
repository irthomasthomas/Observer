from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import threading
import os
import importlib.util
from pathlib import Path
from datetime import datetime  # Add this import

import logging

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
    
    # Skip __pycache__ and __init__.py
    for agent_dir in agents_dir.iterdir():
        if agent_dir.is_dir() and not agent_dir.name.startswith('__'):
            agent_id = agent_dir.name
            
            # Check for agent.py and config.yaml
            if (agent_dir / "agent.py").exists() and (agent_dir / "config.yaml").exists():
                # Try to load agent class name from the module
                spec = importlib.util.spec_from_file_location("module", agent_dir / "agent.py")
                module = importlib.util.module_from_spec(spec)
                spec.loader.exec_module(module)
                
                # Get the first class that ends with 'Agent'
                agent_class = next((cls for name, cls in module.__dict__.items() 
                                  if name.endswith('Agent') and isinstance(cls, type)), None)
                
                if agent_class:
                    available_agents.append({
                        "id": agent_id,
                        "name": agent_class.__name__,
                        "status": "running" if agent_id in running_agents else "stopped"
                    })
    
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
    if agent_id in running_agents:
        return {"error": "Already running"}
    
    # Find and load the agent class
    agent_path = Path(__file__).parent / "agents" / agent_id / "agent.py"
    if not agent_path.exists():
        return {"error": "Agent not found"}
    
    # Import the agent module
    spec = importlib.util.spec_from_file_location("module", agent_path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    
    # Get the agent class (first class that ends with 'Agent')
    agent_class = next((cls for name, cls in module.__dict__.items() 
                       if name.endswith('Agent') and isinstance(cls, type)), None)
    
    if not agent_class:
        return {"error": "Agent class not found"}
    
    # Create and start the agent
    agent = agent_class(agent_model="deepseek-r1:8b", host="10.0.0.72")
    running_agents[agent_id] = agent
    
    thread = threading.Thread(target=run_agent, args=(agent_id, agent))
    agent_threads[agent_id] = thread
    thread.start()
    
    return {"status": "started"}

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


