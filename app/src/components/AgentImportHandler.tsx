// src/components/AgentImportHandler.tsx

import { PlusCircle, RotateCw, Sparkles } from 'lucide-react';

interface AgentImportHandlerProps {
  onAddAgent: () => void;
  onGenerateAgent: () => void;
  agentCount: number;
  activeAgentCount: number;
  isRefreshing: boolean;
  onRefresh: () => void;
}

const AgentImportHandler = ({
  onAddAgent,
  onGenerateAgent,
  agentCount,
  activeAgentCount,
  isRefreshing,
  onRefresh
}: AgentImportHandlerProps) => {

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-2">
          <button onClick={onRefresh} className="p-2 rounded-md hover:bg-gray-100" disabled={isRefreshing} title="Refresh agents">
            <RotateCw className={`h-5 w-5 ${isRefreshing ? 'animate-spin' : ''}`} />
          </button>
          {/* --- MODIFIED --- */}
          {/* Wrapped labels in spans that are hidden on mobile */}
          <p className="text-sm font-medium">
            <span className="hidden sm:inline">Active: </span>
            {activeAgentCount} / <span className="hidden sm:inline">Total: </span>{agentCount}
          </p>
        </div>
        
        <div className="flex items-center space-x-2 sm:space-x-3"> {/* Adjusted spacing for mobile */}
          <button
            onClick={onGenerateAgent}
            // --- MODIFIED ---
            // Adjusted padding for mobile and hid the span
            className="flex items-center space-x-2 px-3 sm:px-4 py-2 bg-purple-500 text-white rounded-md hover:bg-purple-600"
          >
            <Sparkles className="h-5 w-5" />
            <span className="hidden sm:inline">Generate Agent</span>
          </button>

          <button
            onClick={onAddAgent}
            // --- MODIFIED ---
            // Adjusted padding for mobile and hid the span
            className="flex items-center space-x-2 px-3 sm:px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600"
          >
            <PlusCircle className="h-5 w-5" />
            <span className="hidden sm:inline">Create Agent</span>
          </button>
        </div>
      </div>
    </>
  );
};

export default AgentImportHandler;
