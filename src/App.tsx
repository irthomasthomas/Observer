import { useState, useEffect } from 'react'
import './App.css'

interface Agent {
  id: string;
  name: string;
  status: 'running' | 'stopped';
}

function App() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [error, setError] = useState<string | null>(null);


  const fetchAgents = async () => {
    try {
      console.log('Attempting to fetch agents...');
      const response = await fetch('http://localhost:8000/agents');
      console.log('Response status:', response.status);
      if (!response.ok) throw new Error(`Failed to fetch agents: ${response.status}`);
      const data = await response.json();
      console.log('Received data:', data);
      setAgents(data);
      setError(null);
    } catch (err) {
      setError('Failed to connect to backend');
      console.error('Error fetching agents:', err);
      // Log the specific error type and message
      if (err instanceof Error) {
        console.error('Error type:', err.name);
        console.error('Error message:', err.message);
      }
    }
  };


  const toggleAgent = async (id: string, currentStatus: string) => {
    try {
      const action = currentStatus === 'running' ? 'stop' : 'start';
      const response = await fetch(`http://localhost:8000/agents/${id}/${action}`, {
        method: 'POST'
      });
      
      if (!response.ok) throw new Error(`Failed to ${action} agent`);
      await fetchAgents();
    } catch (err) {
      setError(`Failed to ${currentStatus === 'running' ? 'stop' : 'start'} agent`);
      console.error('Error toggling agent:', err);
    }
  };

  useEffect(() => {
    fetchAgents();
    const interval = setInterval(fetchAgents, 2000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="container">
      <header>
        <h1>Observer</h1>
        <p>Active Agents: {agents.filter(a => a.status === 'running').length} / Total: {agents.length}</p>
      </header>

      {error && <div className="error">{error}</div>}

      <div className="agent-grid">
        {agents.map(agent => (
          <div key={agent.id} className="agent-card">
            <h3>{agent.name}</h3>
            <span className={`status ${agent.status}`}>
              {agent.status}
            </span>
            <p>ID: {agent.id}</p>
            <button
              onClick={() => toggleAgent(agent.id, agent.status)}
              className={`button ${agent.status}`}
            >
              {agent.status === 'running' ? '⏹ Stop' : '▶️ Start'}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

export default App;
