// src/components/GetStarted.tsx
import React, { useState } from 'react';
import { Users, MessageCircle, Plus, Trash2 } from 'lucide-react';
import MCP from './AICreator/MCP';
import type { TokenProvider } from '@utils/main_loop';
import { useMCPContext } from '../mcp/MCPContext';
import { SensorSettings } from '@utils/settings';


interface GetStartedProps {
  onExploreCommunity: () => void;
  onCreateNewAgent: () => void;
  getToken: TokenProvider;
  isAuthenticated: boolean;
  isUsingObServer: boolean;
  onSignIn?: () => void;
  onSwitchToObServer?: () => void;
  onUpgrade?: () => void;
  onRefresh?: () => void;
  onUpgradeClick?: () => void;
}

const GetStarted: React.FC<GetStartedProps> = ({
  onExploreCommunity,
  onCreateNewAgent,
  getToken,
  isAuthenticated,
  isUsingObServer,
  onSignIn,
  onSwitchToObServer,
  onUpgrade,
  onRefresh,
  onUpgradeClick: _onUpgradeClick,
}) => {
  const { clear, isRunning } = useMCPContext();
  const [yolo, setYolo] = useState(() => SensorSettings.getMcpYoloMode());

  const toggleYolo = () => {
    const next = !yolo;
    SensorSettings.setMcpYoloMode(next);
    setYolo(next);
  };

  return (
    <div className="w-full max-w-6xl mx-auto">
      <div className="flex flex-col md:grid md:grid-cols-3 gap-4 md:gap-4 lg:gap-6 h-full">
        {/* Main Create Agent Card - Full width on mobile */}
        <div className="flex flex-col md:col-span-2 order-1" data-tutorial-ai-creator>
          <div className="h-full bg-white shadow-sm flex flex-col border-0 md:border border-gray-200 rounded-none md:rounded-xl">
            <div className="border-b border-gray-200 shrink-0 p-4 md:p-6">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="bg-blue-50 flex justify-center items-center rounded-lg w-10 h-10 shrink-0">
                    <MessageCircle className="text-blue-600 w-5 h-5" strokeWidth={2} />
                  </div>
                  <div>
                    <h2 className="text-gray-900 text-lg font-semibold">
                      Create Agent
                    </h2>
                    <p className="hidden md:block text-gray-600 text-sm">
                      Describe what you want your agent to do
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={toggleYolo}
                    title={yolo ? 'Yolo mode on — auto-approves all actions' : 'Yolo mode off'}
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-gray-700 px-1"
                  >
                    Yolo
                    <span className={`relative inline-flex h-4 w-7 shrink-0 rounded-full transition-colors duration-200 ${yolo ? 'bg-amber-400' : 'bg-gray-200'}`}>
                      <span className={`inline-block h-3 w-3 rounded-full bg-white shadow transition-transform duration-200 self-center ${yolo ? 'translate-x-3.5' : 'translate-x-0.5'}`} />
                    </span>
                  </button>
                  <button
                    onClick={clear}
                    disabled={isRunning}
                    title="Clear conversation"
                    className="inline-flex items-center gap-1 px-2 py-1.5 text-xs text-gray-400 rounded-md hover:bg-gray-100 hover:text-gray-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
            <div className="flex-1 p-0 md:p-6">
              <MCP
                onSaveComplete={() => {/* Agent saved, tutorial will start automatically */}}
                getToken={getToken}
                isAuthenticated={isAuthenticated}
                isUsingObServer={isUsingObServer}
                onSignIn={onSignIn}
                onSwitchToObServer={onSwitchToObServer}
                onUpgrade={onUpgrade}
                onRefresh={onRefresh}
              />
            </div>
          </div>
        </div>

        {/* Side Cards - Stack below on mobile */}
        <div className="flex flex-row md:flex-col gap-2 md:gap-4 order-2 px-4 md:px-0">
          {/* Community Card */}
          <div
            onClick={onExploreCommunity}
            className="flex-1 md:flex-initial bg-white shadow-sm cursor-pointer p-3 md:p-6 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors flex flex-col justify-center"
          >
            <div className="md:mb-4 flex items-center justify-center md:justify-start">
              <div className="mr-3 bg-blue-50 flex justify-center items-center rounded-lg w-10 h-10 shrink-0">
                <Users className="text-blue-600 w-5 h-5" strokeWidth={2} />
              </div>
              <h3 className="text-gray-900 font-semibold">
                Community
              </h3>
            </div>
            <p className="hidden md:block text-gray-600 text-sm">
              Browse and use pre-built agents from the community
            </p>
          </div>

          {/* Build Custom Card */}
          <div
            onClick={onCreateNewAgent}
            data-tutorial-build-custom
            className="flex-1 md:flex-initial bg-white shadow-sm cursor-pointer p-3 md:p-6 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors flex flex-col justify-center"
          >
            <div className="md:mb-4 flex items-center justify-center md:justify-start -translate-x-[10px] md:translate-x-0">
              <div className="mr-3 bg-purple-50 flex justify-center items-center rounded-lg w-10 h-10 shrink-0">
                <Plus className="text-purple-600 w-5 h-5" strokeWidth={2} />
              </div>
              <h3 className="text-gray-900 font-semibold">
                <span className="md:hidden">Create</span>
                <span className="hidden md:inline">Create Agent</span>
              </h3>
            </div>
            <p className="hidden md:block text-gray-600 text-sm">
              Create an agent manually with full control over its behavior
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default GetStarted;
