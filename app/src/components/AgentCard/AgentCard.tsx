// components/AgentCard/AgentCard.tsx
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Zap } from 'lucide-react';
import { CompleteAgent } from '@utils/agent_database';
import { isJupyterConnected } from '@utils/handlers/JupyterConfig';
import { listModels } from '@utils/ollamaServer';
import { getOllamaServerAddress } from '@utils/main_loop';
import { AGENT_ITERATION_START_EVENT, AGENT_WAITING_START_EVENT, AGENT_ITERATION_SKIPPED_EVENT } from '@utils/TimerEventManager';
import { Logger, LogEntry } from '@utils/logging';
import { StreamManager, StreamState } from '@utils/streamManager';

// Import the new modular components
import AgentCardHeader from './AgentCardHeader';
import AgentCardFooter from './AgentCardFooter';
import ActiveAgentView from './ActiveAgentView';
import StaticAgentView from './StaticAgentView';

// REMOVED: getCommunicationWarnings function is no longer needed.

const QuotaErrorView: React.FC<{ onUpgradeClick: () => void }> = ({ onUpgradeClick }) => (
  <div className="mt-4 p-4 bg-orange-50 border-l-4 border-orange-400 rounded-r-lg animate-fade-in">
    <div className="flex items-start">
      <Zap className="h-6 w-6 text-orange-500 mr-3 flex-shrink-0" />
      <div>
        <h4 className="font-bold text-orange-800">Daily Limit Reached</h4>
        <p className="text-sm text-orange-700 mt-1">You've used all free cloud credits. The agent has been paused.</p>
      </div>
    </div>
    <button onClick={onUpgradeClick} className="w-full mt-4 px-4 py-2 text-sm font-bold rounded-md text-white bg-purple-600 hover:bg-purple-700">
      Upgrade to Pro
    </button>
  </div>
);

type AgentLiveStatus = 'STARTING' | 'CAPTURING' | 'THINKING' | 'WAITING' | 'IDLE';

interface AgentCardProps {
  agent: CompleteAgent;
  code?: string;
  isRunning: boolean;
  isStarting: boolean;
  isMemoryFlashing: boolean;
  onEdit: (agentId: string) => void;
  onDelete: (agentId: string) => Promise<void>;
  onToggle: (agentId: string, isRunning: boolean) => Promise<void>;
  onMemory: (agentId: string) => void;
  onActivity: (agentId: string) => void;
  onShowJupyterModal: () => void;
  getToken: () => Promise<string | undefined>;
  isAuthenticated: boolean;
  hasQuotaError: boolean;
  onUpgradeClick: () => void;
  onSave: (agent: CompleteAgent, code: string) => Promise<void>;
}


const AgentCard: React.FC<AgentCardProps> = ({
  agent, code, isRunning, isStarting, isMemoryFlashing, onEdit, onDelete, onToggle,
  onMemory, onActivity, onShowJupyterModal, hasQuotaError, onUpgradeClick, onSave
}) => {
  const [isPythonAgent, setIsPythonAgent] = useState(false);
  const [startWarning, setStartWarning] = useState<string | null>(null);
  const [isCheckingModel, setIsCheckingModel] = useState(false);
  const [liveStatus, setLiveStatus] = useState<AgentLiveStatus>('IDLE');
  const [lastResponse, setLastResponse] = useState<string>('...');
  const [responseKey, setResponseKey] = useState(0);
  const [loopProgress, setLoopProgress] = useState(0);
  const [lastProgressUpdate, setLastProgressUpdate] = useState(0);
  const [currentModel, setCurrentModel] = useState(agent.model_name);
  const initialModelRef = useRef(agent.model_name);

  const showStartingState = useMemo(() => isStarting || isCheckingModel, [isStarting, isCheckingModel]);
  const isLive = useMemo(() => (isRunning || showStartingState) && !hasQuotaError, [isRunning, showStartingState, hasQuotaError]);

  const [streams, setStreams] = useState<StreamState>({
    cameraStream: null, screenVideoStream: null, screenAudioStream: null, microphoneStream: null, allAudioStream: null
  });

  // REMOVED: communicationWarnings memo is no longer needed.

  useEffect(() => { setIsPythonAgent(!!code && code.trim().startsWith('#python')); }, [code]);
  useEffect(() => { setCurrentModel(agent.model_name); initialModelRef.current = agent.model_name; }, [agent.model_name]);

  useEffect(() => {
    if (currentModel !== initialModelRef.current && onSave && code !== undefined) {
      onSave({ ...agent, model_name: currentModel }, code);
      initialModelRef.current = currentModel;
    }
  }, [currentModel, agent, code, onSave]);

  useEffect(() => {
    StreamManager.addListener(setStreams);
    return () => StreamManager.removeListener(setStreams);
  }, []);

  useEffect(() => {
    if (hasQuotaError) {
      setLiveStatus('IDLE');
      setLastResponse('Agent paused due to daily credit limit.');
      return;
    }
    if (showStartingState && !isRunning) {
        setLiveStatus('STARTING');
        setLastResponse('Agent is preparing to start...');
        return;
    }
    if (isRunning) {
      if (liveStatus === 'STARTING' || liveStatus === 'IDLE') {
        setLiveStatus('CAPTURING');
        // Reset progress when agent starts
        setLoopProgress(0);
        setLastProgressUpdate(0);
      }
      const handleNewLog = (log: LogEntry) => {
        if (log.source !== agent.id) return;
        if (log.details?.logType === 'model-prompt') setLiveStatus('THINKING');
        else if (log.details?.logType === 'model-response') {
          setLiveStatus('WAITING');
          setLastResponse(log.details.content as string);
          setResponseKey(key => key + 1);
        }
      };
      Logger.addListener(handleNewLog);
      return () => Logger.removeListener(handleNewLog);
    } else {
      setLiveStatus('IDLE');
    }
  }, [isRunning, showStartingState, agent.id, liveStatus, hasQuotaError]);

  useEffect(() => {
    let progressTimer: NodeJS.Timeout | null = null;
    let nextIterationTime = 0;
    let intervalMs = 0;

    const handleWaitingStart = (event: CustomEvent) => {
      if (event.detail.agentId !== agent.id) return;
      nextIterationTime = event.detail.nextIterationTime;
      intervalMs = event.detail.intervalMs;
      
      // Start progress timer
      progressTimer = setInterval(() => {
        const now = Date.now();
        const elapsed = now - (nextIterationTime - intervalMs);
        const progress = Math.min(100, Math.max(0, (elapsed / intervalMs) * 100));
        setLoopProgress(progress);
        setLastProgressUpdate(now);
      }, 50); // Update more frequently for smoothness
    };

    const handleIterationStart = (event: CustomEvent) => {
      if (event.detail.agentId !== agent.id) return;
      if (progressTimer) {
        clearInterval(progressTimer);
        progressTimer = null;
      }
      setLoopProgress(0);
    };

    const handleIterationSkipped = (event: CustomEvent) => {
      if (event.detail.agentId !== agent.id) return;
      nextIterationTime = event.detail.nextIterationTime;
      intervalMs = event.detail.intervalMs;
      // Continue showing progress for next possible iteration
    };

    if (isRunning && !hasQuotaError) {
      window.addEventListener(AGENT_WAITING_START_EVENT as any, handleWaitingStart);
      window.addEventListener(AGENT_ITERATION_START_EVENT as any, handleIterationStart);
      window.addEventListener(AGENT_ITERATION_SKIPPED_EVENT as any, handleIterationSkipped);
    }

    return () => {
      if (progressTimer) clearInterval(progressTimer);
      window.removeEventListener(AGENT_WAITING_START_EVENT as any, handleWaitingStart);
      window.removeEventListener(AGENT_ITERATION_START_EVENT as any, handleIterationStart);
      window.removeEventListener(AGENT_ITERATION_SKIPPED_EVENT as any, handleIterationSkipped);
    };
  }, [isRunning, hasQuotaError, agent.id]);

  const handleToggle = async () => {
    if (isRunning) {
      setStartWarning(null);
      onToggle(agent.id, true);
      return;
    }

    setStartWarning(null);
    setIsCheckingModel(true);

    if (!currentModel) {
      setStartWarning(`Please select a model for this agent.`);
      setIsCheckingModel(false);
      return;
    }

    try {
      const serverDetails = getOllamaServerAddress();
      if (!serverDetails.host || !serverDetails.port) throw new Error("Ollama server not configured.");
      const modelsResponse = await listModels(serverDetails.host, serverDetails.port);
      if (modelsResponse.error || !modelsResponse.models.some(m => m.name === currentModel)) {
        setStartWarning(`Model "${currentModel}" is not available. Check server or edit agent.`);
        setIsCheckingModel(false);
        return;
      }
    } catch (e) {
      setStartWarning(`Error verifying model: ${e instanceof Error ? e.message : String(e)}.`);
      setIsCheckingModel(false);
      return;
    }

    if (isPythonAgent && !isJupyterConnected()) {
      onShowJupyterModal();
      setIsCheckingModel(false);
      return;
    }

    setIsCheckingModel(false);
    onToggle(agent.id, false);
  };

  return (
    <div className="relative bg-white rounded-xl shadow-sm border border-gray-200 transition-all duration-300 flex flex-col">
      {isRunning && (liveStatus === 'WAITING' || liveStatus === 'THINKING') && 
       (Date.now() - lastProgressUpdate < 5000) && ( // Hide if progress hasn't updated in 5 seconds
        <div className="absolute top-0 left-0 right-0 h-1 z-10">
          <div className="h-full bg-green-500" style={{ width: `${loopProgress}%`, transition: 'width 0.1s linear' }} />
        </div>
      )}

      <div className="p-5 flex-grow">
        <AgentCardHeader
          agentName={agent.name}
          isRunning={isRunning}
          isStarting={showStartingState}
          hasQuotaError={hasQuotaError}
          isLive={isLive}
          onToggle={handleToggle}
        />

        <div>
          {hasQuotaError ? (
            <QuotaErrorView onUpgradeClick={onUpgradeClick} />
          ) : isLive ? (
            <ActiveAgentView
              streams={streams}
              liveStatus={liveStatus}
              lastResponse={lastResponse}
              responseKey={responseKey}
            />
          ) : (
            // FIX: Pass the 'code' prop down to StaticAgentView
            <StaticAgentView
              agent={agent}
              code={code} // This prop is now correctly passed
              isPythonAgent={isPythonAgent}
              currentModel={currentModel}
              onModelChange={setCurrentModel}
              startWarning={startWarning}
              // REMOVED: communicationWarnings prop is gone
            />
          )}
        </div>
      </div>

      <AgentCardFooter
        agentId={agent.id}
        isPythonAgent={isPythonAgent}
        isJupyterConnected={isJupyterConnected()}
        isMemoryFlashing={isMemoryFlashing}
        onEdit={onEdit}
        onDelete={onDelete}
        onMemory={onMemory}
        onActivity={onActivity}
        onShowJupyterModal={onShowJupyterModal}
      />
    </div>
  );
};

export default AgentCard;
