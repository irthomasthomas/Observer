import React from 'react';
import { Edit2, Trash2, Clock, Brain } from 'lucide-react';
import { CompleteAgent } from '@utils/agent_database';
import AgentLogViewer from './AgentLogViewer';
import { isAgentScheduled, getScheduledTime } from './ScheduleAgentModal';

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
}

const AgentCard: React.FC<AgentCardProps> = ({
  agent,
  isStarting,
  isMemoryFlashing,
  onEdit,
  onDelete,
  onToggle,
  onSchedule,
  onMemory
}) => {
  return (
    <div className="bg-white rounded-lg shadow-md p-4">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold">{agent.name}</h3>
        <div className="flex space-x-2">
          <button
            onClick={() => onEdit(agent.id)}
            className={`p-2 rounded-md hover:bg-gray-100 ${
              agent.status === 'running' ? 'opacity-50 cursor-not-allowed' : ''
            }`}
            disabled={agent.status === 'running'}
            title="Edit agent"
          >
            <Edit2 className="h-5 w-5" />
          </button>
          <button
            onClick={() => onDelete(agent.id)}
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
          onClick={() => onToggle(agent.id, agent.status)}
          className={`px-4 py-2 rounded-md ${
            isStarting
              ? 'bg-yellow-500 text-white hover:bg-yellow-600'
              : agent.status === 'running'
                ? 'bg-red-500 text-white hover:bg-red-600'
                : 'bg-green-500 text-white hover:bg-green-600'
          }`}
        >
          {isStarting
            ? '⏳ Starting Up'
            : agent.status === 'running'
              ? '⏹ Stop'
              : '▶️ Start'}
        </button>

        <div className="text-sm bg-gray-100 px-2 py-1 rounded">
          {agent.loop_interval_seconds}s
        </div>

        <button
          onClick={() => onSchedule(agent.id)}
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
          onClick={() => onMemory(agent.id)}
          className={`p-2 rounded-md hover:bg-purple-100 ${
            isMemoryFlashing ? 'animate-pulse' : ''
          }`}
          title="View and edit agent memory"
        >
          <Brain className={`h-5 w-5 ${
            isMemoryFlashing 
              ? 'text-purple-600 animate-pulse' 
              : 'text-purple-600'
          }`} />
        </button>
      </div>

      {/* Agent-specific log viewer */}
      <AgentLogViewer agentId={agent.id} />
    </div>
  );
};

export default AgentCard;
