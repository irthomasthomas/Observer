from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, List
from auth import AuthUser
import sqlite3
import datetime
import logging

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)
logger = logging.getLogger('marketplace')

# Create router
marketplace_router = APIRouter()

# Database configuration
DB_PATH = "marketplace.db"

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
    downloads: Optional[int] = 0
    featured_order: Optional[int] = None

# Initialize database
def init_db():
    conn = sqlite3.connect(DB_PATH)
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
            date_added TEXT,
            downloads INTEGER DEFAULT 0,
            featured_order INTEGER
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

        if "downloads" not in columns:
            cursor.execute("ALTER TABLE agents ADD COLUMN downloads INTEGER DEFAULT 0")

        if "featured_order" not in columns:
            cursor.execute("ALTER TABLE agents ADD COLUMN featured_order INTEGER")
    
    conn.commit()
    conn.close()
    logger.info("Marketplace database initialized")

# Initialize the database at module load
init_db()

# Routes
@marketplace_router.get("/marketplace-status")
async def marketplace_root():
    return {"status": "Marketplace service is running"}

@marketplace_router.get("/agents")
async def list_agents():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    # Sort by: featured agents first, then by downloads, then by date
    cursor.execute("""
        SELECT * FROM agents
        ORDER BY
            CASE WHEN featured_order IS NULL THEN 1 ELSE 0 END,
            featured_order ASC,
            downloads DESC,
            date_added DESC
    """)
    agents = [dict(row) for row in cursor.fetchall()]
    conn.close()

    return agents

@marketplace_router.get("/agents/{agent_id}")
async def get_agent(agent_id: str):
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()

    # Check if agent exists
    cursor.execute("SELECT * FROM agents WHERE id = ?", (agent_id,))
    agent = cursor.fetchone()

    if not agent:
        conn.close()
        raise HTTPException(status_code=404, detail="Agent not found")

    # Increment download counter
    cursor.execute("UPDATE agents SET downloads = downloads + 1 WHERE id = ?", (agent_id,))
    conn.commit()
    conn.close()

    return dict(agent)

@marketplace_router.post("/agents")
async def create_agent(agent: Agent, user: AuthUser):
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    if not agent.date_added:
        agent.date_added = datetime.datetime.now().isoformat()

    agent.author_id = user.id

    # Find a unique agent_id by appending _2, _3, ... if the base id is taken
    candidate_id = agent.id
    counter = 2
    while True:
        cursor.execute("SELECT 1 FROM agents WHERE id = ?", (candidate_id,))
        if cursor.fetchone() is None:
            break
        candidate_id = f"{agent.id}_{counter}"
        counter += 1
    agent.id = candidate_id

    cursor.execute('''
    INSERT INTO agents
    (id, name, description, model_name, system_prompt, loop_interval_seconds, code, memory, author, author_id, date_added, downloads, featured_order)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ''', (
        agent.id, agent.name, agent.description, agent.model_name,
        agent.system_prompt, agent.loop_interval_seconds, agent.code, agent.memory,
        agent.author, agent.author_id, agent.date_added, agent.downloads, agent.featured_order
    ))

    conn.commit()
    conn.close()

    return {"success": True, "id": agent.id}

@marketplace_router.get("/agents/statistics")
async def get_agent_statistics():
    conn = sqlite3.connect(DB_PATH)
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

@marketplace_router.delete("/agents/{agent_id}")
async def delete_agent(agent_id: str, user: AuthUser):
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()

    cursor.execute("SELECT * FROM agents WHERE id = ?", (agent_id,))
    agent = cursor.fetchone()

    if not agent:
        conn.close()
        raise HTTPException(status_code=404, detail="Agent not found")

    if agent["author_id"] != user.id:
        conn.close()
        raise HTTPException(status_code=403, detail="You can only delete your own agents")

    cursor.execute("DELETE FROM agents WHERE id = ?", (agent_id,))
    conn.commit()
    conn.close()

    return {"success": True}

@marketplace_router.get("/agents/by-author/{author_id}")
async def get_agents_by_author(author_id: str):
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM agents WHERE author_id = ?", (author_id,))
    agents = [dict(row) for row in cursor.fetchall()]
    conn.close()
    
    return agents
