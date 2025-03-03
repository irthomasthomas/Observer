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
    allow_origins=["app.observer-ai.com"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize database
def init_db():
    conn = sqlite3.connect('marketplace.db')
    cursor = conn.cursor()
    
    # Check if the table exists
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='agents'")
    if cursor.fetchone() is None:
        # Create the table with the new author fields
        cursor.execute('''
        CREATE TABLE agents (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            description TEXT,
            model_name TEXT NOT NULL,
            system_prompt TEXT,
            loop_interval_seconds REAL,
            code TEXT NOT NULL,
            memory TEXT,
            author TEXT,
            author_id TEXT,
            date_added TEXT
        )
        ''')
    else:
        # Check if we need to add the new columns
        cursor.execute("PRAGMA table_info(agents)")
        columns = [column[1] for column in cursor.fetchall()]
        
        if "author" not in columns:
            cursor.execute("ALTER TABLE agents ADD COLUMN author TEXT")
        
        if "author_id" not in columns:
            cursor.execute("ALTER TABLE agents ADD COLUMN author_id TEXT")
        
        if "date_added" not in columns:
            cursor.execute("ALTER TABLE agents ADD COLUMN date_added TEXT")
    
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
    author: Optional[str] = None
    author_id: Optional[str] = None
    date_added: Optional[str] = None

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
    
    # If date_added is not provided, set it to current time
    if not agent.date_added:
        agent.date_added = datetime.datetime.now().isoformat()
    
    # Insert or replace the agent with author information
    cursor.execute('''
    INSERT OR REPLACE INTO agents 
    (id, name, description, model_name, system_prompt, loop_interval_seconds, code, memory, author, author_id, date_added)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ''', (
        agent.id, agent.name, agent.description, agent.model_name, 
        agent.system_prompt, agent.loop_interval_seconds, agent.code, agent.memory,
        agent.author, agent.author_id, agent.date_added
    ))
    
    conn.commit()
    conn.close()
    
    return {"success": True}

# For stats and filtering
@app.get("/agents/statistics")
async def get_agent_statistics():
    conn = sqlite3.connect('marketplace.db')
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    
    # Count total agents
    cursor.execute("SELECT COUNT(*) as total FROM agents")
    total = cursor.fetchone()["total"]
    
    # Count unique authors
    cursor.execute("SELECT COUNT(DISTINCT author_id) as authors FROM agents WHERE author_id IS NOT NULL")
    authors = cursor.fetchone()["authors"]
    
    # Get popular models
    cursor.execute("""
    SELECT model_name, COUNT(*) as count 
    FROM agents 
    GROUP BY model_name 
    ORDER BY count DESC 
    LIMIT 5
    """)
    models = [dict(row) for row in cursor.fetchall()]
    
    conn.close()
    
    return {
        "total_agents": total,
        "unique_authors": authors,
        "popular_models": models
    }

@app.get("/agents/by-author/{author_id}")
async def get_agents_by_author(author_id: str):
    conn = sqlite3.connect('marketplace.db')
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM agents WHERE author_id = ?", (author_id,))
    agents = [dict(row) for row in cursor.fetchall()]
    conn.close()
    
    return agents

# Run with: uvicorn app:app --reload
