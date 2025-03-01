// src/components/CommunityTab.tsx
import React, { useState, useEffect } from 'react';
import { Download, RefreshCw } from 'lucide-react';
import { saveAgent } from '@utils/agent_database';
import { Logger } from '@utils/logging';

// Simple type for marketplace agents
interface MarketplaceAgent {
  id: string;
  name: string;
  description: string;
  model_name: string;
  system_prompt: string;
  loop_interval_seconds: number;
  code: string;
  memory: string;
}

const CommunityTab: React.FC = () => {
  const [agents, setAgents] = useState<MarketplaceAgent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Server URL - update this to your Python backend address
  const SERVER_URL = 'http://localhost:8000';
  
  const fetchAgents = async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      const response = await fetch(`${SERVER_URL}/agents`);
      
      if (!response.ok) {
        throw new Error(`Server returned ${response.status}`);
      }
      
      const data = await response.json();
      setAgents(data);
      
      Logger.info('COMMUNITY', `Fetched ${data.length} agents from marketplace`);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(`Failed to fetch community agents: ${errorMessage}`);
      Logger.error('COMMUNITY', `Error fetching marketplace agents: ${errorMessage}`, err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAgents();
  }, []);

  const handleImport = async (agent: MarketplaceAgent) => {
    try {
      setError(null);
      Logger.info('COMMUNITY', `Importing agent ${agent.name} (${agent.id})`);
      
      // Prepare agent for local database
      const localAgent = {
        id: `community_${agent.id}`,  // Add prefix to avoid conflicts
        name: `${agent.name} (Community)`,
        description: agent.description,
        status: 'stopped' as const,
        model_name: agent.model_name,
        system_prompt: agent.system_prompt,
        loop_interval_seconds: agent.loop_interval_seconds
      };
      
      // Save to local database
      await saveAgent(localAgent, agent.code);
      
      // Import memory if available
      if (agent.memory) {
        const { updateAgentMemory } = await import('@utils/agent_database');
        await updateAgentMemory(localAgent.id, agent.memory);
      }
      
      Logger.info('COMMUNITY', `Agent ${agent.name} imported successfully`);
      alert(`Agent "${agent.name}" imported successfully!`);
      
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(`Failed to import agent: ${errorMessage}`);
      Logger.error('COMMUNITY', `Error importing agent: ${errorMessage}`, err);
    }
  };

  return (
    <div className="mt-4">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold">Community Agents</h2>
        <button 
          onClick={fetchAgents}
          className="flex items-center space-x-2 px-3 py-2 bg-blue-100 text-blue-700 rounded-md hover:bg-blue-200"
          disabled={isLoading}
        >
          <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>
      
      {error && (
        <div className="mb-4 p-4 bg-red-100 text-red-700 rounded-md">
          {error}
        </div>
      )}
      
      {isLoading ? (
        <div className="text-center p-8">
          <div className="inline-block animate-spin mr-2">
            <RefreshCw className="h-6 w-6 text-blue-500" />
          </div>
          <span>Loading community agents...</span>
        </div>
      ) : agents.length === 0 ? (
        <div className="text-center p-8 bg-gray-50 rounded-md">
          <p className="text-gray-500">No community agents available</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {agents.map(agent => (
            <div key={agent.id} className="bg-white rounded-lg shadow-md p-4">
              <div className="flex justify-between items-center mb-2">
                <h3 className="text-lg font-semibold">{agent.name}</h3>
                <button
                  onClick={() => handleImport(agent)}
                  className="p-2 rounded-md hover:bg-blue-100 text-blue-600"
                  title="Import agent"
                >
                  <Download className="h-5 w-5" />
                </button>
              </div>
              
              <span className="inline-block px-2 py-1 bg-blue-100 text-blue-700 text-sm rounded-full mb-2">
                {agent.model_name}
              </span>
              
              <p className="text-sm text-gray-600 mt-2">{agent.description}</p>
              
              {agent.system_prompt && (
                <div className="mt-2 p-2 bg-gray-50 rounded text-xs text-gray-600 max-h-20 overflow-y-auto">
                  <strong>System Prompt:</strong> {agent.system_prompt.substring(0, 100)}
                  {agent.system_prompt.length > 100 && '...'}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default CommunityTab;
