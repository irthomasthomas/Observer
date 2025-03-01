# marketplace/app.py
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, List
import sqlite3
import datetime

app = FastAPI()

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize database
def init_db():
    conn = sqlite3.connect('marketplace.db')
    conn.execute('''
    CREATE TABLE IF NOT EXISTS agents (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        model_name TEXT NOT NULL,
        system_prompt TEXT,
        loop_interval_seconds REAL,
        code TEXT NOT NULL,
        memory TEXT
    )
    ''')
    conn.commit()
    conn.close()

init_db()

# Data model
class Agent(BaseModel):
    id: str
    name: str
    description: Optional[str] = ""
    model_name: str
    system_prompt: Optional[str] = ""
    loop_interval_seconds: float
    code: str
    memory: Optional[str] = ""

# Routes
@app.get("/agents")
async def list_agents():
    conn = sqlite3.connect('marketplace.db')
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM agents")
    agents = [dict(row) for row in cursor.fetchall()]
    conn.close()
    return agents

@app.get("/agents/{agent_id}")
async def get_agent(agent_id: str):
    conn = sqlite3.connect('marketplace.db')
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM agents WHERE id = ?", (agent_id,))
    agent = cursor.fetchone()
    conn.close()
    
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    
    return dict(agent)

@app.post("/agents")
async def create_agent(agent: Agent):
    conn = sqlite3.connect('marketplace.db')
    cursor = conn.cursor()
    
    cursor.execute('''
    INSERT OR REPLACE INTO agents 
    (id, name, description, model_name, system_prompt, loop_interval_seconds, code, memory)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ''', (
        agent.id, agent.name, agent.description, agent.model_name, 
        agent.system_prompt, agent.loop_interval_seconds, agent.code, agent.memory
    ))
    
    conn.commit()
    conn.close()
    
    return {"success": True}

# Run with: uvicorn app:app --reload
