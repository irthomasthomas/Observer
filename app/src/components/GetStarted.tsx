// src/components/GetStarted.tsx
import React from 'react';
import { Plus, Users, Sparkles } from 'lucide-react';
import ConversationalGenerator from './ConversationalGenerator';
import { CompleteAgent } from '@utils/agent_database';
import type { TokenProvider } from '@utils/main_loop';

interface GetStartedProps {
  onExploreCommunity: () => void;
  onCreateNewAgent: () => void;
  onAgentGenerated: (agent: CompleteAgent, code: string) => void;
  getToken: TokenProvider;
  isAuthenticated: boolean;
}

const GetStarted: React.FC<GetStartedProps> = ({
  onExploreCommunity,
  onCreateNewAgent,
  onAgentGenerated,
  getToken,
  isAuthenticated
}) => {
  return (
    // --- MODIFIED --- Reduced horizontal padding for mobile
    <div className="w-full max-w-5xl mx-auto py-8 px-2 sm:px-4">
      {/* --- MODIFIED --- Reduced padding for mobile */}
      <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl p-4 sm:p-8 shadow-lg border border-indigo-200">
        {/* --- MODIFIED --- Made title text size responsive */}
        <h2 className="text-2xl sm:text-3xl font-bold text-indigo-900 mb-6 sm:mb-8 text-center">Welcome to Observer AI</h2>

        {/* --- MODIFIED --- Reduced bottom margin for mobile */}
        <div className="mb-8 sm:mb-12 max-w-3xl mx-auto">
          
          {/* --- MODIFIED (Desktop Version) --- */}
          {/* This decorative header is now HIDDEN on mobile and visible on sm screens and up */}
          <div className="hidden sm:flex bg-gradient-to-r from-blue-600 to-indigo-600 text-white p-5 rounded-t-xl items-center">
            <Sparkles className="h-6 w-6 mr-3" />
            <div>
              <h3 className="font-medium text-lg">Create a New AI Agent</h3>
              <p className="text-sm text-blue-200">Just tell me what you want to build!</p>
            </div>
          </div>
          
          {/* --- NEW (Mobile Version) --- */}
          
          <ConversationalGenerator 
            onAgentGenerated={onAgentGenerated} 
            getToken={getToken}
            isAuthenticated={isAuthenticated}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-8 max-w-3xl mx-auto">
          <div
            onClick={onExploreCommunity}
            // --- MODIFIED --- Reduced padding for mobile
            className="bg-white border border-indigo-200 rounded-xl p-4 sm:p-6 text-center cursor-pointer hover:bg-indigo-50 transition-transform hover:-translate-y-1 flex flex-col items-center shadow-md"
          >
            {/* --- MODIFIED --- Made icon container smaller for mobile */}
            <div className="w-12 h-12 sm:w-16 sm:h-16 bg-gradient-to-br from-blue-100 to-indigo-100 rounded-full flex items-center justify-center mb-3 sm:mb-4">
              <Users className="h-6 w-6 sm:h-8 sm:w-8 text-indigo-600" />
            </div>
            <h3 className="font-medium text-indigo-800 text-base sm:text-lg">Community Agents</h3>
          </div>
          <div
            onClick={onCreateNewAgent}
            // --- MODIFIED --- Reduced padding for mobile
            className="bg-white border border-indigo-200 rounded-xl p-4 sm:p-6 text-center cursor-pointer hover:bg-indigo-50 transition-transform hover:-translate-y-1 flex flex-col items-center shadow-md"
          >
            {/* --- MODIFIED --- Made icon container smaller for mobile */}
            <div className="w-12 h-12 sm:w-16 sm:h-16 bg-gradient-to-br from-blue-100 to-indigo-100 rounded-full flex items-center justify-center mb-3 sm:mb-4">
              <Plus className="h-6 w-6 sm:h-8 sm:w-8 text-indigo-600" />
            </div>
            <h3 className="font-medium text-indigo-800 text-base sm:text-lg">Build From Scratch</h3>
          </div>
        </div>
      </div>
    </div>
  );
};

export default GetStarted;
