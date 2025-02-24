import { useState, useEffect } from 'react';
import { checkOllamaServer } from './utils/ollamaServer';
import { RotateCw, Edit2, PlusCircle, Terminal, Clock } from 'lucide-react';

// Placeholder components that will be implemented later
const EditAgentModal = () => <div>Edit Agent Modal Placeholder</div>;
const LogViewer = ({ agentId }: { agentId: string }) => <div>Log Viewer for {agentId}</div>;
const StartupDialogs = ({ 
  serverStatus, 
  onDismiss 
}: { 
  serverStatus: string, 
  onDismiss: () => void 
}) => <div>Startup Dialogs Placeholder</div>;
const TextBubble = ({ 
  message, 
  position, 
  duration 
}: { 
  message: string, 
  position: string, 
  duration: number 
}) => <div>Text Bubble Placeholder</div>;
const GlobalLogsViewer = ({ 
  isOpen, 
  onClose 
}: { 
  isOpen: boolean, 
  onClose: () => void 
}) => <div>Global Logs Viewer Placeholder</div>;
const ScheduleAgentModal = ({ 
  agentId,
  isOpen,
  onClose,
  onUpdate
}: {
  agentId: string,
  isOpen: boolean,
  onClose: () => void,
  onUpdate: () => void
}) => <div>Schedule Agent Modal Placeholder</div>;

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
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isCreateMode, setIsCreateMode] = useState(false);
  const [showStartupDialog, setShowStartupDialog] = useState(false);
  const [showGlobalLogs, setShowGlobalLogs] = useState(false);
  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);
  const [schedulingAgentId, setSchedulingAgentId] = useState<string | null>(null);

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

  const handleScheduleClick = (agentId: string) => {
    setSchedulingAgentId(agentId);
    setIsScheduleModalOpen(true);
  };

  const handleDismissStartupDialog = () => {
    setShowStartupDialog(false);
  };

  const checkServerStatus = async () => {
    try {
      setServerStatus('unchecked');
      const [host, port] = serverAddress.split(':');
      const result = await checkOllamaServer(host, port);
      
      if (result.status === 'online') {
        setServerStatus('online');
        setError(null);
      } else {
        setServerStatus('offline');
        setError(result.error || 'Failed to connect to Ollama server');
      }
    } catch (err) {
      setServerStatus('offline');
      setError('Failed to connect to Ollama server');
    }
  };

  const fetchAgentConfig = async (id: string) => {
    try {
      const response = await fetch(`https://${serverAddress}/agents/${id}/config`);
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
      const response = await fetch(`https://${serverAddress}/agents`);
      if (!response.ok) throw new Error(`Failed to fetch agents: ${response.status}`);
      const agentsData = await response.json();
      
      const agentsWithConfig = await Promise.all(
        agentsData.map(async (agent: Agent) => {
          const config = await fetchAgentConfig(agent.id);
          return { ...agent, config };
        })
      );
      
      setAgents(agentsWithConfig);
      setError(null);
    } catch (err) {
      setError('Failed to connect to Observer API');
      console.error('Error fetching agents:', err);
    } finally {
      setIsRefreshing(false);
    }
  };

  const toggleAgent = async (id: string, currentStatus: string) => {
    const action = currentStatus === 'running' ? 'stop' : 'start';
    
    try {
      setError(null);
      const response = await fetch(`https://${serverAddress}/agents/${id}/${action}`, {
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
    checkServerStatus();
  }, []);

  return (
    <div className="min-h-screen bg-gray-50">
      {showStartupDialog && (
        <StartupDialogs 
          serverStatus={serverStatus}
          onDismiss={handleDismissStartupDialog} 
        />
      )}

      {/* Fixed Header */}
      <header className="fixed top-0 left-0 right-0 bg-white shadow-md z-50">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center space-x-4">
              <img src="/eye-logo-black.svg" alt="Observer Logo" className="h-8 w-8" />
              <h1 className="text-xl font-semibold">Observer Web</h1>
            </div>

            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2">
                <input
                  type="text"
                  value={serverAddress}
                  onChange={(e) => setServerAddress(e.target.value)}
                  placeholder="api.observer.local"
                  className="px-3 py-2 border rounded-md"
                />
                <button
                  onClick={checkServerStatus}
                  className={`px-4 py-2 rounded-md ${
                    serverStatus === 'online' 
                      ? 'bg-green-500 text-white' 
                      : serverStatus === 'offline'
                      ? 'bg-red-500 text-white'
                      : 'bg-gray-200'
                  }`}
                >
                  {serverStatus === 'online' ? '✓ Connected' : 
                   serverStatus === 'offline' ? '✗ Disconnected' : 
                   'Check Server'}
                </button>
              </div>

              <div className="flex items-center space-x-4">
                <button 
                  onClick={fetchAgents}
                  className="p-2 rounded-md hover:bg-gray-100"
                  disabled={isRefreshing}
                >
                  <RotateCw className={`h-5 w-5 ${isRefreshing ? 'animate-spin' : ''}`} />
                </button>
                <p className="text-sm">
                  Active: {agents.filter(a => a.status === 'running').length} / Total: {agents.length}
                </p>
                <button
                  onClick={handleAddAgentClick}
                  className="flex items-center space-x-2 px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600"
                  disabled={serverStatus !== 'online'}
                >
                  <PlusCircle className="h-5 w-5" />
                  <span>Add Agent</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 pt-24 pb-16">
        {error && (
          <div className="mb-4 p-4 bg-red-100 text-red-700 rounded-md">{error}</div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {agents.map(agent => (
            <div key={agent.id} className="bg-white rounded-lg shadow-md p-4">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold">{agent.config?.name || agent.name}</h3>
                <button
                  onClick={() => handleEditClick(agent.id)}
                  className={`p-2 rounded-md hover:bg-gray-100 ${
                    agent.status === 'running' ? 'opacity-50 cursor-not-allowed' : ''
                  }`}
                  disabled={agent.status === 'running'}
                >
                  <Edit2 className="h-5 w-5" />
                </button>
              </div>
              
              <span className={`inline-block px-2 py-1 rounded-full text-sm ${
                agent.status === 'running' 
                  ? 'bg-green-100 text-green-700' 
                  : 'bg-gray-100 text-gray-700'
              }`}>
                {agent.status}
              </span>
              
              <div className="mt-4">
                <p className="text-sm text-gray-600">Model: {agent.model}</p>
                <p className="mt-2 text-sm">{agent.config?.description || agent.description}</p>
              </div>
              
              <div className="mt-4 flex items-center space-x-4">
                <button
                  onClick={() => toggleAgent(agent.id, agent.status)}
                  className={`px-4 py-2 rounded-md ${
                    agent.status === 'running'
                      ? 'bg-red-500 text-white hover:bg-red-600'
                      : 'bg-green-500 text-white hover:bg-green-600'
                  }`}
                >
                  {agent.status === 'running' ? '⏹ Stop' : '▶️ Start'}
                </button>
                
                <button
                  onClick={() => handleScheduleClick(agent.id)}
                  className="p-2 rounded-md hover:bg-gray-100"
                  title="Schedule agent runs"
                >
                  <Clock className="h-5 w-5" />
                </button>
              </div>

              <LogViewer agentId={agent.id} />
            </div>
          ))}
        </div>
      </main>

      {isEditModalOpen && (
        <EditAgentModal />
      )}
      
      {isScheduleModalOpen && schedulingAgentId && (
        <ScheduleAgentModal
          agentId={schedulingAgentId}
          isOpen={isScheduleModalOpen}
          onClose={() => {
            setIsScheduleModalOpen(false);
            setSchedulingAgentId(null);
          }}
          onUpdate={fetchAgents}
        />
      )}

      <footer className="fixed bottom-0 left-0 right-0 bg-white border-t">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <button 
            className="flex items-center space-x-2 px-4 py-2 bg-gray-100 rounded-md hover:bg-gray-200"
            onClick={() => setShowGlobalLogs(!showGlobalLogs)}
          >
            <Terminal className="h-5 w-5" />
            <span>{showGlobalLogs ? 'Hide Server Logs' : 'Show Server Logs'}</span>
          </button>
        </div>
      </footer>
      
      {showGlobalLogs && (
        <GlobalLogsViewer 
          isOpen={showGlobalLogs}
          onClose={() => setShowGlobalLogs(false)}
        />
      )}
    </div>
  );
}

export default App;
