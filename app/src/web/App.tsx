import { useState, useEffect, useRef } from 'react';
import { Terminal } from 'lucide-react';
import { Auth0Provider, useAuth0 } from '@auth0/auth0-react';
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
// Removed unused AgentLogViewer import
import GlobalLogsViewer from '@components/GlobalLogsViewer';
import ScheduleAgentModal from '@components/ScheduleAgentModal';
import MemoryManager from '@components/MemoryManager';
import ErrorDisplay from '@components/ErrorDisplay';
import AgentImportHandler from '@components/AgentImportHandler';

function AppContent() {
  const { isAuthenticated, user, loginWithRedirect, logout, isLoading } = useAuth0();
  
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

  const handleEditClick = async (agentId: string) => {
    setSelectedAgent(agentId);
    setIsCreateMode(false);
    setIsEditModalOpen(true);
    Logger.info('APP', `Opening editor for agent ${agentId}`);
  };

  const handleAddAgentClick = () => {
    setSelectedAgent(null);
    setIsCreateMode(true);
    setIsEditModalOpen(true);
    Logger.info('APP', 'Creating new agent');
  };

  const handleScheduleClick = (agentId: string) => {
    setSchedulingAgentId(agentId);
    setIsScheduleModalOpen(true);
    Logger.info('APP', `Opening schedule modal for agent ${agentId}`);
  };

  const handleMemoryClick = (agentId: string) => {
    if (flashingMemories.has(agentId)) {
      const newFlashing = new Set(flashingMemories);
      newFlashing.delete(agentId);
      setFlashingMemories(newFlashing);
    }
    
    setMemoryAgentId(agentId);
    setIsMemoryManagerOpen(true);
    Logger.info('APP', `Opening memory manager for agent ${agentId}`);
  };

  const handleDeleteClick = async (agentId: string) => {
    const agent = agents.find(a => a.id === agentId);
    if (!agent) return;
    
    if (window.confirm(`Are you sure you want to delete agent "${agent.name}"?`)) {
      try {
        setError(null);
        Logger.info('APP', `Deleting agent "${agent.name}" (${agentId})`);
        
        if (agent.status === 'running') {
          Logger.info(agentId, `Stopping agent before deletion`);
          stopAgentLoop(agentId);
        }
        
        await deleteAgent(agentId);
        Logger.info('APP', `Agent "${agent.name}" deleted successfully`);
        await fetchAgents();
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        setError(errorMessage);
        Logger.error('APP', `Failed to delete agent: ${errorMessage}`, err);
      }
    }
  };

  const handleDismissStartupDialog = () => {
    setShowStartupDialog(false);
  };

  const fetchAgents = async () => {
    try {
      setIsRefreshing(true);
      Logger.info('APP', 'Fetching agents from database');
      
      const agentsData = await listAgents();
      setAgents(agentsData);
      Logger.info('APP', `Found ${agentsData.length} agents in database`);
      
      if (agentsData.length === 0 && !initialAgentsLoaded.current) {
        Logger.info('APP', 'No agents found, loading initial agents');
        await loadInitialAgents(true);
        initialAgentsLoaded.current = true;
        
        const updatedAgentsData = await listAgents();
        setAgents(updatedAgentsData);
        Logger.info('APP', `After loading initial agents: ${updatedAgentsData.length} agents in database`);
      } else if (!initialAgentsLoaded.current) {
        initialAgentsLoaded.current = true;
      }
      
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
      const isStartingUp = startingAgents.has(id);
      
      if (isStartingUp || currentStatus === 'running') {
        Logger.info(id, `Stopping agent "${agent.name}"`);
        stopAgentLoop(id);
        if (isStartingUp) {
          setStartingAgents(prev => {
            const updated = new Set(prev);
            updated.delete(id);
            return updated;
          });
        }
        await updateAgentStatus(id, 'stopped');
        Logger.info(id, `Agent status updated to "stopped" in database`);
      } else {
        Logger.info(id, `Starting agent "${agent.name}"`);
        setStartingAgents(prev => {
          const updated = new Set(prev);
          updated.add(id);
          return updated;
        });
        
        try {
          await startAgentLoop(id);
          await updateAgentStatus(id, 'running');
          Logger.info(id, `Agent status updated to "running" in database`);
        } finally {
          setStartingAgents(prev => {
            const updated = new Set(prev);
            updated.delete(id);
            return updated;
          });
        }
      }
      
      await fetchAgents();
    } catch (err) {
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

  useEffect(() => {
    const handleMemoryUpdate = (event: CustomEvent) => {
      const updatedAgentId = event.detail.agentId;
      
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
  
  useEffect(() => {
    Logger.info('APP', 'Application starting');
    fetchAgents();
    
    if (isAuthenticated) {
      Logger.info('AUTH', `User authenticated: ${user?.name || user?.email || 'Unknown user'}`);
    } else if (!isLoading) {
      Logger.info('AUTH', 'User not authenticated');
    }
    
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
  }, [isAuthenticated, isLoading, user]);
  
  useEffect(() => {
    if (!isLoading) {
      Logger.info('AUTH', `Auth loading complete, authenticated: ${isAuthenticated}`);
    }
  }, [isLoading, isAuthenticated]);

  useEffect(() => {
    if (serverStatus === 'offline') {
      setShowStartupDialog(true);
    }
  }, [serverStatus]);

  return (
    <div className="min-h-screen bg-gray-50">
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
            setServerStatus={setServerStatus}
          />
        )}


      <AppHeader 
        serverStatus={serverStatus}
        setServerStatus={setServerStatus}
        isRefreshing={isRefreshing}
        agentCount={agents.length}
        activeAgentCount={agents.filter(a => a.status === 'running').length}
        onRefresh={fetchAgents}
        onAddAgent={handleAddAgentClick}
        setError={setError}
        authState={{
          isLoading,
          isAuthenticated,
          user,
          loginWithRedirect,
          logout
        }}
      />

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
      
      {showGlobalLogs && (
        <GlobalLogsViewer 
          isOpen={showGlobalLogs}
          onClose={() => setShowGlobalLogs(false)}
        />
      )}
    </div>
  );
}

export function App() {
  return (
    <Auth0Provider
      domain="dev-mzdd3k678tj1ja86.us.auth0.com"
      clientId="R5iv3RVkWjGZrexFSJ6HqlhSaaGLyFpm"
      authorizationParams={{
        redirect_uri: window.location.origin
      }}
      cacheLocation="localstorage"
      useRefreshTokens={true}
      onRedirectCallback={(appState) => {
        console.log("Auth0 redirect callback triggered", appState);
        window.history.replaceState(
          {},
          document.title,
          appState?.returnTo || window.location.pathname
        );
      }}
    >
      <AppContent />
    </Auth0Provider>
  );
}

export default App;
