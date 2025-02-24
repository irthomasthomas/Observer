import { useState, useEffect } from 'react';
import { checkOllamaServer } from './utils/ollamaServer';
import { 
  listAgents, 
  saveAgent, 
  updateAgentStatus, 
  getAgentCode,
  CompleteAgent 
} from './utils/agent_database';
import { RotateCw, Edit2, PlusCircle, Terminal, Clock } from 'lucide-react';
import EditAgentModal from './components/EditAgentModal';
import { 
  startScreenCapture, 
  stopScreenCapture, 
  captureFrameAndOCR, 
  injectOCRTextIntoPrompt 
} from './utils/screenCapture';


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

const toggleAgent = async (id: string, currentStatus: string): Promise<void> => {
  try {
    setError(null);
    const newStatus = currentStatus === 'running' ? 'stopped' : 'running';
    
    // Get the agent object
    const agent = agents.find(a => a.id === id);
    
    if (newStatus === 'running') {
      console.log(`Starting agent ${id}...`);
      
      // Check if the agent needs OCR
      if (agent && agent.system_prompt && agent.system_prompt.includes('SCREEN_OCR')) {
        console.log('Found SCREEN_OCR in system prompt. Starting screen capture...');
        
        // Start the screen capture (only asks for permission once)
        const stream = await startScreenCapture();
        
        if (stream) {
          // Take the initial screenshot and perform OCR
          const ocrResult = await captureFrameAndOCR();
          
          if (ocrResult.success && ocrResult.text) {
            // Create a modified system prompt with the OCR text injected
            const modifiedPrompt = injectOCRTextIntoPrompt(
              agent.system_prompt,
              ocrResult.text
            );
            
            // Log the modified prompt
            console.log('System prompt with OCR results:');
            console.log(modifiedPrompt);
            
            // Display in an alert for testing purposes
            alert(`Modified system prompt with OCR results:\n\n${modifiedPrompt}`);
          } else {
            console.error('OCR failed:', ocrResult.error);
            alert(`OCR failed: ${ocrResult.error}`);
          }
        } else {
          console.error('Failed to start screen capture');
          setError('Failed to start screen capture');
        }
      }
    } else {
      // If stopping the agent, also stop the screen capture
      stopScreenCapture();
      console.log(`Stopping agent ${id} and screen capture...`);
    }
    
    // Continue with normal agent status update
    await updateAgentStatus(id, newStatus as 'running' | 'stopped');
    await fetchAgents();
  } catch (err) {
    setError(err instanceof Error ? err.message : 'Failed to toggle agent status');
    console.error('Error toggling agent:', err);
  }
}


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
              <h1 className="text-xl font-semibold">Observer</h1>
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
