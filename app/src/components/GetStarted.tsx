// src/components/GetStarted.tsx
import React, { useState } from 'react';
import { Plus, Users, Sparkles, Terminal, Code } from 'lucide-react';
import GenerateAgent from './GenerateAgent';

interface GetStartedProps {
  onExploreCommunity: () => void;
  onCreateNewAgent: () => void;
  onAgentImported?: () => void;
}

const GetStarted: React.FC<GetStartedProps> = ({ 
  onExploreCommunity, 
  onCreateNewAgent,
  onAgentImported
}) => {
  const [importingAgentId, setImportingAgentId] = useState<string | null>(null);
  const [showAiGenerator, setShowAiGenerator] = useState<boolean>(false);
  const [agentType, setAgentType] = useState<'browser' | 'python'>('browser');
  
  const handleImport = async (agentId: string) => {
    setImportingAgentId(agentId);
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
        
        <p className="text-blue-700 mb-6 text-center max-w-3xl mx-auto">
          Create agents that can observe, analyze, and respond to what's happening on your screen.
        </p>
        
        {/* Agent Type Toggle */}
        <div className="flex justify-center mb-6">
          <div className="bg-white rounded-lg p-1 flex shadow-sm border border-blue-100">
            <button
              onClick={() => setAgentType('browser')}
              className={`px-4 py-2 rounded-md flex items-center transition-colors ${
                agentType === 'browser' 
                  ? 'bg-blue-600 text-white' 
                  : 'text-blue-800 hover:bg-blue-50'
              }`}
            >
              <Code className="h-4 w-4 mr-2" />
              Browser Agent
            </button>
            <button
              onClick={() => setAgentType('python')}
              className={`px-4 py-2 rounded-md flex items-center transition-colors ${
                agentType === 'python' 
                  ? 'bg-blue-600 text-white' 
                  : 'text-blue-800 hover:bg-blue-50'
              }`}
            >
              <Terminal className="h-4 w-4 mr-2" />
              System Agent
            </button>
          </div>
        </div>
        
        {/* Agent Type Description */}
        <div className="mb-6 text-center">
          {agentType === 'browser' ? (
            <p className="text-sm text-blue-700">
              Browser agents run in your browser and can monitor and log activities.
            </p>
          ) : (
            <p className="text-sm text-blue-700">
              System agents run on your computer with Python and can perform actions on your system.
              <br />
              <span className="text-blue-600 font-medium">Requires Jupyter server setup.</span>
            </p>
          )}
        </div>
        
        {/* AI Agent Generator */}
        <div className="mb-10 max-w-3xl mx-auto">
          <div className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white p-4 rounded-t-lg flex items-center">
            <Sparkles className="h-5 w-5 mr-2" />
            <div>
              <h3 className="font-medium">
                {agentType === 'browser' ? 'AI Browser Agent Generator' : 'AI System Agent Generator'}
              </h3>
              <p className="text-sm opacity-90">
                Describe what you need in plain English
              </p>
            </div>
          </div>
          
          <div className="bg-white p-5 rounded-b-lg shadow-sm">
            {showAiGenerator ? (
              <GenerateAgent agentType={agentType} />
            ) : (
              <div className="flex">
                <input
                  type="text"
                  placeholder={agentType === 'browser' 
                    ? "Example: An agent that detects when I'm viewing sensitive documents..." 
                    : "Example: An agent that saves screenshots when I open specific applications..."
                  }
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
        
        {/* Browse Community and Create Custom options */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-10 max-w-3xl mx-auto">
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
      </div>
    </div>
  );
};

export default GetStarted;
