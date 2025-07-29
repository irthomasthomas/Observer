// components/AgentActivityModal.tsx
import React, { useState } from 'react';
import { X, Activity, Database, Eye } from 'lucide-react';
import AgentLogViewer from './AgentLogViewer';
import IterationStoreDebug from './IterationStoreDebug';

interface AgentActivityModalProps {
  isOpen: boolean;
  onClose: () => void;
  agentId: string;
  agentName: string;
  getToken: () => Promise<string | undefined>;
  isAuthenticated: boolean;
}

const AgentActivityModal: React.FC<AgentActivityModalProps> = ({
  isOpen,
  onClose,
  agentId,
  agentName,
  getToken,
  isAuthenticated
}) => {
  const [activeTab, setActiveTab] = useState<'logs' | 'debug'>('logs');
  
  if (!isOpen) return null;

  // Handle backdrop click to close modal
  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  // Handle escape key to close modal
  React.useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      // Prevent body scroll when modal is open
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, onClose]);

  return (
    <div 
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
      onClick={handleBackdropClick}
    >
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl h-full max-h-[80vh] flex flex-col">
        {/* Modal Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <Activity className="h-6 w-6 text-blue-600" />
            <h2 className="text-xl font-semibold text-gray-900">
              Agent Activity - "{agentName}"
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            aria-label="Close modal"
          >
            <X className="h-5 w-5 text-gray-500" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-gray-200">
          <button
            onClick={() => setActiveTab('logs')}
            className={`px-4 py-2 text-sm font-medium flex items-center gap-2 ${
              activeTab === 'logs'
                ? 'border-b-2 border-blue-500 text-blue-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <Eye className="h-4 w-4" />
            Activity Logs
          </button>
          <button
            onClick={() => setActiveTab('debug')}
            className={`px-4 py-2 text-sm font-medium flex items-center gap-2 ${
              activeTab === 'debug'
                ? 'border-b-2 border-blue-500 text-blue-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <Database className="h-4 w-4" />
            IterationStore Debug
          </button>
        </div>

        {/* Modal Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {activeTab === 'logs' ? (
            <AgentLogViewer
              agentId={agentId}
              getToken={getToken}
              isAuthenticated={isAuthenticated}
              maxHeight="none"
              maxEntries={100} // More entries in modal
            />
          ) : (
            <IterationStoreDebug agentId={agentId} />
          )}
        </div>
      </div>
    </div>
  );
};

export default AgentActivityModal;