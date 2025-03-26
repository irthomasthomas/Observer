import React, { useState, useEffect } from 'react';
import { Edit, Trash2, MessageCircle, ChevronDown, ChevronUp, Play, Terminal, Code, User, Brain } from 'lucide-react';
import { CompleteAgent } from '@utils/agent_database';
import AgentLogViewer from './AgentLogViewer';
import { isAgentScheduled, getScheduledTime } from './ScheduleAgentModal';
import { isJupyterConnected } from '@utils/handlers/JupyterConfig';

interface AgentCardProps {
  agent: CompleteAgent;
  code?: string;
  isStarting: boolean;
  isMemoryFlashing: boolean;
  onEdit: (agentId: string) => void;
  onDelete: (agentId: string) => Promise<void>;
  onToggle: (agentId: string, status: string) => Promise<void>;
  onSchedule: (agentId: string) => void;
  onMemory: (agentId: string) => void;
  onShowJupyterModal: () => void;
}

const AgentCard: React.FC<AgentCardProps> = ({
  agent,
  code,
  isStarting,
  isMemoryFlashing,
  onEdit,
  onDelete,
  onToggle,
  onSchedule,
  onMemory,
  onShowJupyterModal
}) => {
  const [activityExpanded, setActivityExpanded] = useState(false);
  const [isPythonAgent, setIsPythonAgent] = useState(false);

  // Check if this is a Python agent by examining the code
  useEffect(() => {
    if (code && code.trim().startsWith('#python')) {
      setIsPythonAgent(true);
    } else {
      setIsPythonAgent(false);
    }
  }, [code]);

  const isRunning = agent.status === 'running';
  const primaryColor = isPythonAgent ? 'blue' : 'amber';
  const jupyterConnected = isJupyterConnected();

  const handleToggle = async () => {
    // Only check Jupyter for Python agents that are not running
    if (isPythonAgent && agent.status !== 'running') {
      if (!isJupyterConnected()) {
        onShowJupyterModal();
        return;
      }
    }
    // Proceed with normal toggle if not Python or if Jupyter config is valid
    onToggle(agent.id, agent.status);
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">


      <style>{`
      @keyframes pulse-grow {
        0%, 100% { transform: scale(1); }
        50% { transform: scale(1.15); }
      }
      .animate-pulse-grow {
        animation: pulse-grow 2s ease-in-out infinite;
      }
    `}</style>
      
      {/* Top section with language badge and action button */}
      <div className="p-5 pb-0 flex justify-between items-start">
        {/* Language badge */}
        <div className={`px-4 py-2 rounded-lg text-sm font-medium flex items-center ${
          isPythonAgent 
            ? 'bg-blue-50 text-blue-700' 
            : 'bg-amber-50 text-amber-700'
        }`}>
          {isPythonAgent ? (
            <>
              <Terminal className="w-4 h-4 mr-2" />
              Python
            </>
          ) : (
            <>
              <Code className="w-4 h-4 mr-2" />
              JavaScript
            </>
          )}
        </div>
        
        {/* Action button */}
        <button
          onClick={handleToggle}
          className={`px-6 py-2.5 rounded-lg font-medium flex items-center transition-colors ${
            isStarting
              ? 'bg-yellow-100 text-yellow-700'
              : isRunning
                ? 'bg-red-100 text-red-700 hover:bg-red-200'
                : 'bg-green-100 text-green-700 hover:bg-green-200'
          }`}
        >
          {isRunning ? (
            'Stop'
          ) : (
            <>
              <Play className="w-5 h-5 mr-1" />
              Start
            </>
          )}
        </button>
      </div>
      
      {/* Main content section */}
      <div className="p-5">
        <div className="flex gap-4">
          {/* Agent avatar with User icon */}
          <div className={`w-20 h-20 ${isPythonAgent ? 'bg-blue-100' : 'bg-amber-100'} rounded-full flex items-center justify-center`}>
            <div className={`w-12 h-12 ${isPythonAgent ? 'bg-blue-500' : 'bg-amber-500'} rounded-full flex items-center justify-center ${
              isRunning ? 'animate-pulse-grow' : ''
            }`}>
              <User className="w-7 h-7 text-white" />
            </div>
          </div>
          
          <div className="flex-1">
            {/* Agent name and status */}
            <h3 className="text-2xl font-semibold text-gray-800">{agent.name}</h3>
            <div className="flex items-center mt-1">
              <div className={`w-3 h-3 rounded-full mr-2 ${isRunning ? 'bg-green-500' : 'bg-gray-400'}`}></div>
              <span className="text-sm text-gray-600">{isRunning ? 'Active' : 'Inactive'}</span>
            </div>
            
            {/* Conditional Button: Memory for JS agents, Jupyter status for Python agents */}
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
            
            {/* Agent description */}
            <p className="mt-2 text-gray-600">{agent.description}</p>
            
            {/* Tags */}
            <div className="mt-4 flex flex-wrap gap-2">
              <div className="px-3 py-1 bg-gray-100 rounded-lg text-sm text-gray-600">
                {agent.model_name}
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
            
            {/* Action buttons */}
            <div className="mt-5 flex gap-3">
              <button
                onClick={() => onEdit(agent.id)}
                className={`px-5 py-2 rounded-lg flex items-center ${
                  isRunning ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                }`}
                disabled={isRunning}
              >
                <Edit className="w-4 h-4 mr-2" /> Edit
              </button>
              <button
                onClick={() => onDelete(agent.id)}
                className={`px-5 py-2 rounded-lg flex items-center ${
                  isRunning ? 'bg-red-50 text-red-300 cursor-not-allowed' : 'bg-red-50 hover:bg-red-100 text-red-600'
                }`}
                disabled={isRunning}
              >
                <Trash2 className="w-4 h-4 mr-2" /> Delete
              </button>
              
              {/* Memory button could be added here if needed */}
            </div>
          </div>
        </div>
      </div>
      
      {/* Activity section */}
      <div>
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
            <AgentLogViewer agentId={agent.id} expanded={true} />
          </div>
        )}
      </div>
    </div>
  );
};

export default AgentCard;
