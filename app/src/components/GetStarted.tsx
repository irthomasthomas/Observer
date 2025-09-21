// src/components/GetStarted.tsx
import React, { useState } from 'react';
import { Users, MessageCircle, Code, User } from 'lucide-react';
import ConversationalGenerator from './AICreator/ConversationalGenerator';
import MultiAgentCreator from './AICreator/MultiAgentCreator';
import { CompleteAgent } from '@utils/agent_database';
import type { TokenProvider } from '@utils/main_loop';


interface GetStartedProps {
  onExploreCommunity: () => void;
  onCreateNewAgent: () => void;
  onAgentGenerated: (agent: CompleteAgent, code: string) => void;
  getToken: TokenProvider;
  isAuthenticated: boolean;
  isUsingObServer: boolean;
  onSignIn?: () => void;
  onSwitchToObServer?: () => void;
  onRefresh?: () => void;
}

const GetStarted: React.FC<GetStartedProps> = ({
  onExploreCommunity,
  onCreateNewAgent,
  onAgentGenerated,
  getToken,
  isAuthenticated,
  isUsingObServer,
  onSignIn,
  onSwitchToObServer,
  onRefresh
}) => {
  const [mode, setMode] = useState<'single' | 'multi'>('single');

  // Handle mode change
  const handleModeChange = (newMode: 'single' | 'multi') => {
    setMode(newMode);
  };

  return (
    <div className="w-full max-w-6xl mx-auto px-4 py-6">
      <div className="flex flex-col md:grid md:grid-cols-3 gap-4 md:gap-6 h-full">
        {/* Main Create Agent Card - Full width on mobile */}
        <div className="flex flex-col md:col-span-2 order-1">
          <div className="h-full bg-white shadow-sm flex flex-col border border-gray-200 rounded-xl">
            <div className="border-b border-gray-200 shrink-0 p-4 md:p-6">
              <div className="flex items-center justify-between mb-4 md:mb-0">
                <div className="flex items-center">
                  <div className="mr-3 bg-blue-50 flex justify-center items-center rounded-lg w-10 h-10">
                    <MessageCircle className="text-blue-600 w-5 h-5" strokeWidth={2} />
                  </div>
                  <div>
                    <h2 className="text-gray-900 text-lg font-semibold">
                      Create Agent
                    </h2>
                    <p className="text-gray-600 text-sm">
                      Describe what you want your agent to do
                    </p>
                  </div>
                </div>
                {/* Mode Toggle - Hidden on mobile, shown on desktop aligned right */}
                <div className="hidden md:flex">
                  <div className="bg-gray-100 rounded-lg p-1 flex">
                    <button
                      onClick={() => handleModeChange('single')}
                      className={`flex items-center px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                        mode === 'single'
                          ? 'bg-white text-blue-600 shadow-sm'
                          : 'text-gray-600 hover:text-blue-600 hover:bg-white/50'
                      }`}
                    >
                      <User className="h-4 w-4 mr-2" />
                      Single Agent
                    </button>
                    <button
                      onClick={() => handleModeChange('multi')}
                      className={`flex items-center px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                        mode === 'multi'
                          ? 'bg-white text-purple-600 shadow-sm'
                          : 'text-gray-600 hover:text-purple-600 hover:bg-white/50'
                      }`}
                    >
                      <Users className="h-4 w-4 mr-2" />
                      Multi-Agent
                    </button>
                  </div>
                </div>
              </div>

              {/* Mode Toggle - Shown on mobile below title */}
              <div className="flex items-center justify-center md:hidden mt-4">
                <div className="bg-gray-100 rounded-lg p-1 flex">
                  <button
                    onClick={() => handleModeChange('single')}
                    className={`flex items-center px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                      mode === 'single'
                        ? 'bg-white text-blue-600 shadow-sm'
                        : 'text-gray-600 hover:text-blue-600 hover:bg-white/50'
                    }`}
                  >
                    <User className="h-4 w-4 mr-2" />
                    Single Agent
                  </button>
                  <button
                    onClick={() => handleModeChange('multi')}
                    className={`flex items-center px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                      mode === 'multi'
                        ? 'bg-white text-purple-600 shadow-sm'
                        : 'text-gray-600 hover:text-purple-600 hover:bg-white/50'
                    }`}
                  >
                    <Users className="h-4 w-4 mr-2" />
                    Multi-Agent
                  </button>
                </div>
              </div>
            </div>
            <div className="flex-1 p-4 md:p-6">
              {mode === 'single' ? (
                <ConversationalGenerator
                  onAgentGenerated={onAgentGenerated}
                  getToken={getToken}
                  isAuthenticated={isAuthenticated}
                  isUsingObServer={isUsingObServer}
                  onSignIn={onSignIn}
                  onSwitchToObServer={onSwitchToObServer}
                />
              ) : (
                <MultiAgentCreator
                  getToken={getToken}
                  isAuthenticated={isAuthenticated}
                  isUsingObServer={isUsingObServer}
                  onSignIn={onSignIn}
                  onSwitchToObServer={onSwitchToObServer}
                  onRefresh={onRefresh}
                />
              )}
            </div>
          </div>
        </div>
        
        {/* Side Cards - Stack below on mobile */}
        <div className="flex flex-col gap-4 order-2">
          {/* Community Card */}
          <div
            onClick={onExploreCommunity}
            className="bg-white shadow-sm cursor-pointer p-4 md:p-6 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors"
          >
            <div className="mb-3 md:mb-4 flex items-center">
              <div className="mr-3 bg-blue-50 flex justify-center items-center rounded-lg w-10 h-10">
                <Users className="text-blue-600 w-5 h-5" strokeWidth={2} />
              </div>
              <h3 className="text-gray-900 font-semibold">
                Community
              </h3>
            </div>
            <p className="text-gray-600 text-sm">
              Browse and use pre-built agents from the community
            </p>
          </div>
          
          {/* Build Custom Card */}
          <div
            onClick={onCreateNewAgent}
            className="bg-white shadow-sm cursor-pointer p-4 md:p-6 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors"
          >
            <div className="mb-3 md:mb-4 flex items-center">
              <div className="mr-3 bg-purple-50 flex justify-center items-center rounded-lg w-10 h-10">
                <Code className="text-purple-600 w-5 h-5" strokeWidth={2} />
              </div>
              <h3 className="text-gray-900 font-semibold">
                Build Custom
              </h3>
            </div>
            <p className="text-gray-600 text-sm">
              Create an agent manually with full control over its behavior
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default GetStarted;
