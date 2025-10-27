import { useState, useEffect, useCallback, useMemo } from 'react';
import { Terminal } from 'lucide-react';
import { Auth0Provider, useAuth0 } from '@auth0/auth0-react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import {
  listAgents,
  getAgentCode,
  deleteAgent,
  saveAgent,
  CompleteAgent,
} from '@utils/agent_database';
import { startAgentLoop, stopAgentLoop } from '@utils/main_loop';
import { Logger } from '@utils/logging';
import { MEMORY_UPDATE_EVENT } from '@components/MemoryManager';
import { IterationStore } from '@utils/IterationStore';

// Imported Components
import AppHeader from '@components/AppHeader';
import AgentCard from '@components/AgentCard/AgentCard';
import EditAgentModal from '@components/EditAgent/EditAgentModal';
import StartupDialogs from '@components/StartupDialogs';
import GlobalLogsViewer from '@components/GlobalLogsViewer';
import ScheduleAgentModal from '@components/ScheduleAgentModal';
import MemoryManager from '@components/MemoryManager';
import ErrorDisplay from '@components/ErrorDisplay';
import AgentImportHandler from '@components/AgentImportHandler';
import PersistentSidebar from '@components/PersistentSidebar';
import AvailableModels from '@components/AvailableModels';
import CommunityTab from '@components/CommunityTab';
import GetStarted from '@components/GetStarted';
import JupyterServerModal from '@components/JupyterServerModal';
import { generateAgentFromSimpleConfig } from '@utils/agentTemplateManager';
import SimpleCreatorModal from '@components/EditAgent/SimpleCreatorModal';
import ConversationalGeneratorModal from '@components/AICreator/ConversationalGeneratorModal';
import RecordingsViewer from '@components/RecordingsViewer';
import SettingsTab from '@components/SettingsTab';
import { UpgradeSuccessPage } from '../pages/UpgradeSuccessPage'; // Assuming this path is correct
import { ObServerTab } from '@components/ObServerTab';
import { UpgradeModal } from '@components/UpgradeModal';
import AgentActivityModal from '@components/AgentCard/AgentActivityModal';
import TerminalModal from '@components/TerminalModal';
import { startCommandSSE, updateCommandSSEToken } from '@utils/commandSSE';
import { fetchModels } from '@utils/inferenceServer';


function AppContent() {
  // Check our environment variable to see if Auth0 should be disabled
  const isAuthDisabled = import.meta.env.VITE_DISABLE_AUTH === 'true';

  // If Auth0 is disabled, create a mock auth object for local development.
  const mockAuth = useMemo(() => ({
    isAuthenticated: false,
    user: { name: 'Local Dev User', email: 'dev@local.host' },
    loginWithRedirect: () => Promise.resolve(),
    logout: () => {},
    isLoading: false,
    getAccessTokenSilently: async () => 'mock_token'
  }), []);

  // Otherwise, use the real useAuth0 hook.
  const {
    isAuthenticated,
    user,
    loginWithRedirect,
    logout,
    isLoading,
    getAccessTokenSilently
  } = isAuthDisabled ? mockAuth : useAuth0();

  const [agents, setAgents] = useState<CompleteAgent[]>([]);
  const [agentCodes, setAgentCodes] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [serverStatus, setServerStatus] = useState<'unchecked' | 'online' | 'offline'>('unchecked');
  const [startingAgents, setStartingAgents] = useState<Set<string>>(new Set());
  const [runningAgents, setRunningAgents] = useState<Set<string>>(new Set());
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isCreateMode, setIsCreateMode] = useState(false);
  const [showStartupDialog, setShowStartupDialog] = useState(false);
  const [showGlobalLogs, setShowGlobalLogs] = useState(false);
  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);
  const [schedulingAgentId, setSchedulingAgentId] = useState<string | null>(null);
  const [isMemoryManagerOpen, setIsMemoryManagerOpen] = useState(false);
  const [memoryAgentId, setMemoryAgentId] = useState<string | null>(null);
  const [flashingMemories, setFlashingMemories] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState('myAgents');
  const [isUsingObServer, setIsUsingObServer] = useState(false);
  const [isJupyterModalOpen, setIsJupyterModalOpen] = useState(false);
  const [isSimpleCreatorOpen, setIsSimpleCreatorOpen] = useState(false);
  const [stagedAgentConfig, setStagedAgentConfig] = useState<{ agent: CompleteAgent, code: string } | null>(null);
  const [isConversationalModalOpen, setIsConversationalModalOpen] = useState(false);
  const [aiEditMessage, setAiEditMessage] = useState<string | undefined>();
  const [hasCompletedStartupCheck, setHasCompletedStartupCheck] = useState(false);

  // --- NEW STATE FOR QUOTA ERRORS AND MODAL ---
  const [agentsWithQuotaError, setAgentsWithQuotaError] = useState<Set<string>>(new Set());
  const [isUpgradeModalOpen, setIsUpgradeModalOpen] = useState(false);
  const [isHalfwayWarning, setIsHalfwayWarning] = useState(false);

  // --- STATE FOR ACTIVITY MODAL ---
  const [activityModalOpen, setActivityModalOpen] = useState(false);
  const [activityModalAgentId, setActivityModalAgentId] = useState<string | null>(null);

  // --- STATE FOR TERMINAL MODAL ---
  const [noModels, setNoModels] = useState(false);
  const [isTerminalModalOpen, setIsTerminalModalOpen] = useState(false);

  // --- STATE FOR QUOTA INFO ---
  const [quotaInfo, setQuotaInfo] = useState<{
    used: number;
    remaining: number | 'unlimited';
    limit: number | 'unlimited';
    pro_status: boolean;
  } | null>(null);

  // --- STATE FOR MOBILE SIDEBAR ---
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // --- DERIVED STATE ---
  const isProUser = quotaInfo?.pro_status === true;

  const fetchAgents = useCallback(async () => {
    try {
      setIsRefreshing(true);
      Logger.debug('APP', 'Fetching agents from database');
      const agentsData = await listAgents();
      setAgents(agentsData);
      Logger.debug('APP', `Found ${agentsData.length} agents`);

      // Fetch codes
      const codeResults = await Promise.all(
        agentsData.map(async (a) => ({ id: a.id, code: await getAgentCode(a.id) }))
      );
      const newCodes: Record<string, string> = {};
      codeResults.forEach((r) => {
        if (r.code) newCodes[r.id] = r.code;
      });
      setAgentCodes(newCodes);

      setError(null);
    } catch (err) {
      setError('Failed to fetch agents from database');
      Logger.error('APP', `Error fetching agents:`, err);
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  const getToken = useCallback(async () => {
    // If Auth0 is still loading its state, we can't get a token yet.
    if (isLoading) {
      Logger.warn('AUTH', 'getToken called while auth state is loading. Aborting.');
      return undefined;
    }

    // If loading is finished AND the user is not authenticated, abort.
    if (!isAuthenticated) {
      Logger.warn('AUTH', 'getToken called, but user is not authenticated.');
      try{
        // This might be called before the initial auth check, so we try to get it anyway.
        const token = await getAccessTokenSilently({
          authorizationParams: {
            audience: 'https://api.observer-ai.com',
          },
        });
        // If we get a token even when isAuthenticated is false, log it.
        if (token) Logger.info('AUTH', `getToken succeeded even though isAuthenticated is false.`);
        return token;
      }
      catch (error){
        Logger.warn('AUTH', `errored out trying getToken when not authenticated.`);
      }
      return undefined;
    }

    // If authenticated, proceed to get the token.
    try {
      const token = await getAccessTokenSilently({
        authorizationParams: {
          audience: 'https://api.observer-ai.com',
        },
      });
      return token;
    } catch (error) {
      Logger.error('AUTH', 'Failed to retrieve access token silently.', error);
      throw error;
    }
  }, [isAuthenticated, isLoading, getAccessTokenSilently]);

  const hostingContext = useMemo(() => {
  const { protocol, hostname } = window.location;

  // The primary condition for showing the warning is if the user is on a secure (HTTPS) page.
  // We also add a check to ensure we treat `https://localhost` as a self-hosted environment,
  // as a user in that scenario has full control.
  if (protocol === 'https:' && hostname !== 'localhost' && hostname !== '127.0.0.1') {
    // This will be true for https://app.observer-ai.com, https://dev.observer-ai.com, etc.
    return 'official-web';
  }

  // Any other scenario is treated as self-hosted. This includes:
  // - http://localhost:xxxx
  // - http://127.0.0.1:xxxx
  // - https://localhost:xxxx (local dev with a self-signed cert)
  // - Any other http:// address
  return 'self-hosted';
}, []);

  useEffect(() => {
    const handleAgentStatusChange = (event: CustomEvent) => {
      const { agentId, status } = event.detail || {};
      Logger.info('APP', `agentStatusChanged:`, { agentId, status });
      setRunningAgents(prev => {
        const updated = new Set(prev);
        if (status === 'running') {
          updated.add(agentId);
        } else {
          updated.delete(agentId);
        }
        return updated;
      });
    };

    // Event dispatched by Logger based on logType 'agent-status-changed'
    window.addEventListener(
      'agentStatusChanged',
      handleAgentStatusChange as EventListener
    );
    return () => {
      window.removeEventListener(
        'agentStatusChanged',
        handleAgentStatusChange as EventListener
      );
    };
  }, []);

  // --- USEEFFECT FOR QUOTA EVENT LISTENER ---
  useEffect(() => {
    const handleQuotaExceeded = (event: CustomEvent<{ agentId: string }>) => {
      const { agentId } = event.detail;
      setAgentsWithQuotaError(prevSet => {
        const newSet = new Set(prevSet);
        newSet.add(agentId);
        return newSet;
      });
    };

    window.addEventListener('quotaExceeded', handleQuotaExceeded as EventListener);

    return () => {
      window.removeEventListener('quotaExceeded', handleQuotaExceeded as EventListener);
    };
  }, []);

  // --- USEEFFECT FOR RUNTIME ERROR EVENT LISTENER ---
  useEffect(() => {
    const handleAgentRuntimeError = (event: CustomEvent<{ agentId: string; error: string }>) => {
      const { error } = event.detail;
      setError(error);
    };

    window.addEventListener('agentRuntimeError', handleAgentRuntimeError as EventListener);

    return () => {
      window.removeEventListener('agentRuntimeError', handleAgentRuntimeError as EventListener);
    };
  }, []);

  const handleEditClick = async (agentId: string) => {
    setSelectedAgent(agentId);
    setIsCreateMode(false);
    setIsEditModalOpen(true);
    Logger.info('APP', `Opening editor for agent ${agentId}`);
  };

  const handleAddAgentClick = () => {
    setSelectedAgent(null);
    setIsCreateMode(true); // Keep this true to signal intent
    setStagedAgentConfig(null); // Clear any old staged config
    setIsSimpleCreatorOpen(true);
    Logger.info('APP', 'Opening Simple Creator to create new agent');
  };

  const handleSimpleCreatorNext = (config: Parameters<typeof generateAgentFromSimpleConfig>[0]) => {
    Logger.info('APP', `Generating agent from Simple Creator`, config);
    const { agent, code } = generateAgentFromSimpleConfig(config);

    setStagedAgentConfig({ agent, code });
    setIsSimpleCreatorOpen(false);
    setIsEditModalOpen(true);
  };

  const handleAgentGenerated = (agent: CompleteAgent, code: string) => {
      Logger.info('APP', `Staging agent generated from conversation: "${agent.name}"`);
      setStagedAgentConfig({ agent, code });
      setIsCreateMode(true); // Signal that this is a new agent
      setIsEditModalOpen(true);
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

  const handleActivityClick = (agentId: string) => {
    setActivityModalAgentId(agentId);
    setActivityModalOpen(true);
    Logger.info('APP', `Opening activity modal for agent ${agentId}`);
  };

  const handleAIEditClick = (agentId: string) => {
    setAiEditMessage(`Help me edit this agent @${agentId}`);
    setIsConversationalModalOpen(true);
    Logger.info('APP', `Opening AI Edit modal for agent ${agentId}`);
  };

  const handleDeleteClick = async (agentId: string) => {
    const agent = agents.find(a => a.id === agentId);
    if (!agent) return;

    if (window.confirm(`Are you sure you want to delete agent "${agent.name}"?`)) {
      try {
        setError(null);
        Logger.info('APP', `Deleting agent "${agent.name}" (${agentId})`);

        if (runningAgents.has(agentId)) {
          Logger.info(agentId, `Stopping agent before deletion`);
          stopAgentLoop(agentId);
        }

        // Clear all iteration store data for this agent
        await IterationStore.clearAllHistory(agentId);
        Logger.info('APP', `Cleared iteration history for agent "${agent.name}"`);

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
    setHasCompletedStartupCheck(true);
  };

  const toggleAgent = async (id: string, isCurrentlyRunning: boolean): Promise<void> => {
    // If using Ob-Server and not logged in, trigger login instead of starting agent.
    if (isUsingObServer && !isAuthenticated) {
      Logger.info('AUTH', 'User attempted to use a protected feature while logged out. Redirecting to login.');
      loginWithRedirect();
      return; // Stop the function here.
    }

    try {
      setError(null);
      const agent = agents.find(a => a.id === id);

      if (!agent) {
        throw new Error(`Agent ${id} not found`);
      }
      const isStartingUp = startingAgents.has(id);

      if (isStartingUp || isCurrentlyRunning) {
        Logger.info(id, `Stopping agent "${agent.name}"`);
        stopAgentLoop(id);
        if (isStartingUp) {
          setStartingAgents(prev => {
            const updated = new Set(prev);
            updated.delete(id);
            return updated;
          });
        }
      } else {
        Logger.info(id, `Starting agent "${agent.name}"`);
        setStartingAgents(prev => {
          const updated = new Set(prev);
          updated.add(id);
          return updated;
        });

        try {
          await startAgentLoop(id, getToken);
        } finally {
          // This ensures that 'startingAgents' is cleared regardless of success or failure
          setStartingAgents(prev => {
            const updated = new Set(prev);
            updated.delete(id);
            return updated;
          });
        }
      }

      await fetchAgents();
    } catch (err) {
      // Ensure startingAgents is cleared on error as well
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

      Logger.info('APP', isNew ? `Creating new agent "${agent.name}"` : `Updating agent "${agent.name}" (${agent.id})`);

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

  // Start command SSE once for hotkey support in self-hosted environments
  useEffect(() => {
    if (hostingContext === 'self-hosted') {
      startCommandSSE(getToken);
    }
  }, [hostingContext]); // Only restart if hosting context changes
  
  // Update token when it changes (without restarting SSE)
  useEffect(() => {
    if (hostingContext === 'self-hosted') {
      updateCommandSSEToken(getToken);
    }
  }, [getToken, hostingContext]);

  useEffect(() => {
    if (!isLoading) {
      Logger.info('AUTH', `Auth loading complete, authenticated: ${isAuthenticated}`);
      // Auto-enable ObServer if user is authenticated
      if (isAuthenticated && !isUsingObServer) {
        Logger.info('AUTH', 'Auto-enabling ObServer for authenticated user');
        setIsUsingObServer(true);
      }
      // Show startup dialog only if user is NOT authenticated
      if (!isAuthenticated) {
        setShowStartupDialog(true);
      }
    }
  }, [isLoading, isAuthenticated]);

  useEffect(() => {
    if (serverStatus === 'offline' && !hasCompletedStartupCheck && !isLoading && !isAuthenticated) {
      setShowStartupDialog(true);
    }
  }, [serverStatus, hasCompletedStartupCheck, isLoading, isAuthenticated]);

  // Reload agents when switching to My Agents tab
  useEffect(() => {
    if (activeTab === 'myAgents') {
      fetchAgents();
    }
  }, [activeTab, fetchAgents]);

  // --- NEW: Memoized sorting logic ---
  // This will sort the agents array to bring active ones to the top.
  // useMemo ensures this only runs when the dependencies (agents, running, starting) change.
  const sortedAgents = useMemo(() => {
    // Create a shallow copy to sort, preventing mutation of the original state array.
    return [...agents].sort((a, b) => {
      const isALive = runningAgents.has(a.id) || startingAgents.has(a.id);
      const isBLive = runningAgents.has(b.id) || startingAgents.has(b.id);

      if (isALive && !isBLive) {
        return -1; // a should come before b
      }
      if (!isALive && isBLive) {
        return 1; // b should come before a
      }
      return 0; // The order remains the same for agents with the same status
    });
  }, [agents, runningAgents, startingAgents]);


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

        <UpgradeModal
          isOpen={isUpgradeModalOpen}
          onClose={() => setIsUpgradeModalOpen(false)}
          isHalfwayWarning={isHalfwayWarning}
        />


        <AppHeader
          serverStatus={serverStatus}
          setServerStatus={setServerStatus}
          setError={setError}
          isUsingObServer={isUsingObServer}
          setIsUsingObServer={setIsUsingObServer}
          hostingContext={hostingContext}
          authState={{
            isLoading,
            isAuthenticated,
            user,
            loginWithRedirect,
            logout
          }}
          getToken={getToken}
          onUpgradeClick={() => {
            setIsHalfwayWarning(true);
            setIsUpgradeModalOpen(true);
          }}
          onShowTerminalModal={() => setNoModels(true)}
          quotaInfo={quotaInfo}
          setQuotaInfo={setQuotaInfo}
          onToggleMobileMenu={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
        />

        <PersistentSidebar
          activeTab={activeTab}
          onTabChange={setActiveTab}
          isMobileMenuOpen={isMobileMenuOpen}
          onCloseMobileMenu={() => setIsMobileMenuOpen(false)}
        />

        <JupyterServerModal
          isOpen={isJupyterModalOpen}
          onClose={() => setIsJupyterModalOpen(false)}
        />

        <main className="pt-24 pb-16 px-0 md:px-4 pl-2 md:pl-20 wide:px-4 max-w-7xl mx-auto">

          {error && <ErrorDisplay message={error} />}

          {/* My Agents Tab - Always rendered, hidden when not active */}
          <div className={activeTab !== 'myAgents' ? 'hidden' : ''}>
            {sortedAgents.length > 0 ? (
              <div className="px-4">
                <AgentImportHandler
                  onAddAgent={handleAddAgentClick}
                  agentCount={agents.length}
                  activeAgentCount={runningAgents.size}
                  isRefreshing={isRefreshing}
                  onRefresh={fetchAgents}
                  onGenerateAgent={() => setIsConversationalModalOpen(true)}
                />

                <div className="flex flex-wrap gap-6 items-start">
                  {sortedAgents.map(agent => {
                const isAgentLive = runningAgents.has(agent.id) || startingAgents.has(agent.id);
                return (
                  <div
                    key={agent.id}
                    className={`flex-shrink-0 transition-all duration-700 ease-in-out ${
                      isAgentLive
                        ? 'w-full'
                        : 'w-full xl:w-[calc(50%-12px)]' // Use your preferred spacing, adjust if needed
                    }`}
                  >
                    <AgentCard
                      agent={agent}
                      code={agentCodes[agent.id]}
                      isRunning={runningAgents.has(agent.id)}
                      isStarting={startingAgents.has(agent.id)}
                      isMemoryFlashing={flashingMemories.has(agent.id)}
                      onEdit={handleEditClick}
                      onDelete={handleDeleteClick}
                      onToggle={toggleAgent}
                      onMemory={handleMemoryClick}
                      onActivity={handleActivityClick}
                      onShowJupyterModal={() => setIsJupyterModalOpen(true)}
                      getToken={getToken}
                      isAuthenticated={isAuthenticated}
                      hasQuotaError={agentsWithQuotaError.has(agent.id)}
                      onUpgradeClick={() => {
                        setIsHalfwayWarning(false);
                        setIsUpgradeModalOpen(true);
                      }}
                      onSave={handleSaveAgent}
                      isProUser={isProUser}
                      onAIEdit={handleAIEditClick}
                      hostingContext={hostingContext}
                    />
                  </div>
                );
              })}
                </div>
              </div>
            ) : (
                <GetStarted
                  onExploreCommunity={() => setActiveTab('community')}
                  onCreateNewAgent={handleAddAgentClick}
                  onAgentGenerated={handleAgentGenerated}
                  getToken={getToken}
                  isAuthenticated={isAuthenticated}
                  isUsingObServer={isUsingObServer}
                  isPro={isProUser}
                  onSignIn={loginWithRedirect}
                  onSwitchToObServer={() => setIsUsingObServer(true)}
                  onUpgrade={() => {
                    setActiveTab('obServer');
                    setIsUsingObServer(true);
                  }}
                  onRefresh={fetchAgents}
                  onUpgradeClick={() => {
                    setIsHalfwayWarning(false);
                    setIsUpgradeModalOpen(true);
                  }}
                />
            )}
          </div>

          {/* Community Tab */}
          <div className={`px-4 ${activeTab !== 'community' ? 'hidden' : ''}`}>
            <CommunityTab />
          </div>

          {/* Models Tab */}
          {activeTab === 'models' && (
            <div className="px-4">
              <AvailableModels isProUser={isProUser} />
            </div>
          )}

          {/* Recordings Tab */}
          <div className={`px-4 ${activeTab !== 'recordings' ? 'hidden' : ''}`}>
            <RecordingsViewer />
          </div>

          {/* Settings Tab */}
          <div className={`px-4 ${activeTab !== 'settings' ? 'hidden' : ''}`}>
            <SettingsTab />
          </div>

          {/* ObServer Tab */}
          <div className={`px-4 ${activeTab !== 'obServer' ? 'hidden' : ''}`}>
            <ObServerTab />
          </div>

          {/* Fallback for unknown tabs */}
          {!['myAgents', 'community', 'models', 'recordings', 'settings', 'obServer'].includes(activeTab) && (
            <div className="text-center p-8">
              <p className="text-gray-500">This feature is coming soon!</p>
            </div>
          )}
        </main>

        <SimpleCreatorModal
          isOpen={isSimpleCreatorOpen}
          onClose={() => setIsSimpleCreatorOpen(false)}
          onNext={handleSimpleCreatorNext}
          isAuthenticated={isAuthenticated}
          hostingContext={hostingContext}
        />
        <ConversationalGeneratorModal
          isOpen={isConversationalModalOpen}
          onClose={() => {
            setIsConversationalModalOpen(false);
            setAiEditMessage(undefined); // Clear the AI edit message when closing
          }}
          onAgentGenerated={handleAgentGenerated}
          getToken={getToken}
          isAuthenticated={isAuthenticated}
          isUsingObServer={isUsingObServer}
          isPro={isProUser}
          onSignIn={loginWithRedirect}
          onSwitchToObServer={() => setIsUsingObServer(true)}
          onUpgrade={() => {
            setActiveTab('obServer');
            setIsUsingObServer(true);
          }}
          onRefresh={fetchAgents}
          initialMessage={aiEditMessage}
          onUpgradeClick={() => {
            setIsHalfwayWarning(false);
            setIsUpgradeModalOpen(true);
          }}
        />

      {isEditModalOpen && (
        <EditAgentModal
          isOpen={isEditModalOpen}
          onClose={() => {
            setIsEditModalOpen(false);
            setStagedAgentConfig(null);
          }}
          createMode={isCreateMode}
          agent={stagedAgentConfig ? stagedAgentConfig.agent : (selectedAgent ? agents.find(a => a.id === selectedAgent) : undefined)}
          code={stagedAgentConfig ? stagedAgentConfig.code : (selectedAgent ? agentCodes[selectedAgent] : undefined)}
          onSave={handleSaveAgent}
          onImportComplete={fetchAgents}
          setError={setError}
          getToken={getToken}
          isProUser={isProUser}
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

      <footer className="fixed bottom-0 left-0 right-0 bg-white border-t z-[60]">
        <div className="max-w-7xl mx-auto px-4 py-3">
          <div className="flex justify-between items-center">
            <div className="flex space-x-3">
              <button
                className="flex items-center space-x-2 px-4 py-2 bg-gray-100 rounded-md hover:bg-gray-200"
                onClick={() => setShowGlobalLogs(!showGlobalLogs)}
              >
                <Terminal className="h-5 w-5" />
              </button>
            </div>

            <div className="flex items-center space-x-4">
              <span className="text-xs text-gray-500">Support the Project!</span>
              <div className="flex items-center space-x-2">
                <a
                  href="https://discord.gg/wnBb7ZQDUC"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-indigo-500 hover:text-indigo-600"
                  title="Join our Discord community"
                >
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.127 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03z" />
                  </svg>
                </a>

                <a
                  href="https://x.com/AppObserverAI"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-gray-800 hover:text-gray-900"
                  title="Follow us on X (Twitter)"
                >
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.244H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                  </svg>
                </a>

                <a
                  href="https://buymeacoffee.com/roy3838"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-gray-600 hover:text-gray-900"
                  title="Support the project"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" className="h-4 w-4">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                  </svg>
                </a>

                <a
                  href="https://github.com/Roy3838/Observer"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-gray-600 hover:text-gray-900"
                  title="GitHub Repository"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" className="h-4 w-4">
                    <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22" />
                  </svg>
                </a>
              </div>
            </div>
          </div>
        </div>
      </footer>

      {showGlobalLogs && (
        <GlobalLogsViewer
          isOpen={showGlobalLogs}
          onClose={() => setShowGlobalLogs(false)}
        />
      )}

      {activityModalOpen && activityModalAgentId && (
        <AgentActivityModal
          isOpen={activityModalOpen}
          onClose={() => {
            setActivityModalOpen(false);
            setActivityModalAgentId(null);
          }}
          agentId={activityModalAgentId}
          agentName={agents.find(a => a.id === activityModalAgentId)?.name || activityModalAgentId}
          getToken={getToken}
          isAuthenticated={isAuthenticated}
        />
      )}

      {showStartupDialog && (
        <StartupDialogs
          onDismiss={handleDismissStartupDialog}
          onLogin={loginWithRedirect}
          onToggleObServer={() => setIsUsingObServer(true)}
          isAuthenticated={isAuthenticated}
          hostingContext={hostingContext}
        />
      )}

      <TerminalModal
        isOpen={!showStartupDialog && (noModels || isTerminalModalOpen)}
        onClose={() => {
          setNoModels(false);
          setIsTerminalModalOpen(false);
        }}
        onPullComplete={async () => {
          // Refresh models after pulling
          await fetchModels();
        }}
        noModels={noModels}
      />
    </div>
  );
}

export function App() {
  const isAuthDisabled = import.meta.env.VITE_DISABLE_AUTH === 'true';

  Logger.info('AUTH', `is Auth disabled?: ${isAuthDisabled}`);

  if (isAuthDisabled) {
    Logger.info('isAuthDisabled',"Auth0 is disabled for local development.");
    // Even in dev mode, we need the router for consistency
    return (
      <BrowserRouter>
        <Routes>
          <Route path="/*" element={<AppContent />} />
        </Routes>
      </BrowserRouter>
    );
  }

  // This is the main production logic
  return (
    <Auth0Provider
      domain="auth.observer-ai.com"
      clientId="R5iv3RVkWjGZrexFSJ6HqlhSaaGLyFpm"
      authorizationParams={{
        redirect_uri: window.location.origin,
        audience: 'https://api.observer-ai.com',
        scope: 'openid profile email offline_access'
      }}
      cacheLocation="localstorage"
      useRefreshTokens={true}
      useRefreshTokensFallback={true}
      onRedirectCallback={(appState) => {
        window.history.replaceState(
          {},
          document.title,
          appState?.returnTo || window.location.pathname
        );
      }}
    >
      {/* The Router now lives inside the Auth0Provider */}
      {/* This ensures all pages can use the useAuth0() hook */}
      <BrowserRouter>
        <Routes>
          {/* Route 1: The special page for after payment */}
          <Route
            path="/upgrade-success"
            element={<UpgradeSuccessPage />}
          />

          {/* Route 2: The catch-all for your main application */}
          {/* The "/*" means "match any other URL" */}
          <Route
            path="/*"
            element={<AppContent />}
          />
        </Routes>
      </BrowserRouter>
    </Auth0Provider>
  );
}

export default App;
