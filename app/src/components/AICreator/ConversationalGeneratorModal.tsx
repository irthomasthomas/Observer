// src/components/AICreator/ConversationalGeneratorModal.tsx
import React, { useMemo, useCallback, useState, useEffect } from 'react';
import { X, Sparkles, Bell, FlaskConical } from 'lucide-react';
import ConversationalGenerator from './ConversationalGenerator';
import MultiAgentCreator from './MultiAgentCreator';
// CompleteAgent import removed - no longer needed
import type { TokenProvider } from '@utils/main_loop';


interface ConversationalGeneratorModalProps {
  isOpen: boolean;
  onClose: () => void;
  getToken: TokenProvider;
  isAuthenticated: boolean;
  isUsingObServer: boolean;
  isPro?: boolean;
  onSignIn?: () => void;
  onSwitchToObServer?: () => void;
  onUpgrade?: () => void;
  onRefresh?: () => void;
  initialMessage?: string;
  initialMode?: 'single' | 'multi';
  onUpgradeClick?: () => void;
}

const ConversationalGeneratorModal: React.FC<ConversationalGeneratorModalProps> = ({
  isOpen,
  onClose,
  getToken,
  isAuthenticated,
  isUsingObServer,
  isPro = false,
  onSignIn,
  onSwitchToObServer,
  onUpgrade,
  onRefresh,
  initialMessage,
  onUpgradeClick
}) => {
  // Default to multi-agent mode when we have an initial message (editing existing agents)
  const [mode, setMode] = useState<'single' | 'multi'>(initialMessage ? 'multi' : 'single');

  // Watch for changes to initialMessage and update mode accordingly
  useEffect(() => {
    setMode(initialMessage ? 'multi' : 'single');
  }, [initialMessage]);

  // Handle mode change - allow toggle but multi-agent will be greyed out if not Pro
  const handleModeChange = (newMode: 'single' | 'multi') => {
    setMode(newMode);
  };

  // Handle save completion for both Alert Builder and AI-Studio
  const handleSaveComplete = useCallback(() => {
    // Agent is already saved and refreshed, just close the modal
    // App.tsx will detect first agent and start tutorial automatically
    onClose();
  }, [onClose]);


  // Memoize the props to ensure they're stable across renders
  const conversationalProps = useMemo(() => ({
    onSaveComplete: handleSaveComplete,
    getToken,
    isAuthenticated,
    isUsingObServer,
    onSignIn,
    onSwitchToObServer,
    onUpgradeClick,
    onRefresh
  }), [handleSaveComplete, getToken, isAuthenticated, isUsingObServer, onSignIn, onSwitchToObServer, onUpgradeClick, onRefresh]);

  const handleUpgrade = useCallback(() => {
    onUpgrade?.();
    onClose();
  }, [onUpgrade, onClose]);

  const multiAgentProps = useMemo(() => ({
    onSaveComplete: handleSaveComplete,
    getToken,
    isAuthenticated,
    isUsingObServer,
    isPro,
    onSignIn,
    onSwitchToObServer,
    onUpgrade: handleUpgrade,
    onRefresh,
    initialMessage
  }), [handleSaveComplete, getToken, isAuthenticated, isUsingObServer, isPro, onSignIn, onSwitchToObServer, handleUpgrade, onRefresh, initialMessage]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-[70] p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Modal Header */}
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white p-4">
          <div className="flex items-center justify-between mb-3 md:mb-0">
            <div className="flex items-center">
              <Sparkles className="h-6 w-6 mr-3" />
              <h3 className="font-semibold text-lg">Create Agent</h3>
            </div>
            <div className="flex items-center gap-4">
              {/* Mode Toggle - Hidden on mobile, shown on desktop aligned right */}
              <div className="hidden md:flex">
                <div className="bg-white/20 rounded-lg p-1 flex">
                  <button
                    onClick={() => handleModeChange('single')}
                    className={`flex items-center px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                      mode === 'single'
                        ? 'bg-white text-blue-600 shadow-sm'
                        : 'text-white/80 hover:text-white hover:bg-white/10'
                    }`}
                  >
                    <Bell className="h-4 w-4 mr-2" />
                    Alert Builder 
                  </button>
                  <button
                    onClick={() => handleModeChange('multi')}
                    className={`flex items-center px-3 py-2 rounded-md text-sm font-medium transition-colors relative ${
                      mode === 'multi'
                        ? 'bg-white text-purple-600 shadow-sm'
                        : 'text-white/80 hover:text-white hover:bg-white/10'
                    }`}
                    title={!isPro ? 'Pro feature - Upgrade to access Multi-Agent creation' : ''}
                  >
                    <FlaskConical className="h-4 w-4 mr-2" />
                    AI-Studio
                  </button>
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-1 rounded-full text-white hover:bg-white/20 transition-colors"
                aria-label="Close modal"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          {/* Mode Toggle - Shown on mobile below title */}
          <div className="flex items-center justify-center md:hidden mt-3">
            <div className="bg-white/20 rounded-lg p-1 flex">
              <button
                onClick={() => handleModeChange('single')}
                className={`flex items-center px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                  mode === 'single'
                    ? 'bg-white text-blue-600 shadow-sm'
                    : 'text-white/80 hover:text-white hover:bg-white/10'
                }`}
              >
                <Bell className="h-4 w-4 mr-2" />
                Alert Builder
              </button>
              <button
                onClick={() => handleModeChange('multi')}
                className={`flex items-center px-3 py-2 rounded-md text-sm font-medium transition-colors relative ${
                  mode === 'multi'
                    ? 'bg-white text-purple-600 shadow-sm'
                    : 'text-white/80 hover:text-white hover:bg-white/10'
                }`}
                title={!isPro ? 'Pro feature - Upgrade to access Multi-Agent creation' : ''}
              >
                <FlaskConical className="h-4 w-4 mr-2" />
                AI-Studio
              </button>
            </div>
          </div>
        </div>

        {/* The Generator Component is placed inside the modal body */}
        <div className="flex-1 bg-gray-50">
          {mode === 'single' ? (
            <ConversationalGenerator {...conversationalProps} />
          ) : (
            <MultiAgentCreator {...multiAgentProps} />
          )}
        </div>
      </div>
    </div>
  );
};

export default ConversationalGeneratorModal;
