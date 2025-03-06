# Create a file called add_test_agent.py
import sqlite3

def add_test_agent():
    conn = sqlite3.connect('marketplace.db')
    cursor = conn.cursor()
    
    # Sample agent data
    test_agent = {
        "id": "sample_calculator",
        "name": "Calculator Agent",
        "description": "A simple agent that can perform basic calculations",
        "model_name": "llama2",
        "system_prompt": "You are a calculator assistant that helps perform math calculations.",
        "loop_interval_seconds": 5,
        "code": "// Agent code\nconsole.log('Calculator agent starting...');\n\nasync function runAgentStep() {\n  // Calculate something\n  return 'Calculation complete';\n}",
        "memory": ""
    }
    
    cursor.execute('''
    INSERT OR REPLACE INTO agents 
    (id, name, description, model_name, system_prompt, loop_interval_seconds, code, memory)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ''', (
        test_agent["id"], test_agent["name"], test_agent["description"], 
        test_agent["model_name"], test_agent["system_prompt"], 
        test_agent["loop_interval_seconds"], test_agent["code"], test_agent["memory"]
    ))
    
    conn.commit()
    conn.close()
    print("Test agent added to marketplace")

if __name__ == "__main__":
    add_test_agent()
