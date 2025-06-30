// src/components/ConversationalGeneratorModal.tsx
import React from 'react';
import { X, Sparkles } from 'lucide-react';
import ConversationalGenerator from './ConversationalGenerator';
import { CompleteAgent } from '@utils/agent_database';
import type { TokenProvider } from '@utils/main_loop';

interface ConversationalGeneratorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAgentGenerated: (agent: CompleteAgent, code: string) => void;
  getToken: TokenProvider;
}

const ConversationalGeneratorModal: React.FC<ConversationalGeneratorModalProps> = ({
  isOpen,
  onClose,
  onAgentGenerated,
  getToken,
}) => {
  if (!isOpen) return null;

  // This function handles the final step: it passes the generated agent
  // up to the App component and then closes this modal.
  const handleAgentReady = (agent: CompleteAgent, code: string) => {
    onAgentGenerated(agent, code);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Modal Header */}
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white p-4 flex items-center justify-between">
          <div className="flex items-center">
            <Sparkles className="h-6 w-6 mr-3" />
            <h3 className="font-semibold text-lg">AI Agent Builder</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-full text-white hover:bg-white/20 transition-colors"
            aria-label="Close modal"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* The Conversational Component is placed inside the modal body */}
        <div className="flex-1 bg-gray-50">
          <ConversationalGenerator 
          onAgentGenerated={handleAgentReady}
          getToken={getToken}
          />
        </div>
      </div>
    </div>
  );
};

export default ConversationalGeneratorModal;
