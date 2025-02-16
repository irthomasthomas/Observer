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
  const [serverAddress, setServerAddress] = useState('localhost:11434');
  const [serverStatus, setServerStatus] = useState<'unchecked' | 'online' | 'offline'>('unchecked');
  const [isStartingServer, setIsStartingServer] = useState(false);

  const checkOllamaServer = async () => {
    try {
      setServerStatus('unchecked');
      const [host, port] = serverAddress.split(':');
      const response = await fetch(`http://localhost:8000/config/check-server`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ host, port }),
      });
      
      const data = await response.json();
      if (data.status === 'online') {
        setServerStatus('online');
        setError(null);
      } else {
        setServerStatus('offline');
        setError('Ollama server is not running');
      }
    } catch (err) {
      setServerStatus('offline');
      setError('Failed to connect to Ollama server');
    }
  };

  const startOllamaServer = async () => {
    try {
      setIsStartingServer(true);
      const response = await fetch('http://localhost:8000/config/start-ollama', {
        method: 'POST'
      });
      
      if (response.ok) {
        setError(null);
        // Wait a moment for the server to start
        setTimeout(checkOllamaServer, 2000);
      } else {
        const data = await response.json();
        setError(data.error || 'Failed to start Ollama server');
      }
    } catch (err) {
      setError('Failed to start Ollama server');
    } finally {
      setIsStartingServer(false);
    }
  };

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
        <div className="server-config">
          <input
            type="text"
            value={serverAddress}
            onChange={(e) => setServerAddress(e.target.value)}
            placeholder="localhost:11434"
            className="server-input"
          />
          <button
            onClick={checkOllamaServer}
            className={`server-check-button ${serverStatus}`}
            disabled={isStartingServer}
          >
            {serverStatus === 'online' ? '✓ Connected' : 
             serverStatus === 'offline' ? '✗ Disconnected' : 
             'Check Ollama Server'}
          </button>
          <button
            onClick={startOllamaServer}
            className={`start-server-button ${isStartingServer ? 'starting' : ''}`}
            disabled={serverStatus === 'online' || isStartingServer}
          >
            {isStartingServer ? 'Starting...' : 'Start Ollama Server'}
          </button>
        </div>
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
