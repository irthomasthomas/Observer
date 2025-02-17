import { useState, useEffect } from 'react'
import './App.css'
import { RotateCw } from 'lucide-react'

interface Agent {
  id: string;
  name: string;
  model: string;
  description: string;
  status: 'running' | 'stopped';
}

function App() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [serverAddress, setServerAddress] = useState('localhost:11434');
  const [serverStatus, setServerStatus] = useState<'unchecked' | 'online' | 'offline'>('unchecked');
  const [isStartingServer, setIsStartingServer] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const updateServerConfig = async (host: string, port: string) => {
    try {
      const response = await fetch(`http://localhost:8000/config/update-server`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ host, port }),
      });
      
      if (!response.ok) {
        throw new Error('Failed to update server config');
      }
    } catch (err) {
      console.error('Error updating server config:', err);
    }
  };

  const checkOllamaServer = async () => {
    try {
      setServerStatus('unchecked');
      const [host, port] = serverAddress.split(':');
      
      // First update the server config
      await updateServerConfig(host, port);
      
      // Then check the server
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
      setIsRefreshing(true);
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
    } finally {
      setIsRefreshing(false);
    }
  };

  const toggleAgent = async (id: string, currentStatus: string) => {
    const action = currentStatus === 'running' ? 'stop' : 'start';
    
    try {
      setError(null); // Clear any existing errors
      
      const response = await fetch(`http://localhost:8000/agents/${id}/${action}`, {
        method: 'POST'
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || `Failed to ${action} agent`);
      }
      
      // Wait a short moment before refreshing the agent list
      await new Promise(resolve => setTimeout(resolve, 500));
      await fetchAgents();
      
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : `Failed to ${action} agent`;
      setError(errorMessage);
      console.error('Error toggling agent:', err);
      
      // Refresh the agent list anyway to ensure UI is in sync
      await fetchAgents();
    }
  };



  useEffect(() => {
    fetchAgents();
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
        <div className="stats-container">
          <button 
            onClick={fetchAgents}
            className={`refresh-button ${isRefreshing ? 'refreshing' : ''}`}
            disabled={isRefreshing}
          >
            <RotateCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          </button>
          <p>Active Agents: {agents.filter(a => a.status === 'running').length} / Total: {agents.length}</p>
        </div>
      </header>

      {error && <div className="error">{error}</div>}

      <div className="agent-grid">
        {agents.map(agent => (
          <div key={agent.id} className="agent-card">
            <h3>{agent.name}</h3>
            <span className={`status ${agent.status}`}>
              {agent.status}
            </span>
            <div className="agent-details">
              <p className="model">Model: {agent.model}</p>
              <p className="description">{agent.description}</p>
            </div>
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
