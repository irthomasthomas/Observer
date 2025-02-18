import './App.css'
import { useState, useEffect } from 'react';
import { RotateCw, Edit2, PlusCircle } from 'lucide-react';
import EditAgentModal from './EditAgentModal';
import LogViewer from './LogViewer';
import StartupDialogs from './StartupDialogs';
import TextBubble from './TextBubble';

import './styles/layout.css';
import './styles/header.css';
import './styles/agents.css';
import './styles/status.css';
import './styles/buttons.css';
import './styles/modal.css';
import './styles/dialog.css';
import './styles/text-bubble.css';

interface Agent {
  id: string;
  name: string;
  model: string;
  description: string;
  status: 'running' | 'stopped';
  config?: {
    name: string;
    description: string;
    model_name: string;
  };
}

export function App() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [serverAddress, setServerAddress] = useState('localhost:11434');
  const [serverStatus, setServerStatus] = useState<'unchecked' | 'online' | 'offline'>('unchecked');
  const [isStartingServer, setIsStartingServer] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isCreateMode, setIsCreateMode] = useState(false);
  const [showStartupDialog, setShowStartupDialog] = useState(false);
  const [showOllamaHelpBubble, setShowOllamaHelpBubble] = useState(false);

  const handleEditClick = (agentId: string) => {
    setSelectedAgent(agentId);
    setIsCreateMode(false);
    setIsEditModalOpen(true);
  };

  const handleAddAgentClick = () => {
    setSelectedAgent(null);
    setIsCreateMode(true);
    setIsEditModalOpen(true);
  };

  const handleDismissStartupDialog = () => {
    setShowStartupDialog(false);
  };

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
      
      await updateServerConfig(host, port);
      
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
        setShowOllamaHelpBubble(false);
      } else {
        setServerStatus('offline');
        setError('Ollama server is not running');
        setShowOllamaHelpBubble(true);
      }
    } catch (err) {
      setServerStatus('offline');
      setError('Failed to connect to Ollama server');
    }
  };

  const startOllamaServer = async () => {
    try {
      setIsStartingServer(true);
      setError('Starting Ollama server, please wait...');
      
      const response = await fetch('http://localhost:8000/config/start-ollama', {
        method: 'POST'
      });
      
      const data = await response.json();
      
      if (response.ok) {
        if (data.status === 'success') {
          setError(null);
          // Wait a bit longer before checking server status to allow Ollama to fully initialize
          setTimeout(checkOllamaServer, 3000);
        } else if (data.status === 'unknown') {
          // Server process started but couldn't be verified
          setError(`${data.message}. Attempting to connect anyway...`);
          setTimeout(checkOllamaServer, 3000);
        } else {
          // Other errors returned with 200 status
          setError(data.error || 'Failed to start Ollama server');
        }
      } else {
        const errorDetail = data.error || data.detail || 'Unknown error occurred';
        setError(`Server error: ${errorDetail}`);
        console.error('Server error response:', data);
      }
    } catch (err) {
      console.error('Error in startOllamaServer:', err);
      setError(`Failed to communicate with backend server: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      // Keep the starting state for a minimum time to avoid UI flashing
      setTimeout(() => {
        setIsStartingServer(false);
      }, 1000);
    }
  };

  const fetchAgentConfig = async (id: string) => {
    try {
      const response = await fetch(`http://localhost:8000/agents/${id}/config`);
      if (!response.ok) throw new Error('Failed to fetch agent config');
      return await response.json();
    } catch (err) {
      console.error('Error fetching agent config:', err);
      return null;
    }
  };

  const fetchAgents = async () => {
    try {
      setIsRefreshing(true);
      const response = await fetch('http://localhost:8000/agents');
      if (!response.ok) throw new Error(`Failed to fetch agents: ${response.status}`);
      const agentsData = await response.json();
      
      // Fetch config for each agent
      const agentsWithConfig = await Promise.all(
        agentsData.map(async (agent: Agent) => {
          const config = await fetchAgentConfig(agent.id);
          return { ...agent, config };
        })
      );
      
      setAgents(agentsWithConfig);
      setError(null);
    } catch (err) {
      setError('Failed to connect to backend');
      console.error('Error fetching agents:', err);
    } finally {
      setIsRefreshing(false);
    }
  };

  const toggleAgent = async (id: string, currentStatus: string) => {
    const action = currentStatus === 'running' ? 'stop' : 'start';
    
    try {
      setError(null);
      const response = await fetch(`http://localhost:8000/agents/${id}/${action}`, {
        method: 'POST'
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || `Failed to ${action} agent`);
      }
      
      await new Promise(resolve => setTimeout(resolve, 500));
      await fetchAgents();
      
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : `Failed to ${action} agent`;
      setError(errorMessage);
      console.error('Error toggling agent:', err);
      await fetchAgents();
    }
  };

  useEffect(() => {
    fetchAgents();
    checkOllamaServer();
    
    // Check if dialog should be shown on startup
    const showDialogOnStartup = localStorage.getItem('observerShowDialogOnStartup');
    const hasSeenDialog = localStorage.getItem('observerHasSeenStartupDialog');
    
    // Show dialog if user hasn't seen it yet or if they've chosen to show it on startup
    if (hasSeenDialog !== 'true' || showDialogOnStartup !== 'false') {
      setShowStartupDialog(true);
    }
    
    // Show the Ollama help bubble after a short delay if server is not connected
    setTimeout(() => {
      if (serverStatus !== 'online') {
        setShowOllamaHelpBubble(true);
      }
    }, 2000);
  }, []);

  return (
    <div className="container">
      {showStartupDialog && (
        <StartupDialogs 
          serverStatus={serverStatus}
          onDismiss={handleDismissStartupDialog} 
        />
      )}

      <header>
        <h1>Observer</h1>



        <div className="server-config">
          <div className="input-container">
            <input
              type="text"
              value={serverAddress}
              onChange={(e) => setServerAddress(e.target.value)}
              placeholder="localhost:11434"
              className="server-input"
            />
            {showOllamaHelpBubble && (
              <TextBubble 
                message="First, check Ollama server"
                position="bottom"
                duration={30000}
              />
            )}
          </div>
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
          <button
            onClick={handleAddAgentClick}
            className="add-agent-button"
            disabled={serverStatus !== 'online'}
            title={serverStatus !== 'online' ? 'Connect to Ollama server first' : 'Add new agent'}
          >
            <PlusCircle className="w-4 h-4" />
            <span>Add Agent</span>
          </button>
        </div>
      </header>

      {error && <div className="error">{error}</div>}

      <div className="agent-grid">
        {agents.map(agent => (
          <div key={agent.id} className="agent-card">
            <div className="flex items-center space-x-2">
              <h3 className="flex-grow">{agent.config?.name || agent.name}</h3>
              <button
                onClick={() => handleEditClick(agent.id)}
                className={`edit-button-small ${agent.status === 'running' ? 'disabled' : ''}`}
                disabled={agent.status === 'running'}
                title={agent.status === 'running' ? 'Stop agent to edit' : 'Edit agent'}
              >
                <Edit2 className="w-4 h-4" />
              </button>
            </div>
            
            <span className={`status ${agent.status}`}>
              {agent.status}
            </span>
            
            <div className="agent-details">
              <p className="model">Model: {agent.model}</p>
              <p className="description">{agent.config?.description || agent.description}</p>
            </div>
            
            <button
              onClick={() => toggleAgent(agent.id, agent.status)}
              className={`button ${agent.status}`}
            >
              {agent.status === 'running' ? '⏹ Stop' : '▶️ Start'}
            </button>

            <LogViewer agentId={agent.id} />
          </div>
        ))}
      </div>

      {isEditModalOpen && (
        <EditAgentModal
          agentId={selectedAgent}
          isOpen={isEditModalOpen}
          isCreateMode={isCreateMode}
          onClose={() => {
            setIsEditModalOpen(false);
            setSelectedAgent(null);
            setIsCreateMode(false);
          }}
          onUpdate={fetchAgents}
        />
      )}
    </div>
  );
}

export default App;
