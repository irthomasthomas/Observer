import { useState, useEffect } from 'react';
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
import { startAgentLoop, stopAgentLoop } from '@utils/main_loop';
import { Logger } from '@utils/logging';
import { MEMORY_UPDATE_EVENT } from '@components/MemoryManager';

// Imported Components
import AppHeader from '@components/AppHeader';
import AgentCard from '@components/AgentCard';
import EditAgentModal from '@components/EditAgentModal';
import StartupDialogs from '@components/StartupDialogs';
import GlobalLogsViewer from '@components/GlobalLogsViewer';
import ScheduleAgentModal from '@components/ScheduleAgentModal';
import MemoryManager from '@components/MemoryManager';
import ErrorDisplay from '@components/ErrorDisplay';
import AgentImportHandler from '@components/AgentImportHandler';
import SidebarMenu from '@components/SidebarMenu';
import CommunityTab from '@components/CommunityTab';

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
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('myAgents');

  // Reload agent list when switching to the My Agents tab
  useEffect(() => {
    if (activeTab === 'myAgents') {
      fetchAgents();
    }
  }, [activeTab]);

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
      
      // Check if there are no agents and log it
      if (agentsData.length === 0) {
        Logger.info('APP', 'No agents found, user will see empty state message');
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

  // Add a custom message for empty agent list
  const EmptyAgentMessage = () => (
    <div className="col-span-full text-center py-10">
      <div className="bg-blue-50 rounded-lg p-6 max-w-2xl mx-auto">
        <h3 className="text-xl font-semibold text-blue-800 mb-3">Ready to Get Started?</h3>
        <p className="text-blue-600 mb-6">
          You don't have any agents yet. Explore the Community tab to discover pre-built agents, 
          or create your own custom agent from scratch.
        </p>
        <div className="flex flex-col sm:flex-row justify-center gap-4">
          <button 
            onClick={() => setActiveTab('community')} 
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors flex items-center justify-center"
          >
            <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"></path>
            </svg>
            Explore Community Agents
          </button>
          <button 
            onClick={handleAddAgentClick} 
            className="px-4 py-2 bg-white border border-blue-600 text-blue-600 rounded-md hover:bg-blue-50 transition-colors flex items-center justify-center"
          >
            <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"></path>
            </svg>
            Create New Agent
          </button>
        </div>
      </div>
    </div>
  );

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
          setError={setError}
          authState={{
            isLoading,
            isAuthenticated,
            user,
            loginWithRedirect,
            logout
          }}
          onMenuClick={() => setIsSidebarOpen(true)}
          shouldHighlightMenu={agents.length === 0}
        />


        {/* Sidebar Menu */}
        <SidebarMenu 
          isOpen={isSidebarOpen}
          onClose={() => setIsSidebarOpen(false)}
          activeTab={activeTab}
          onTabChange={(tab) => {
            setActiveTab(tab);
            setIsSidebarOpen(false);
          }}
        />

        {/* Main content, replace the TabNavigation and TabContent with this */}
        <main className="max-w-7xl mx-auto px-4 pt-24 pb-16">
          <AgentImportHandler 
            onImportComplete={fetchAgents}
            setError={setError}
            onAddAgent={handleAddAgentClick}
            agentCount={agents.length}
            activeAgentCount={agents.filter(a => a.status === 'running').length}
            isRefreshing={isRefreshing}
            onRefresh={fetchAgents}
          />

          {error && <ErrorDisplay message={error} />}

          {activeTab === 'myAgents' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {agents.length > 0 ? agents.map(agent => (
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
              )) : <EmptyAgentMessage />}
            </div>
          ) : activeTab === 'community' ? (
            <CommunityTab />
          ) : (
            <div className="text-center p-8">
              <p className="text-gray-500">This feature is coming soon!</p>
            </div>
          )}
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
