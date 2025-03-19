import React, { useState } from 'react';
import { Edit2, Trash2, Clock, Brain, MessageCircle, ChevronDown, ChevronUp, User } from 'lucide-react';
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
  const [detailsExpanded, setDetailsExpanded] = useState(false); // Default to collapsed
  const [activityExpanded, setActivityExpanded] = useState(false);

  return (
    <div className="bg-white rounded-lg shadow-md overflow-hidden border border-gray-100">
      {/* Header */}
      <div className="px-4 py-3 flex justify-between items-center">
        <div className="flex items-center">
          <div className="flex flex-col items-center mr-3">
            <div 
              className="p-2 rounded-full bg-blue-100 hover:bg-blue-200 transition-all mb-2"
              title={detailsExpanded ? "Hide details" : "Show details"}
            >
              <User 
                className="h-7 w-7 text-blue-600 cursor-pointer hover:text-blue-800 transition-colors" 
                onClick={() => setDetailsExpanded(!detailsExpanded)}
              />
            </div>
            <div 
              className="p-2 rounded-full bg-purple-100 hover:bg-purple-200 transition-all"
              title="View memory"
            >
              <Brain 
                className={`h-7 w-7 text-purple-600 cursor-pointer hover:text-purple-800 transition-colors ${isMemoryFlashing ? 'animate-pulse' : ''}`} 
                onClick={() => onMemory(agent.id)}
              />
            </div>
          </div>
          <div>
            <h3 className="text-xl font-semibold text-gray-800">{agent.name}</h3>
            <div className="flex items-center">
              <div className={`h-2.5 w-2.5 rounded-full mr-2 ${
                agent.status === 'running' ? 'bg-green-500' : 'bg-gray-400'
              }`}></div>
              <span className="text-sm text-gray-600">
                {agent.status === 'running' ? 'Active' : 'Inactive'}
              </span>
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <button
            onClick={() => onToggle(agent.id, agent.status)}
            className={`px-4 py-2 rounded-md text-base font-medium ${
              isStarting
                ? 'bg-yellow-100 text-yellow-700'
                : agent.status === 'running'
                  ? 'bg-red-100 text-red-700 hover:bg-red-200'
                  : 'bg-green-100 text-green-700 hover:bg-green-200'
            }`}
          >
            {isStarting
              ? 'Starting...'
              : agent.status === 'running'
                ? 'Stop'
                : 'Start'}
          </button>
        </div>
      </div>

      {/* Collapsible Details Section */}
      {detailsExpanded && (
        <>
          {/* Model and Update interval badges */}
          <div className="px-4 py-3 border-t border-b bg-gray-50">
            <div className="flex flex-wrap gap-3">
              <div className="text-sm px-3 py-1 bg-blue-50 rounded-full text-blue-700">
                {agent.model_name}
              </div>
              
              <div className="text-sm px-3 py-1 bg-purple-50 rounded-full text-purple-700">
                Updates every {agent.loop_interval_seconds}s
              </div>
              
              {isAgentScheduled(agent.id) && (
                <div className="text-sm px-3 py-1 bg-yellow-50 rounded-full text-yellow-700">
                  Scheduled: {getScheduledTime(agent.id)?.toLocaleString()}
                </div>
              )}
            </div>
          </div>
          
          {/* Description */}
          <div className="px-4 py-3 border-b">
            <p className="text-gray-700">{agent.description}</p>
          </div>
          
          {/* Action buttons */}
          <div className="px-4 py-3 border-b flex flex-wrap gap-2">
            <button
              onClick={() => onEdit(agent.id)}
              className={`px-4 py-2 rounded-md flex items-center ${
                agent.status === 'running' ? 'opacity-50 cursor-not-allowed bg-gray-50' : 'bg-gray-100 hover:bg-gray-200'
              }`}
              disabled={agent.status === 'running'}
            >
              <Edit2 className="h-5 w-5 mr-1" /> Edit
            </button>
            
            <button
              onClick={() => onSchedule(agent.id)}
              className={`px-4 py-2 rounded-md flex items-center ${
                isAgentScheduled(agent.id) ? 'bg-yellow-100 hover:bg-yellow-200' : 'bg-gray-100 hover:bg-gray-200'
              }`}
            >
              <Clock className="h-5 w-5 mr-1" /> Schedule
            </button>
            
            <button
              onClick={() => onDelete(agent.id)}
              className="px-4 py-2 rounded-md flex items-center ml-auto bg-red-50 text-red-600 hover:bg-red-100"
              disabled={agent.status === 'running'}
            >
              <Trash2 className="h-5 w-5 mr-1" /> Delete
            </button>
          </div>
        </>
      )}

      {/* Activity button - visible even when details are collapsed */}
      <div className="px-4 py-3 border-b">
        <button
          onClick={() => setActivityExpanded(!activityExpanded)}
          className="flex items-center gap-2 w-full"
        >
          <MessageCircle className="h-5 w-5 text-blue-600" />
          <span className="text-lg font-medium">Activity</span>
          <div className="ml-auto">
            {activityExpanded ? 
              <ChevronUp className="h-5 w-5 text-gray-500" /> : 
              <ChevronDown className="h-5 w-5 text-gray-500" />
            }
          </div>
        </button>
      </div>

      {/* Activity area */}
      {activityExpanded && (
        <div className="bg-white border-t p-4">
          <AgentLogViewer agentId={agent.id} expanded={true} />
        </div>
      )}
    </div>
  );
};

// Parent grid component for handling card layout
export const AgentCardGrid: React.FC<{ agents: CompleteAgent[] }> = ({ agents }) => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {agents.map(agent => (
        <div key={agent.id} className="h-fit">
          <AgentCard 
            agent={agent}
            isStarting={false}
            isMemoryFlashing={false}
            onEdit={() => {}}
            onDelete={async () => {}}
            onToggle={async () => {}}
            onSchedule={() => {}}
            onMemory={() => {}}
          />
        </div>
      ))}
    </div>
  );
};

export default AgentCard;
