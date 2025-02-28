import { useState, useEffect, useRef } from 'react';
import { Terminal } from 'lucide-react';
import { 
  listAgents, 
  updateAgentStatus, 
  getAgentCode,
  deleteAgent,
  saveAgent,
  CompleteAgent,
} from '@utils/agent_database';
import { loadInitialAgents } from '@utils/initialAgentLoader';
import { startAgentLoop, stopAgentLoop } from '@utils/main_loop';
import { Logger } from '@utils/logging';
import { MEMORY_UPDATE_EVENT } from '@components/MemoryManager';

// Imported Components
import AppHeader from '@components/AppHeader';
import AgentCard from '@components/AgentCard';
import EditAgentModal from '@components/EditAgentModal';
import StartupDialogs from '@components/StartupDialogs';
import AgentLogViewer from '@components/AgentLogViewer';
import GlobalLogsViewer from '@components/GlobalLogsViewer';
import ScheduleAgentModal from '@components/ScheduleAgentModal';
import MemoryManager from '@components/MemoryManager';
import ErrorDisplay from '@components/ErrorDisplay';
import AgentImportHandler from '@components/AgentImportHandler';

export function App() {
  const [agents, setAgents] = useState<CompleteAgent[]>([]);
  const [agentCodes, setAgentCodes] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [serverStatus, setServerStatus] = useState<'unchecked' | 'online' | 'offline'>('unchecked');
  const [startingAgents, setStartingAgents] = useState<Set<string>>(new Set());
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isCreateMode, setIsCreateMode] = useState(false);
  const [showStartupDialog, setShowStartupDialog] = useState(true);
  const [showGlobalLogs, setShowGlobalLogs] = useState(false);
  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);
  const [schedulingAgentId, setSchedulingAgentId] = useState<string | null>(null);
  const [isMemoryManagerOpen, setIsMemoryManagerOpen] = useState(false);
  const [memoryAgentId, setMemoryAgentId] = useState<string | null>(null);
  const [flashingMemories, setFlashingMemories] = useState<Set<string>>(new Set());
  
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

  // Handle schedule button click
  const handleScheduleClick = (agentId: string) => {
    setSchedulingAgentId(agentId);
    setIsScheduleModalOpen(true);
    Logger.info('APP', `Opening schedule modal for agent ${agentId}`);
  };

  // Handle memory button click
  const handleMemoryClick = (agentId: string) => {
    // Remove from flashing memories if it's there
    if (flashingMemories.has(agentId)) {
      const newFlashing = new Set(flashingMemories);
      newFlashing.delete(agentId);
      setFlashingMemories(newFlashing);
    }
    
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
      const agent = agents.find(a => a.id === id);
      
      if (!agent) {
        throw new Error(`Agent ${id} not found`);
      }
      // Check if the agent is currently in "starting up" state
      const isStartingUp = startingAgents.has(id);
      
      // If it's starting up or already running, we want to stop it
      if (isStartingUp || currentStatus === 'running') {
        Logger.info(id, `Stopping agent "${agent.name}"`);
        
        // Stop the agent loop
        stopAgentLoop(id);
        
        // Remove from starting agents set if it was there
        if (isStartingUp) {
          setStartingAgents(prev => {
            const updated = new Set(prev);
            updated.delete(id);
            return updated;
          });
        }
        
        // Update agent status in the database
        await updateAgentStatus(id, 'stopped');
        Logger.info(id, `Agent status updated to "stopped" in database`);
      } else {
        // Agent is stopped, let's start it
        Logger.info(id, `Starting agent "${agent.name}"`);
        
        // Add to starting agents set
        setStartingAgents(prev => {
          const updated = new Set(prev);
          updated.add(id);
          return updated;
        });
        
        try {
          // Start the agent loop
          await startAgentLoop(id);
          
          // Update agent status in the database
          await updateAgentStatus(id, 'running');
          Logger.info(id, `Agent status updated to "running" in database`);
        } finally {
          // Always remove from starting agents set, even if there was an error
          setStartingAgents(prev => {
            const updated = new Set(prev);
            updated.delete(id);
            return updated;
          });
        }
      }
      
      // Refresh the agent list
      await fetchAgents();
    } catch (err) {
      // Remove from starting agents set if there was an error
      setStartingAgents(prev => {
        const updated = new Set(prev);
        updated.delete(id);
        return updated;
      });
      
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMessage);
      Logger.error('APP', `Failed to toggle agent status: ${errorMessage}`, err);
    }
  };

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

  // Setup memory update listener
  useEffect(() => {
    const handleMemoryUpdate = (event: CustomEvent) => {
      const updatedAgentId = event.detail.agentId;
      
      // Only add to flashing set if the memory manager for this agent is not open
      if (updatedAgentId !== memoryAgentId || !isMemoryManagerOpen) {
        setFlashingMemories(prev => {
          const newSet = new Set(prev);
          newSet.add(updatedAgentId);
          return newSet;
        });
        
        Logger.debug('APP', `Memory updated for agent ${updatedAgentId}, setting flash indicator`);
      }
    };
    
    window.addEventListener(MEMORY_UPDATE_EVENT, handleMemoryUpdate as EventListener);
    
    return () => {
      window.removeEventListener(MEMORY_UPDATE_EVENT, handleMemoryUpdate as EventListener);
    };
  }, [memoryAgentId, isMemoryManagerOpen]);
  
  // Initial data load
  useEffect(() => {
    Logger.info('APP', 'Application starting');
    fetchAgents();
    
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
      {/* CSS for memory flash animation */}
      <style>
        {`
          @keyframes memory-flash {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.4; }
          }
          .animate-pulse {
            animation: memory-flash 1.5s ease-in-out infinite;
          }
        `}
      </style>
      
      {showStartupDialog && (
        <StartupDialogs 
          serverStatus={serverStatus}
          onDismiss={handleDismissStartupDialog} 
        />
      )}

      {/* App Header */}
      <AppHeader 
        serverStatus={serverStatus}
        setServerStatus={setServerStatus}
        isRefreshing={isRefreshing}
        agentCount={agents.length}
        activeAgentCount={agents.filter(a => a.status === 'running').length}
        onRefresh={fetchAgents}
        onAddAgent={handleAddAgentClick}
        setError={setError}
      />

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 pt-24 pb-16">
        <AgentImportHandler 
          onImportComplete={fetchAgents}
          setError={setError}
        />

        {error && <ErrorDisplay message={error} />}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {agents.map(agent => (
            <AgentCard 
              key={agent.id}
              agent={agent}
              code={agentCodes[agent.id]}
              isStarting={startingAgents.has(agent.id)}
              isMemoryFlashing={flashingMemories.has(agent.id)}
              onEdit={handleEditClick}
              onDelete={handleDeleteClick}
              onToggle={toggleAgent}
              onSchedule={handleScheduleClick}
              onMemory={handleMemoryClick}
            />
          ))}
        </div>
      </main>

      {/* Modals and Overlays */}
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

      {/* Footer with Global Logs Toggle */}
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
