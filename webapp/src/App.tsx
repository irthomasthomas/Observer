import { useState, useEffect } from 'react';
import { checkOllamaServer } from './utils/ollamaServer';
import { 
  listAgents, 
  saveAgent, 
  updateAgentStatus, 
  getAgent,
  getAgentCode,
  deleteAgent,
  CompleteAgent 
} from './utils/agent_database';
import { RotateCw, Edit2, PlusCircle, Terminal, Clock } from 'lucide-react';

// EditAgentModal component with unified CompleteAgent type
const EditAgentModal = ({ 
  isOpen, 
  onClose, 
  createMode, 
  agent, 
  code: existingCode,
  onSave 
}: { 
  isOpen: boolean, 
  onClose: () => void, 
  createMode: boolean, 
  agent?: CompleteAgent, 
  code?: string,
  onSave: (agent: CompleteAgent, code: string) => void 
}) => {
  const [agentId, setAgentId] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [model, setModel] = useState('deepseek-r1:8b');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [code, setCode] = useState('console.log("Hello, I am an agent");');
  const [loopInterval, setLoopInterval] = useState(1.0);

  useEffect(() => {
    if (agent) {
      setAgentId(agent.id);
      setName(agent.name);
      setDescription(agent.description);
      setModel(agent.model_name);
      setSystemPrompt(agent.system_prompt);
      setLoopInterval(agent.loop_interval_seconds);
    }
    
    if (existingCode) {
      setCode(existingCode);
    }
  }, [agent, existingCode]);

  const handleSave = () => {
    const completeAgent: CompleteAgent = {
      id: agentId,
      name: name,
      description: description,
      status: agent?.status || 'stopped',
      model_name: model,
      system_prompt: systemPrompt,
      loop_interval_seconds: loopInterval
    };
    
    onSave(completeAgent, code);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white p-6 rounded-lg w-2/3 max-h-[80vh] overflow-y-auto">
        <h2 className="text-xl font-bold mb-4">{createMode ? 'Create Agent' : 'Edit Agent'}</h2>
        
        {createMode && (
          <div className="mb-4">
            <label className="block mb-1">Agent ID</label>
            <input 
              type="text" 
              value={agentId} 
              onChange={(e) => setAgentId(e.target.value)} 
              className="w-full p-2 border rounded"
              placeholder="agent_id"
            />
            <p className="text-sm text-gray-500">Use only letters, numbers, and underscores</p>
          </div>
        )}
        
        <div className="mb-4">
          <label className="block mb-1">Name</label>
          <input 
            type="text" 
            value={name} 
            onChange={(e) => setName(e.target.value)} 
            className="w-full p-2 border rounded"
          />
        </div>
        
        <div className="mb-4">
          <label className="block mb-1">Description</label>
          <textarea 
            value={description} 
            onChange={(e) => setDescription(e.target.value)} 
            className="w-full p-2 border rounded"
            rows={2}
          />
        </div>
        
        <div className="mb-4">
          <label className="block mb-1">Model</label>
          <input 
            type="text" 
            value={model} 
            onChange={(e) => setModel(e.target.value)} 
            className="w-full p-2 border rounded"
          />
        </div>
        
        <div className="mb-4">
          <label className="block mb-1">System Prompt</label>
          <textarea 
            value={systemPrompt} 
            onChange={(e) => setSystemPrompt(e.target.value)} 
            className="w-full p-2 border rounded"
            rows={4}
          />
        </div>
        
        <div className="mb-4">
          <label className="block mb-1">Code</label>
          <textarea 
            value={code} 
            onChange={(e) => setCode(e.target.value)} 
            className="w-full p-2 border rounded font-mono"
            rows={10}
          />
        </div>
        
        <div className="flex justify-end space-x-4">
          <button 
            onClick={onClose}
            className="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300"
          >
            Cancel
          </button>
          <button 
            onClick={handleSave}
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
};

// Simple placeholder components
const LogViewer = ({ agentId }: { agentId: string }) => <div>Log Viewer for {agentId}</div>;
const StartupDialogs = ({ serverStatus, onDismiss }: { serverStatus: string, onDismiss: () => void }) => <div>Startup Dialogs Placeholder</div>;
const GlobalLogsViewer = ({ isOpen, onClose }: { isOpen: boolean, onClose: () => void }) => <div>Global Logs Viewer Placeholder</div>;
const ScheduleAgentModal = ({ agentId, isOpen, onClose, onUpdate }: { agentId: string, isOpen: boolean, onClose: () => void, onUpdate: () => void }) => <div>Schedule Agent Modal Placeholder</div>;

export function App() {
  const [agents, setAgents] = useState<CompleteAgent[]>([]);
  const [agentCodes, setAgentCodes] = useState<Record<string, string>>({});
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

  // Handle edit button click
  const handleEditClick = async (agentId: string) => {
    setSelectedAgent(agentId);
    setIsCreateMode(false);
    setIsEditModalOpen(true);
  };

  // Handle add agent button click
  const handleAddAgentClick = () => {
    setSelectedAgent(null);
    setIsCreateMode(true);
    setIsEditModalOpen(true);
  };

  // Handle schedule button click
  const handleScheduleClick = (agentId: string) => {
    setSchedulingAgentId(agentId);
    setIsScheduleModalOpen(true);
  };

  // Handle startup dialog dismiss
  const handleDismissStartupDialog = () => {
    setShowStartupDialog(false);
  };

  // Check Ollama server status
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

  // Fetch all agents
  const fetchAgents = async () => {
    try {
      setIsRefreshing(true);
      const agentsData = await listAgents();
      setAgents(agentsData);
      
      // Fetch code for all agents
      const agentCodePromises = agentsData.map(async agent => {
        const code = await getAgentCode(agent.id);
        return { 
          id: agent.id, 
          code 
        };
      });
      
      const agentCodeResults = await Promise.all(agentCodePromises);
      const newCodes: Record<string, string> = {};
      
      agentCodeResults.forEach(result => {
        if (result.code) {
          newCodes[result.id] = result.code;
        }
      });
      
      setAgentCodes(newCodes);
      setError(null);
    } catch (err) {
      setError('Failed to fetch agents from database');
      console.error('Error fetching agents:', err);
    } finally {
      setIsRefreshing(false);
    }
  };

  // Toggle agent running status
  const toggleAgent = async (id: string, currentStatus: string) => {
    try {
      setError(null);
      const newStatus = currentStatus === 'running' ? 'stopped' : 'running';
      await updateAgentStatus(id, newStatus as 'running' | 'stopped');
      await fetchAgents();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to toggle agent status');
      console.error('Error toggling agent:', err);
    }
  };

  // Save agent (create or update)
  const handleSaveAgent = async (agent: CompleteAgent, code: string) => {
    try {
      setError(null);
      await saveAgent(agent, code);
      await fetchAgents();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save agent');
      console.error('Error saving agent:', err);
    }
  };

  // Initial data load
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
                <h3 className="text-lg font-semibold">{agent.name}</h3>
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
                <p className="text-sm text-gray-600">
                  Model: {agent.model_name}
                </p>
                <p className="mt-2 text-sm">{agent.description}</p>
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

      {/* Edit Modal */}
      {isEditModalOpen && (
        <EditAgentModal 
          isOpen={isEditModalOpen}
          onClose={() => setIsEditModalOpen(false)}
          createMode={isCreateMode}
          agent={selectedAgent ? agents.find(a => a.id === selectedAgent) : undefined}
          code={selectedAgent ? agentCodes[selectedAgent] : undefined}
          onSave={handleSaveAgent}
        />
      )}
      
      {/* Schedule Modal */}
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

      {/* Footer */}
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
      
      {/* Logs Viewer */}
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
