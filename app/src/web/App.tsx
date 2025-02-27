import { useState, useEffect, useRef } from 'react';
import { checkOllamaServer } from '@utils/ollamaServer';
import { 
  listAgents, 
  saveAgent, 
  updateAgentStatus, 
  getAgentCode,
  deleteAgent,
  CompleteAgent,
  importAgentsFromFiles 
} from '@utils/agent_database';
import { loadInitialAgents } from '@utils/initialAgentLoader';
import { RotateCw, Edit2, PlusCircle, Terminal, Clock, Trash2, Upload, Brain } from 'lucide-react';
import EditAgentModal from '@components/EditAgentModal';
import StartupDialogs from '@components/StartupDialogs';
import TextBubble from '@components/TextBubble';
import { startAgentLoop, stopAgentLoop, setOllamaServerAddress } from '@utils/main_loop';
import { Logger } from '@utils/logging';
import AgentLogViewer from '@components/AgentLogViewer';
import GlobalLogsViewer from '@components/GlobalLogsViewer';
import ScheduleAgentModal, { isAgentScheduled, getScheduledTime } from '@components/ScheduleAgentModal';
import MemoryManager from '@components/MemoryManager';


export function App() {
  const [agents, setAgents] = useState<CompleteAgent[]>([]);
  const [agentCodes, setAgentCodes] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [serverAddress, setServerAddress] = useState('localhost:3838');
  const [showServerHint] = useState(true);
  const [serverStatus, setServerStatus] = useState<'unchecked' | 'online' | 'offline'>('unchecked');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isCreateMode, setIsCreateMode] = useState(false);
  const [showStartupDialog, setShowStartupDialog] = useState(true); // Always show at startup
  const [showGlobalLogs, setShowGlobalLogs] = useState(false);
  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);
  const [schedulingAgentId, setSchedulingAgentId] = useState<string | null>(null);
  const [isMemoryManagerOpen, setIsMemoryManagerOpen] = useState(false);
  const [memoryAgentId, setMemoryAgentId] = useState<string | null>(null);
  const [importStatus, setImportStatus] = useState<{
    inProgress: boolean;
    results: Array<{ filename: string; success: boolean; error?: string }>;
  }>({ inProgress: false, results: [] });
  
  // We don't need any additional state for the button appearance
  
  // Reference to the file input element
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Flag to track if initial agents have been loaded
  const initialAgentsLoaded = useRef(false);

  // Handle edit button click
  const handleEditClick = async (agentId: string) => {
    setSelectedAgent(agentId);
    setIsCreateMode(false);
    setIsEditModalOpen(true);
    Logger.info('APP', `Opening editor for agent ${agentId}`);
  };

  // Handle add agent button click
  const handleAddAgentClick = () => {
    setSelectedAgent(null);
    setIsCreateMode(true);
    setIsEditModalOpen(true);
    Logger.info('APP', 'Creating new agent');
  };

  // Handle import button click
  const handleImportClick = () => {
    // Clear previous import results
    setImportStatus({ inProgress: false, results: [] });
    
    // Trigger the hidden file input
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
    Logger.info('APP', 'Opening file selector for agent import');
  };
  
  // Handle file selection for import
  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    
    if (!files || files.length === 0) {
      Logger.info('APP', 'No files selected for import');
      return;
    }
    
    Logger.info('APP', `Selected ${files.length} file(s) for import`);
    setImportStatus({ inProgress: true, results: [] });
    
    try {
      setError(null);
      const results = await importAgentsFromFiles(Array.from(files));
      
      setImportStatus({ 
        inProgress: false, 
        results 
      });
      
      // Log import results
      const successCount = results.filter(r => r.success).length;
      Logger.info('APP', `Import completed: ${successCount}/${results.length} agents imported successfully`);
      
      if (successCount > 0) {
        // Refresh the agent list
        await fetchAgents();
      }
      
      // Show error if any imports failed
      const failedImports = results.filter(r => !r.success);
      if (failedImports.length > 0) {
        const errorMessages = failedImports.map(r => `${r.filename}: ${r.error}`).join('; ');
        setError(`Failed to import ${failedImports.length} agent(s): ${errorMessages}`);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(`Import failed: ${errorMessage}`);
      setImportStatus({ inProgress: false, results: [] });
      Logger.error('APP', `Import error: ${errorMessage}`, err);
    }
    
    // Reset the file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Handle schedule button click
  const handleScheduleClick = (agentId: string) => {
    setSchedulingAgentId(agentId);
    setIsScheduleModalOpen(true);
    Logger.info('APP', `Opening schedule modal for agent ${agentId}`);
  };

  // Handle memory button click
  const handleMemoryClick = (agentId: string) => {
    setMemoryAgentId(agentId);
    setIsMemoryManagerOpen(true);
    Logger.info('APP', `Opening memory manager for agent ${agentId}`);
  };

  // Handle delete agent button click
  const handleDeleteClick = async (agentId: string) => {
    const agent = agents.find(a => a.id === agentId);
    if (!agent) return;
    
    if (window.confirm(`Are you sure you want to delete agent "${agent.name}"?`)) {
      try {
        setError(null);
        Logger.info('APP', `Deleting agent "${agent.name}" (${agentId})`);
        
        // Stop the agent if it's running
        if (agent.status === 'running') {
          Logger.info(agentId, `Stopping agent before deletion`);
          stopAgentLoop(agentId);
        }
        
        // Delete the agent from the database
        await deleteAgent(agentId);
        Logger.info('APP', `Agent "${agent.name}" deleted successfully`);
        
        // Refresh the agent list
        await fetchAgents();
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        setError(errorMessage);
        Logger.error('APP', `Failed to delete agent: ${errorMessage}`, err);
      }
    }
  };

  // Handle startup dialog dismiss
  const handleDismissStartupDialog = () => {
    setShowStartupDialog(false);
  };

  const checkServerStatus = async () => {
    try {
      setServerStatus('unchecked');
      const [host, port] = serverAddress.split(':');
      
      Logger.info('SERVER', `Checking connection to Ollama server at ${host}:${port}`);
      
      // Set the server address for agent loops
      setOllamaServerAddress(host, port);
      
      const result = await checkOllamaServer(host, port);
      
      if (result.status === 'online') {
        setServerStatus('online');
        setError(null);
        Logger.info('SERVER', `Connected successfully to Ollama server at ${host}:${port}`);
      } else {
        setServerStatus('offline');
        setError(result.error || 'Failed to connect to Ollama server');
        Logger.error('SERVER', `Failed to connect to Ollama server: ${result.error || 'Unknown error'}`);
      }
    } catch (err) {
      setServerStatus('offline');
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError('Failed to connect to Ollama server');
      Logger.error('SERVER', `Error checking server status: ${errorMessage}`, err);
    }
  };

  const handleServerAddressChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newAddress = e.target.value;
    setServerAddress(newAddress);
    
    // Update server address for agent loops when input changes
    if (newAddress.includes(':')) {
      const [host, port] = newAddress.split(':');
      setOllamaServerAddress(host, port);
      Logger.debug('SERVER', `Server address updated to ${host}:${port}`);
    }
  };

  // Fetch all agents
  const fetchAgents = async () => {
    try {
      setIsRefreshing(true);
      Logger.info('APP', 'Fetching agents from database');
      
      const agentsData = await listAgents();
      setAgents(agentsData);
      Logger.info('APP', `Found ${agentsData.length} agents in database`);
      
      // Check if we need to load initial agents
      if (agentsData.length === 0 && !initialAgentsLoaded.current) {
        Logger.info('APP', 'No agents found, loading initial agents');
        await loadInitialAgents(true);
        initialAgentsLoaded.current = true;
        
        // Fetch agents again after loading initial agents
        const updatedAgentsData = await listAgents();
        setAgents(updatedAgentsData);
        Logger.info('APP', `After loading initial agents: ${updatedAgentsData.length} agents in database`);
      } else if (!initialAgentsLoaded.current) {
        // Mark as loaded even if we didn't need to load them
        initialAgentsLoaded.current = true;
      }
      
      // Fetch code for all agents
      Logger.debug('APP', 'Fetching agent code');
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
      
      // No need to track starting agents
      
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError('Failed to fetch agents from database');
      Logger.error('APP', `Error fetching agents: ${errorMessage}`, err);
    } finally {
      setIsRefreshing(false);
    }
  };

  const toggleAgent = async (id: string, currentStatus: string): Promise<void> => {
    try {
      setError(null);
      const newStatus = currentStatus === 'running' ? 'stopped' : 'running';
      const agent = agents.find(a => a.id === id);
      
      if (!agent) {
        throw new Error(`Agent ${id} not found`);
      }
      
      if (newStatus === 'running') {
        Logger.info(id, `Starting agent "${agent.name}"`);
        // Start the agent loop
        await startAgentLoop(id);
      } else {
        Logger.info(id, `Stopping agent "${agent.name}"`);
        // Stop the agent loop
        stopAgentLoop(id);
      }
      
      // Update agent status in the database
      await updateAgentStatus(id, newStatus as 'running' | 'stopped');
      Logger.info(id, `Agent status updated to "${newStatus}" in database`);
      
      // Refresh the agent list
      await fetchAgents();
    } catch (err) {
      // No need to track starting agents
      
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMessage);
      Logger.error('APP', `Failed to toggle agent status: ${errorMessage}`, err);
    }
  }

  // Save agent (create or update)
  const handleSaveAgent = async (agent: CompleteAgent, code: string) => {
    try {
      setError(null);
      const isNew = !agents.some(a => a.id === agent.id);
      
      Logger.info('APP', isNew 
        ? `Creating new agent "${agent.name}"` 
        : `Updating agent "${agent.name}" (${agent.id})`
      );
      
      await saveAgent(agent, code);
      Logger.info('APP', `Agent "${agent.name}" saved successfully`);
      
      await fetchAgents();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMessage);
      Logger.error('APP', `Failed to save agent: ${errorMessage}`, err);
    }
  };

  // Initial data load
  useEffect(() => {
    Logger.info('APP', 'Application starting');
    fetchAgents();
    checkServerStatus();
    
    // Add a window event listener to log uncaught errors
    const handleWindowError = (event: ErrorEvent) => {
      Logger.error('APP', `Uncaught error: ${event.message}`, {
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
        error: event.error
      });
    };
    
    window.addEventListener('error', handleWindowError);
    
    return () => {
      window.removeEventListener('error', handleWindowError);
    };
  }, []);

  // Optional: Show dialog again if server status changes to offline
  useEffect(() => {
    if (serverStatus === 'offline') {
      setShowStartupDialog(true);
    }
  }, [serverStatus]);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Hidden file input for agent import */}
      <input 
        type="file"
        ref={fileInputRef}
        onChange={handleFileSelect}
        accept=".json"
        multiple
        className="hidden"
      />
      
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
                  onChange={handleServerAddressChange}
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
                <button
                  onClick={handleImportClick}
                  className="flex items-center space-x-2 px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600"
                  disabled={importStatus.inProgress}
                >
                  <Upload className="h-5 w-5" />
                  <span>{importStatus.inProgress ? 'Importing...' : 'Import'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </header>

      {showServerHint && (
        <div className="fixed z-60" style={{ top: '70px', right: '35%' }}>
          <TextBubble 
            message="Enter your Ollama server address here (default: localhost:11434)" 
            duration={7000} 
          />
        </div>
      )}

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 pt-24 pb-16">
        {/* Import Results */}
        {importStatus.results.length > 0 && (
          <div className="mb-4 p-4 bg-blue-50 rounded-md">
            <h3 className="font-medium mb-2">Import Results:</h3>
            <ul className="list-disc pl-5">
              {importStatus.results.map((result, index) => (
                <li key={index} className={result.success ? 'text-green-600' : 'text-red-600'}>
                  {result.filename}: {result.success ? 'Success' : `Failed - ${result.error}`}
                </li>
              ))}
            </ul>
          </div>
        )}

        {error && (
          <div className="mb-4 p-4 bg-red-100 text-red-700 rounded-md">{error}</div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {agents.map(agent => (
            <div key={agent.id} className="bg-white rounded-lg shadow-md p-4">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold">{agent.name}</h3>
                <div className="flex space-x-2">
                  <button
                    onClick={() => handleEditClick(agent.id)}
                    className={`p-2 rounded-md hover:bg-gray-100 ${
                      agent.status === 'running' ? 'opacity-50 cursor-not-allowed' : ''
                    }`}
                    disabled={agent.status === 'running'}
                    title="Edit agent"
                  >
                    <Edit2 className="h-5 w-5" />
                  </button>
                  <button
                    onClick={() => handleDeleteClick(agent.id)}
                    className={`p-2 rounded-md hover:bg-red-100 ${
                      agent.status === 'running' ? 'opacity-50 cursor-not-allowed' : ''
                    }`}
                    disabled={agent.status === 'running'}
                    title="Delete agent"
                  >
                    <Trash2 className="h-5 w-5 text-red-500" />
                  </button>
                </div>
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
                  onClick={(e) => {
                    // For stopped agents, change button text immediately
                    if (agent.status === 'stopped') {
                      // Change just this button's text and style
                      const btn = e.currentTarget;
                      btn.innerText = '⏳ Starting Up';
                      btn.className = 'px-4 py-2 rounded-md bg-yellow-500 text-white hover:bg-yellow-600';
                    }
                    // Call the actual toggle function
                    toggleAgent(agent.id, agent.status);
                  }}
                  className={`px-4 py-2 rounded-md ${
                    agent.status === 'running'
                      ? 'bg-red-500 text-white hover:bg-red-600'
                      : 'bg-green-500 text-white hover:bg-green-600'
                  }`}
                >
                  {agent.status === 'running' ? '⏹ Stop' : '▶️ Start'}
                </button>

                <div className="text-sm bg-gray-100 px-2 py-1 rounded">
                  {agent.loop_interval_seconds}s
                </div>

                <button
                  onClick={() => handleScheduleClick(agent.id)}
                  className={`p-2 rounded-md ${
                    isAgentScheduled(agent.id)
                      ? 'bg-yellow-100 hover:bg-yellow-200'
                      : 'hover:bg-gray-100'
                  }`}
                  title={isAgentScheduled(agent.id) 
                    ? `Scheduled: ${getScheduledTime(agent.id)?.toLocaleString()}` 
                    : "Schedule agent runs"}
                >
                  <Clock className={`h-5 w-5 ${
                    isAgentScheduled(agent.id) ? 'text-yellow-600' : ''
                  }`} />
                </button>

                <button
                  onClick={() => handleMemoryClick(agent.id)}
                  className="p-2 rounded-md hover:bg-purple-100"
                  title="View and edit agent memory"
                >
                  <Brain className="h-5 w-5 text-purple-600" />
                </button>
              </div>

              {/* Agent-specific log viewer */}
              <AgentLogViewer agentId={agent.id} />
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
      
      {/* Memory Manager */}
      {isMemoryManagerOpen && memoryAgentId && (
        <MemoryManager
          agentId={memoryAgentId}
          agentName={agents.find(a => a.id === memoryAgentId)?.name || memoryAgentId}
          isOpen={isMemoryManagerOpen}
          onClose={() => {
            setIsMemoryManagerOpen(false);
            setMemoryAgentId(null);
          }}
        />
      )}

      {/* Footer */}
      <footer className="fixed bottom-0 left-0 right-0 bg-white border-t z-30">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <button 
            className="flex items-center space-x-2 px-4 py-2 bg-gray-100 rounded-md hover:bg-gray-200"
            onClick={() => setShowGlobalLogs(!showGlobalLogs)}
          >
            <Terminal className="h-5 w-5" />
            <span>{showGlobalLogs ? 'Hide System Logs' : 'Show System Logs'}</span>
          </button>
        </div>
      </footer>
      
      {/* Global Logs Viewer */}
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
