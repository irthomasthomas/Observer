// src/components/GetStarted.tsx
import React from 'react';
import { Users, MessageCircle, Code } from 'lucide-react';
import ConversationalGenerator from './ConversationalGenerator';
import { CompleteAgent } from '@utils/agent_database';
import type { TokenProvider } from '@utils/main_loop';

interface GetStartedProps {
  onExploreCommunity: () => void;
  onCreateNewAgent: () => void;
  onAgentGenerated: (agent: CompleteAgent, code: string) => void;
  getToken: TokenProvider;
  isAuthenticated: boolean;
  isUsingObServer: boolean;
}

const GetStarted: React.FC<GetStartedProps> = ({
  onExploreCommunity,
  onCreateNewAgent,
  onAgentGenerated,
  getToken,
  isAuthenticated,
  isUsingObServer
}) => {
  return (
    <div className="w-full max-w-6xl mx-auto px-4 py-6">
      <div className="flex flex-col md:grid md:grid-cols-3 gap-4 md:gap-6 h-full">
        {/* Main Create Agent Card - Full width on mobile */}
        <div className="flex flex-col md:col-span-2 order-1">
          <div className="h-full bg-white shadow-sm flex flex-col border border-gray-200 rounded-xl">
            <div className="border-b border-gray-200 shrink-0 p-4 md:p-6">
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
            </div>
            <div className="flex-1 p-4 md:p-6">
              <ConversationalGenerator 
                onAgentGenerated={onAgentGenerated} 
                getToken={getToken}
                isAuthenticated={isAuthenticated}
                isUsingObServer={isUsingObServer}
              />
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
