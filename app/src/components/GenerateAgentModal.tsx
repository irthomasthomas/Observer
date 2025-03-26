// GenerateAgentModal.tsx
import React, { useState } from 'react';
import { X, Sparkles, Terminal, Code } from 'lucide-react';
import GenerateAgent from './GenerateAgent';

interface GenerateAgentModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialAgentType?: 'browser' | 'python';
}

const GenerateAgentModal: React.FC<GenerateAgentModalProps> = ({ 
  isOpen, 
  onClose, 
  initialAgentType = 'browser' 
}) => {
  const [agentType, setAgentType] = useState<'browser' | 'python'>(initialAgentType);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-lg w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Modal Header */}
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white p-4 flex items-center justify-between">
          <div className="flex items-center">
            <Sparkles className="h-5 w-5 mr-2" />
            <h3 className="font-medium">
              {agentType === 'browser' ? 'AI Browser Agent Generator' : 'AI System Agent Generator'}
            </h3>
          </div>
          <button 
            onClick={onClose}
            className="p-1 rounded-full hover:bg-blue-700 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Agent Type Toggle */}
        <div className="bg-white border-b border-gray-200 p-4">
          <div className="flex justify-center">
            <div className="bg-gray-100 rounded-lg p-1 flex shadow-sm">
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
          <div className="mt-2 text-center text-sm text-gray-600">
            {agentType === 'browser' ? (
              'Browser agents run in your browser and can monitor and log activities'
            ) : (
              'System agents run on your computer with Python and can perform actions on your system'
            )}
          </div>
        </div>

        {/* Modal Content */}
        <div className="p-6 overflow-y-auto flex-1">
          <GenerateAgent agentType={agentType} />
        </div>
      </div>
    </div>
  );
};

export default GenerateAgentModal;
