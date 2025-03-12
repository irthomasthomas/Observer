
// src/components/GetStarted.tsx

import React, { useState, useEffect } from 'react';
import { Logger } from '@utils/logging';
import { saveAgent, CompleteAgent } from '@utils/agent_database';

interface MarketplaceAgent {
  id: string;
  name: string;
  description: string;
  model_name: string;
  system_prompt: string;
  loop_interval_seconds: number;
  code?: string;
  memory?: string;
  author?: string;
  author_id?: string;
  date_added?: string;
}

interface GetStartedProps {
  onExploreCommunity: () => void;
  onCreateNewAgent: () => void;
  /**
   * Optional callback to refresh local agents after import.
   * For example, you can re-fetch the local DB so the new agent shows up.
   */
  onAgentImported?: () => void;
}

const SERVER_URL = 'https://api.observer-ai.com';

// Hard-coded trending agent IDs
const TRENDING_AGENT_IDS = [
  'activity_tracking_agent',
  'command_tracking_agent',
  'focus_tracker'
];

const GetStarted: React.FC<GetStartedProps> = ({ 
  onExploreCommunity, 
  onCreateNewAgent, 
  onAgentImported 
}) => {
  const [trendingAgents, setTrendingAgents] = useState<MarketplaceAgent[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [importingAgentId, setImportingAgentId] = useState<string | null>(null);

  useEffect(() => {
    const fetchAgents = async () => {
      try {
        setIsLoading(true);
        setError(null);

        const response = await fetch(`${SERVER_URL}/agents`);
        if (!response.ok) {
          throw new Error(`Server returned ${response.status}`);
        }

        const data: MarketplaceAgent[] = await response.json();
        // Filter out only the trending agents using hard-coded IDs
        const trending = data.filter(agent => TRENDING_AGENT_IDS.includes(agent.id));
        setTrendingAgents(trending);
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        setError(`Failed to fetch trending agents: ${errorMessage}`);
        Logger.error('GET_STARTED', `Error fetching agents: ${errorMessage}`, err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchAgents();
  }, []);

  const handleImport = async (agent: MarketplaceAgent) => {
    try {
      setError(null);
      setImportingAgentId(agent.id);
      Logger.info('GET_STARTED', `Importing trending agent: ${agent.name} (${agent.id})`);

      // Prepare agent for local DB using CompleteAgent structure
      const localAgent: CompleteAgent = {
        id: `community_${agent.id}`, // Add prefix to avoid ID conflicts
        name: `${agent.name} (Community)`,
        description: agent.description,
        status: 'stopped',
        model_name: agent.model_name,
        system_prompt: agent.system_prompt,
        loop_interval_seconds: agent.loop_interval_seconds,
      };

      // Save agent to local database with its code
      await saveAgent(localAgent, agent.code || '');

      // If you want to import memory as well, do so here:
      if (agent.memory) {
        const { updateAgentMemory } = await import('@utils/agent_database');
        await updateAgentMemory(localAgent.id, agent.memory);
      }

      alert(`Agent "${agent.name}" imported successfully!`);
      Logger.info('GET_STARTED', `Trending agent ${agent.name} imported successfully`);

      // Refresh local agent list so it shows up right away
      onAgentImported?.();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(`Failed to import agent: ${errorMessage}`);
      Logger.error('GET_STARTED', `Error importing agent: ${errorMessage}`, err);
    } finally {
      setImportingAgentId(null);
    }
  };

  return (
    <div className="col-span-full text-center py-10">
      <div className="bg-blue-50 rounded-lg p-6 max-w-2xl mx-auto">
        <h3 className="text-xl font-semibold text-blue-800 mb-3">Ready to Get Started?</h3>
        <p className="text-blue-600 mb-6">
          You don't have any agents yet. Explore the Community tab to discover pre-built agents, 
          or create your own custom agent from scratch.
        </p>

        {/* Buttons for exploring community or creating a new agent */}
        <div className="flex flex-col sm:flex-row justify-center gap-4">
          <button 
            onClick={onExploreCommunity} 
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors flex items-center justify-center"
          >
            Browse Community Agents
          </button>
          <button 
            onClick={onCreateNewAgent} 
            className="px-4 py-2 bg-white border border-blue-600 text-blue-600 rounded-md hover:bg-blue-50 transition-colors flex items-center justify-center"
          >
            Create New Agent
          </button>
        </div>

        {/* Trending agents section */}
        <div className="mt-8">
          <h4 className="text-lg font-semibold text-blue-800 mb-4">Trending Agents</h4>
          {isLoading ? (
            <div className="text-blue-600">Loading trending agents...</div>
          ) : error ? (
            <div className="text-red-600">{error}</div>
          ) : trendingAgents.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {trendingAgents.map(agent => (
                <div 
                  key={agent.id} 
                  className="flex items-center justify-between p-3 border rounded-md bg-white"
                >
                  <h4 className="text-sm font-medium">{agent.name}</h4>
                  <button
                    onClick={() => handleImport(agent)}
                    disabled={importingAgentId === agent.id}
                    className="px-3 py-1 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                    title="Import this agent"
                  >
                    {/* Show an hourglass if importing, otherwise the download emoji */}
                    {importingAgentId === agent.id ? '⏳' : '⬇️'}
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-gray-500">No trending agents available</div>
          )}
        </div>
      </div>
    </div>
  );
};

export default GetStarted;
