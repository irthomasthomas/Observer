import io
import json
import os
import platform
import re
import subprocess
import sys
import threading
import time
import traceback
from collections import deque
from datetime import datetime, timedelta
from pathlib import Path
from typing import List, Optional, Tuple

import importlib.util
import psutil
import requests
import yaml

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from core.base_agent import BaseAgent
from api_helper import (
    discover_agents, 
    run_agent, 
    is_ollama_running,
    load_schedules,
    save_schedules,
    schedule_agent_job,
    initialize_schedules
)

"""
Helper functions to be imported for the FAST API api.py
"""


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

def is_ollama_running() -> Tuple[bool, str]:
    """
    Checks if Ollama server is already running.
    
    Returns:
        Tuple containing:
        - Boolean indicating if Ollama is running
        - Process ID as string if running, empty string if not
    """
    # Method 1: Check if the process is running
    for proc in psutil.process_iter(['pid', 'name']):
        try:
            if 'ollama' in proc.info['name'].lower():
                return True, str(proc.info['pid'])
        except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.ZombieProcess):
            continue
    
    # Method 2: Try to connect to the default Ollama endpoint
    try:
        response = requests.get("http://localhost:11434/api/tags", timeout=1)
        if response.status_code == 200:
            return True, "unknown"  # Running but couldn't find the process
    except requests.RequestException:
        pass
        
    return False, ""

# Load existing schedules on startup
def load_schedules():
    """Load schedules from JSON file"""
    try:
        with open(SCHEDULES_FILE, 'r') as f:
            return json.load(f)
    except (json.JSONDecodeError, FileNotFoundError):
        return []

# Save schedules to file
def save_schedules(schedules):
    """Save schedules to JSON file"""
    with open(SCHEDULES_FILE, 'w') as f:
        json.dump(schedules, f, indent=2)

# Schedule agent to run
def schedule_agent_job(schedule_id, agent_id, cron_expression):
    """Schedule an agent to run according to cron expression"""
    logger.info(f"Scheduling agent {agent_id} with cron: {cron_expression}")
    
    def run_scheduled_agent():
        """Function to run when the schedule triggers"""
        logger.info(f"Running scheduled agent {agent_id} (schedule: {schedule_id})")
        # We'll reuse the start_agent logic but need to handle the case
        # where the agent is already running
        if agent_id in running_agents:
            logger.warning(f"Scheduled agent {agent_id} is already running")
            return
            
        try:
            # Find and load the agent class (simplified - using existing start_agent logic)
            agent_path = Path(__file__).parent / "agents" / agent_id / "agent.py"
            if not agent_path.exists():
                logger.error(f"Scheduled agent path not found: {agent_path}")
                return
                
            spec = importlib.util.spec_from_file_location("module", agent_path)
            module = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(module)
            
            agent_classes = [(name, cls) for name, cls in module.__dict__.items() 
                          if name.endswith('Agent') and name != 'BaseAgent' and issubclass(cls, BaseAgent)]
            
            if not agent_classes:
                logger.error(f"No agent class found for scheduled run: {agent_id}")
                return
            
            agent_name, agent_class = agent_classes[0]
            
            # Create and start the agent
            agent = agent_class(
                agent_model="deepseek-r1:8b", 
                host=config.ollama_host
            )
            running_agents[agent_id] = agent
            
            thread = threading.Thread(target=run_agent, args=(agent_id, agent))
            agent_threads[agent_id] = thread
            thread.start()
            
            logger.info(f"Successfully started scheduled agent: {agent_id}")
        except Exception as e:
            logger.error(f"Error starting scheduled agent: {e}", exc_info=True)
    
    # Add the job to the scheduler
    job = scheduler.add_job(
        run_scheduled_agent,
        CronTrigger.from_crontab(cron_expression),
        id=schedule_id,
        replace_existing=True
    )
    
    return job

# Initialize schedules from file on startup
def initialize_schedules():
    """Initialize all schedules from the schedules file"""
    logger.info("Initializing schedules from file")
    schedules = load_schedules()
    
    for schedule in schedules:
        try:
            schedule_agent_job(
                schedule['id'],
                schedule['agent_id'],
                schedule['cron_expression']
            )
            logger.info(f"Restored schedule: {schedule['id']} for agent: {schedule['agent_id']}")
        except Exception as e:
            logger.error(f"Failed to restore schedule {schedule['id']}: {e}")

