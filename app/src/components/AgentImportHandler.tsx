// src/components/AgentImportHandler.tsx

import { PlusCircle, RotateCw, Sparkles } from 'lucide-react';

interface AgentImportHandlerProps {
  onAddAgent: () => void;
  // ✨ 1. Add the new prop for the generator button
  onGenerateAgent: () => void;
  agentCount: number;
  activeAgentCount: number;
  isRefreshing: boolean;
  onRefresh: () => void;
}

const AgentImportHandler = ({
  onAddAgent,
  onGenerateAgent, // ✨ 2. Use the new prop
  agentCount,
  activeAgentCount,
  isRefreshing,
  onRefresh
}: AgentImportHandlerProps) => {

  // ✨ 3. All local modal state and old imports are now removed.
  
  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-2">
          <button onClick={onRefresh} className="p-2 rounded-md hover:bg-gray-100" disabled={isRefreshing} title="Refresh agents">
            <RotateCw className={`h-5 w-5 ${isRefreshing ? 'animate-spin' : ''}`} />
          </button>
          <p className="text-sm font-medium">Active: {activeAgentCount} / Total: {agentCount}</p>
        </div>
        
        <div className="flex items-center space-x-3">
          <button
            // ✨ 4. The button now calls the prop passed down from App.tsx
            onClick={onGenerateAgent}
            className="flex items-center space-x-2 px-4 py-2 bg-purple-500 text-white rounded-md hover:bg-purple-600"
          >
            <Sparkles className="h-5 w-5" />
            <span>Generate Agent</span>
          </button>

          <button
            onClick={onAddAgent}
            className="flex items-center space-x-2 px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600"
          >
            <PlusCircle className="h-5 w-5" />
            <span>Create Agent</span>
          </button>
        </div>
      </div>
      
      {/* ✨ 5. The old <GenerateAgentModal> is removed from here. */}
    </>
  );
};

export default AgentImportHandler;
