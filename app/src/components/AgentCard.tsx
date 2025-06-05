// src/components/AgentCard.tsx
import React, { useState, useEffect } from 'react';
import { Edit, Trash2, MessageCircle, ChevronDown, ChevronUp, Play, Terminal, Code, User, Brain, AlertTriangle } from 'lucide-react';
import { CompleteAgent } from '@utils/agent_database';
import AgentLogViewer from './AgentLogViewer';
import { isAgentScheduled, getScheduledTime } from './ScheduleAgentModal';
import { isJupyterConnected } from '@utils/handlers/JupyterConfig';
import { listModels } from '@utils/ollamaServer'; // Import listModels directly
import { getOllamaServerAddress } from '@utils/main_loop'; // To get current server details
import { Logger } from '@utils/logging'; // For logging

interface AgentCardProps {
  agent: CompleteAgent;
  code?: string;
  isRunning: boolean;
  isStarting: boolean;
  isMemoryFlashing: boolean;
  onEdit: (agentId: string) => void;
  onDelete: (agentId: string) => Promise<void>;
  onToggle: (agentId: string, isRunning: boolean) => Promise<void>; // This is the prop to call after checks
  onMemory: (agentId: string) => void;
  onShowJupyterModal: () => void;
}

const AgentCard: React.FC<AgentCardProps> = ({
  agent,
  code,
  isRunning,
  isStarting, // This prop is controlled by the parent (App.tsx)
  isMemoryFlashing,
  onEdit,
  onDelete,
  onToggle,
  onMemory,
  onShowJupyterModal
}) => {
  const [activityExpanded, setActivityExpanded] = useState(false);
  const [isPythonAgent, setIsPythonAgent] = useState(false);
  const [startWarning, setStartWarning] = useState<string | null>(null);
  const [isCheckingModel, setIsCheckingModel] = useState(false); // Local state for model check loading

  useEffect(() => {
    if (code && code.trim().startsWith('#python')) {
      setIsPythonAgent(true);
    } else {
      setIsPythonAgent(false);
    }
  }, [code]);

  useEffect(() => {
    setStartWarning(null);
  }, [agent.model_name, isRunning]);

  const jupyterConnected = isJupyterConnected();

  const handleToggle = async () => {
    // If we are trying to start the agent
    if (!isRunning) {
      setStartWarning(null); // Clear previous warning
      setIsCheckingModel(true); // Indicate model check is in progress

      // 1. Check if a model is configured for the agent
      const agentModelName = agent.model_name;
      if (!agentModelName || agentModelName.trim() === "") {
        setStartWarning(`This agent needs a model configured. Please edit the agent to select a model.`);
        setIsCheckingModel(false);
        return;
      }

      // 2. Fetch the current list of available models from the server
      let isModelAvailable = false;
      try {
        // Get current server details. Ensure getOllamaServerAddress handles local/ObServer.
        // The isUsingObServer flag would typically come from a context or parent state,
        // but for a direct call, we might assume it's reflecting the currently configured server.
        // For simplicity, if your getOllamaServerAddress doesn't need a flag and just reads current config, that's fine.
        const serverDetails = getOllamaServerAddress(); // Adapt if it needs a flag like isUsingObServer

        if (!serverDetails.host || !serverDetails.port) {
            throw new Error("Ollama server details (host/port) not configured.");
        }

        Logger.info(agent.id, `Checking model availability for "${agentModelName}" on ${serverDetails.host}:${serverDetails.port}`);
        const modelsResponse = await listModels(serverDetails.host, serverDetails.port);

        if (modelsResponse.error) {
          Logger.warn(agent.id, `Error fetching models for check: ${modelsResponse.error}`);
          // Fallback: if we can't fetch models, we can't confirm availability.
          // You might decide to proceed or block. Blocking is safer.
          setStartWarning(
            `Could not verify model availability. Error: ${modelsResponse.error}. Please check server connection.`
          );
          setIsCheckingModel(false);
          return;
        }

        isModelAvailable = modelsResponse.models.some(model => model.name === agentModelName);

      } catch (e) {
        const errorMsg = e instanceof Error ? e.message : String(e);
        Logger.error(agent.id, `Exception while checking model availability: ${errorMsg}`);
        setStartWarning(
          `Could not verify model availability due to an error: ${errorMsg}.`
        );
        setIsCheckingModel(false);
        return;
      }

      if (!isModelAvailable) {
        setStartWarning(
          `Model "${agentModelName}" is not available on the current inference server. ` +
          `Please check server settings or edit the agent to select an available model.`
        );
        setIsCheckingModel(false);
        return;
      }

      // 3. Jupyter connection check for Python agents
      if (isPythonAgent) {
        if (!isJupyterConnected()) {
          onShowJupyterModal();
          setIsCheckingModel(false);
          return;
        }
      }

      setIsCheckingModel(false); // Finished checks
      // If all checks passed, proceed with the toggle action passed from the parent
      onToggle(agent.id, isRunning);

    } else {
      // If stopping the agent
      setStartWarning(null);
      onToggle(agent.id, isRunning); // Call the parent's toggle function
    }
  };

  // Combine parent's isStarting with local isCheckingModel for button state
  const showStartingState = isStarting || isCheckingModel;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      <style>{`
      /* ... (your existing styles) ... */
      `}</style>
      
      <div className="p-5 pb-0 flex justify-between items-start">
        {/* ... (language badge) ... */}
        <div className={`px-4 py-2 rounded-lg text-sm font-medium flex items-center ${
          isPythonAgent 
            ? 'bg-blue-50 text-blue-700' 
            : 'bg-amber-50 text-amber-700'
        }`}>
          {isPythonAgent ? (
            <><Terminal className="w-4 h-4 mr-2" /> Python</>
          ) : (
            <><Code className="w-4 h-4 mr-2" /> JavaScript</>
          )}
        </div>
        
        <button
          onClick={handleToggle}
          className={`px-6 py-2.5 rounded-lg font-medium flex items-center transition-colors ${
            showStartingState // Use combined state
              ? 'bg-yellow-100 text-yellow-700 cursor-wait'
              : isRunning
                ? 'bg-red-100 text-red-700 hover:bg-red-200'
                : 'bg-green-100 text-green-700 hover:bg-green-200'
          }`}
          disabled={showStartingState} // Use combined state
        >
          {showStartingState ? ( // Use combined state
            <>
              <div className="w-5 h-5 border-2 border-yellow-700 border-t-transparent rounded-full animate-spin mr-2" />
              {isCheckingModel ? 'Checking...' : 'Starting...'} {/* Differentiate checking vs actual starting */}
            </>
          ) : isRunning ? (
            'Stop'
          ) : (
            <><Play className="w-5 h-5 mr-1" />Start</>
          )}
        </button>
      </div>
      
      <div className="p-5">
        {/* ... (rest of the card content: avatar, name, status, description) ... */}
        <div className="flex gap-4">
          <div className={`w-20 h-20 ${isPythonAgent ? 'bg-blue-100' : 'bg-amber-100'} rounded-full flex items-center justify-center`}>
            <div className={`w-12 h-12 ${isPythonAgent ? 'bg-blue-500' : 'bg-amber-500'} rounded-full flex items-center justify-center ${
              isRunning && !showStartingState ? 'animate-pulse-grow' : '' // Only pulse if truly running
            }`}>
              <User className="w-7 h-7 text-white" />
            </div>
          </div>
          
          <div className="flex-1">
            <h3 className="text-2xl font-semibold text-gray-800">{agent.name}</h3>
            <div className="flex items-center mt-1">
              <div className={`w-3 h-3 rounded-full mr-2 ${isRunning && !showStartingState ? 'bg-green-500' : 'bg-gray-400'}`}></div>
              <span className="text-sm text-gray-600">{isRunning && !showStartingState ? 'Active' : 'Inactive'}</span>
            </div>
            
            {isPythonAgent ? (
              <div className={`mt-1 flex items-center ${
                jupyterConnected 
                  ? 'text-green-600 hover:text-green-800' 
                  : 'text-red-600 hover:text-red-800'
              }`}>
                <Terminal className="h-5 w-5 mr-1" />
                <span className="text-sm">Jupyter {jupyterConnected ? 'Connected' : 'Disconnected'}</span>
              </div>
            ) : (
              <button 
                onClick={() => onMemory(agent.id)}
                className="mt-1 text-purple-600 hover:text-purple-800 flex items-center"
              >
                <Brain className={`h-5 w-5 mr-1 ${isMemoryFlashing ? 'animate-pulse' : ''}`} />
                <span className="text-sm">Memory</span>
              </button>
            )}
            
            <p className="mt-2 text-gray-600">{agent.description}</p>

            {startWarning && (
              <div className="mt-3 p-3 bg-yellow-50 border border-yellow-300 text-yellow-700 rounded-md text-sm shadow-sm">
                <div className="flex items-center">
                  <AlertTriangle className="h-5 w-5 mr-2 flex-shrink-0" />
                  <span>{startWarning}</span>
                </div>
              </div>
            )}
            
            <div className="mt-4 flex flex-wrap gap-2">
              {/* ... (tags) ... */}
              <div className="px-3 py-1 bg-gray-100 rounded-lg text-sm text-gray-600">
                {agent.model_name || "No model set"}
              </div>
              <div className="px-3 py-1 bg-gray-100 rounded-lg text-sm text-gray-600">
                {agent.loop_interval_seconds}s
              </div>
              {isAgentScheduled(agent.id) && (
                <div className="px-3 py-1 bg-yellow-50 rounded-lg text-sm text-yellow-700">
                  Scheduled: {getScheduledTime(agent.id)?.toLocaleString()}
                </div>
              )}
            </div>
            
            <div className="mt-5 flex gap-3">
              {/* ... (action buttons: Edit, Delete) ... */}
              <button
                onClick={() => onEdit(agent.id)}
                className={`px-5 py-2 rounded-lg flex items-center ${
                  isRunning || showStartingState ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                }`}
                disabled={isRunning || showStartingState}
              >
                <Edit className="w-4 h-4 mr-2" /> Edit
              </button>
              <button
                onClick={() => onDelete(agent.id)}
                className={`px-5 py-2 rounded-lg flex items-center ${
                  isRunning || showStartingState ? 'bg-red-50 text-red-300 cursor-not-allowed' : 'bg-red-50 hover:bg-red-100 text-red-600'
                }`}
                disabled={isRunning || showStartingState}
              >
                <Trash2 className="w-4 h-4 mr-2" /> Delete
              </button>
            </div>
          </div>
        </div>
      </div>
      
      <div>
        {/* ... (activity section) ... */}
         <button
          onClick={() => setActivityExpanded(!activityExpanded)}
          className="w-full px-5 py-4 flex items-center border-t border-gray-100 hover:bg-gray-50 transition-colors"
        >
          <MessageCircle className="w-6 h-6 text-blue-500 mr-2" />
          <span className="text-xl font-medium">Activity</span>
          <div className="ml-auto">
            {activityExpanded ? 
              <ChevronUp className="w-5 h-5 text-gray-400" /> :
              <ChevronDown className="w-5 h-5 text-gray-400" />
            }
          </div>
        </button>
        
        {activityExpanded && (
          <div className="border-t border-gray-100 p-4">
            <AgentLogViewer agentId={agent.id}/>
          </div>
        )}
      </div>
    </div>
  );
};

export default AgentCard;
