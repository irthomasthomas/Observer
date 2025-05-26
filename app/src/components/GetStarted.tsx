// src/components/GetStarted.tsx
import React, { useState } from 'react';
import { Plus, Users, Sparkles, Terminal, Code } from 'lucide-react';
import GenerateAgent from './GenerateAgent';

// Fixed model for GetStarted page
const FIXED_MODEL = 'gemini-2.5-flash-preview-04-17';

interface GetStartedProps {
  onExploreCommunity: () => void;
  onCreateNewAgent: () => void;
}

const GetStarted: React.FC<GetStartedProps> = ({
  onExploreCommunity,
  onCreateNewAgent,
}) => {
  const [showAiGenerator, setShowAiGenerator] = useState<boolean>(false);
  const [agentType, setAgentType] = useState<'browser' | 'python'>('browser');


  return (
    <div className="w-full max-w-5xl mx-auto py-8 px-4">
      <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl p-8 shadow-lg border border-indigo-200">
        <h2 className="text-3xl font-bold text-indigo-900 mb-8 text-center">Observer AI Command Center</h2>

        <div className="flex justify-center mb-8">
          <div className="bg-white rounded-full p-1 flex shadow-md border border-indigo-200">
            <button
              onClick={() => setAgentType('browser')}
              className={`px-6 py-3 rounded-full flex items-center transition-all ${
                agentType === 'browser'
                  ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md'
                  : 'text-indigo-800 hover:bg-indigo-50'
              }`}
            >
              <Code className="h-5 w-5 mr-2" />
              Browser Agent
            </button>
            <button
              onClick={() => setAgentType('python')}
              className={`px-6 py-3 rounded-full flex items-center transition-all ${
                agentType === 'python'
                  ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md'
                  : 'text-indigo-800 hover:bg-indigo-50'
              }`}
            >
              <Terminal className="h-5 w-5 mr-2" />
              System Agent
            </button>
          </div>
        </div>

        <div className="mb-6 text-center min-h-[20px]">
          {agentType === 'browser' ? (
            null
          ) : (
            <p className="text-sm text-indigo-700">
              <span className="text-indigo-600 font-medium bg-indigo-100 px-3 py-1 rounded-full">Requires Jupyter server setup</span>
            </p>
          )}
        </div>

        {/* AI Agent Generator Section */}
        <div className="mb-12 max-w-3xl mx-auto">
          <div className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white p-5 rounded-t-xl flex items-center">
            <Sparkles className="h-6 w-6 mr-3" />
            <div>
              <h3 className="font-medium text-lg">
                {agentType === 'browser' ? 'Create AI Browser Agent' : 'Create AI System Agent'}
              </h3>
            </div>
          </div>

          <div className="bg-white p-6 rounded-b-xl shadow-md border-x border-b border-indigo-200">
            {showAiGenerator ? (
              <GenerateAgent agentType={agentType} modelName={FIXED_MODEL} />
            ) : (
              <div className="flex">
                <input
                  type="text"
                  placeholder={agentType === 'browser'
                    ? "Describe your agent: e.g., Monitor for sensitive documents..."
                    : "Describe your agent: e.g., Save screenshots of specific applications..."
                  }
                  className="flex-1 p-4 border border-indigo-300 rounded-l-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-gray-700"
                  onClick={() => setShowAiGenerator(true)}
                  readOnly
                />
                <button
                  className="px-6 py-4 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-r-lg hover:from-blue-700 hover:to-indigo-700 font-medium transition-colors flex items-center"
                  onClick={() => setShowAiGenerator(true)}
                >
                  <Sparkles className="h-4 w-4 mr-2" />
                  Generate
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Browse Community and Create Custom options */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 max-w-3xl mx-auto">
          <div
            onClick={onExploreCommunity}
            className="bg-white border border-indigo-200 rounded-xl p-6 text-center cursor-pointer hover:bg-indigo-50 transition-transform hover:-translate-y-1 flex flex-col items-center shadow-md"
          >
            <div className="w-16 h-16 bg-gradient-to-br from-blue-100 to-indigo-100 rounded-full flex items-center justify-center mb-4">
              <Users className="h-8 w-8 text-indigo-600" />
            </div>
            <h3 className="font-medium text-indigo-800 text-lg">Community Agents</h3>
          </div>

          <div
            onClick={onCreateNewAgent}
            className="bg-white border border-indigo-200 rounded-xl p-6 text-center cursor-pointer hover:bg-indigo-50 transition-transform hover:-translate-y-1 flex flex-col items-center shadow-md"
          >
            <div className="w-16 h-16 bg-gradient-to-br from-blue-100 to-indigo-100 rounded-full flex items-center justify-center mb-4">
              <Plus className="h-8 w-8 text-indigo-600" />
            </div>
            <h3 className="font-medium text-indigo-800 text-lg">Custom Agent</h3>
          </div>
        </div>
      </div>
    </div>
  );
};

export default GetStarted;
