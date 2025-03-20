// src/components/GetStarted.tsx
import React, { useState } from 'react';
import { Plus, Users, Sparkles } from 'lucide-react';
import GenerateAgent from './GenerateAgent';

interface GetStartedProps {
  onExploreCommunity: () => void;
  onCreateNewAgent: () => void;
  onAgentImported?: () => void;
}

// Trending agent examples
const TRENDING_AGENTS = [
  { id: 'activity_tracking_agent', name: 'Activity Tracking Agent', description: 'Monitors and logs your computer activities' },
  { id: 'command_tracking_agent', name: 'Command Tracking Agent', description: 'Logs terminal commands you execute' },
  { id: 'multimodal_activity_tracking', name: 'Multimodal Activity Tracking', description: 'Tracks activities with text and visual analysis' }
];

const GetStarted: React.FC<GetStartedProps> = ({ 
  onExploreCommunity, 
  onCreateNewAgent,
  onAgentImported
}) => {
  const [importingAgentId, setImportingAgentId] = useState<string | null>(null);
  const [showAiGenerator, setShowAiGenerator] = useState<boolean>(false);
  
  const handleImport = async (agentId: string) => {
    setImportingAgentId(agentId);
    // Simulate import process
    setTimeout(() => {
      setImportingAgentId(null);
      onAgentImported?.();
      alert(`Agent imported successfully!`);
    }, 1000);
  };
  
  return (
    <div className="w-full max-w-5xl mx-auto py-8 px-4">
      <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl p-8 shadow-sm">
        <h2 className="text-2xl font-bold text-blue-800 mb-4 text-center">Welcome to Observer AI</h2>
        
        <p className="text-blue-700 mb-8 text-center max-w-3xl mx-auto">
          Create agents that can observe, analyze, and respond to what's happening on your screen.
          Get started with just a few clicks!
        </p>
        
        {/* AI Agent Generator - Main Focus */}
        <div className="mb-10 max-w-3xl mx-auto">
          <div className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white p-4 rounded-t-lg flex items-center">
            <Sparkles className="h-5 w-5 mr-2" />
            <div>
              <h3 className="font-medium">AI Agent Generator</h3>
              <p className="text-sm opacity-90">
                Describe what you need in plain English
              </p>
            </div>
          </div>
          
          <div className="bg-white p-5 rounded-b-lg shadow-sm">
            {showAiGenerator ? (
              <GenerateAgent />
            ) : (
              <div className="flex">
                <input
                  type="text"
                  placeholder="Example: An agent that detects when I'm viewing sensitive documents..."
                  className="flex-1 p-3 border border-gray-300 rounded-l-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-700"
                  onClick={() => setShowAiGenerator(true)}
                  readOnly
                />
                <button
                  className="px-5 py-3 bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-r-md hover:from-green-600 hover:to-emerald-700 font-medium transition-colors"
                  onClick={() => setShowAiGenerator(true)}
                >
                  Generate
                </button>
              </div>
            )}
          </div>
        </div>
        
        {/* Two Options Side by Side */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-10 max-w-3xl mx-auto">
          {/* Browse Community Option */}
          <div 
            onClick={onExploreCommunity}
            className="bg-white border border-blue-100 rounded-lg p-5 text-center cursor-pointer hover:bg-blue-50 transition-colors flex flex-col items-center shadow-sm"
          >
            <div className="w-14 h-14 bg-blue-100 rounded-full flex items-center justify-center mb-3">
              <Users className="h-7 w-7 text-blue-600" />
            </div>
            <h3 className="font-medium text-blue-800 text-lg">Browse Community Agents</h3>
            <p className="text-gray-600 mt-2">
              Discover and import ready-made agents from the community library
            </p>
          </div>
          
          {/* Create New Option */}
          <div 
            onClick={onCreateNewAgent}
            className="bg-white border border-blue-100 rounded-lg p-5 text-center cursor-pointer hover:bg-blue-50 transition-colors flex flex-col items-center shadow-sm"
          >
            <div className="w-14 h-14 bg-blue-100 rounded-full flex items-center justify-center mb-3">
              <Plus className="h-7 w-7 text-blue-600" />
            </div>
            <h3 className="font-medium text-blue-800 text-lg">Create Custom Agent</h3>
            <p className="text-gray-600 mt-2">
              Build an agent from scratch with full control over all settings
            </p>
          </div>
        </div>
        
        {/* Trending agents section */}
        <div className="max-w-3xl mx-auto">
          <h4 className="text-xl font-semibold text-blue-800 mb-4">Popular Agents</h4>
          
          <div className="grid grid-cols-1 gap-3">
            {TRENDING_AGENTS.map(agent => (
              <div 
                key={agent.id} 
                className="flex items-center justify-between p-4 border border-blue-100 rounded-lg bg-white shadow-sm hover:bg-blue-50 transition-colors"
              >
                <div className="flex-1">
                  <h4 className="font-medium text-blue-900">{agent.name}</h4>
                  <p className="text-sm text-gray-600">{agent.description}</p>
                </div>
                <button
                  onClick={() => handleImport(agent.id)}
                  disabled={importingAgentId === agent.id}
                  className={`px-4 py-2 rounded-md text-white transition-colors ${
                    importingAgentId === agent.id
                      ? 'bg-gray-400'
                      : 'bg-blue-600 hover:bg-blue-700'
                  }`}
                  title="Import this agent"
                >
                  {importingAgentId === agent.id ? 'Importing...' : 'Import'}
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default GetStarted;
