// components/ConnectionSettingsModal.tsx

import React from 'react';
import { X, RefreshCw } from 'lucide-react';

// Re-using the types from AppHeader. You might want to move these to a shared types file.
type QuotaInfo = {
  used: number;
  remaining: number | 'unlimited';
  limit: number | 'unlimited';
  pro_status: boolean;
} | null;

interface ConnectionSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  isUsingObServer: boolean;
  handleToggleObServer: () => void;
  showLoginMessage: boolean;
  isAuthenticated: boolean;
  quotaInfo: QuotaInfo;
  renderQuotaStatus: () => React.ReactNode;
  localServerOnline: boolean;
  checkLocalServer: () => void;
}

const ConnectionSettingsModal: React.FC<ConnectionSettingsModalProps> = ({
  isOpen,
  onClose,
  isUsingObServer,
  handleToggleObServer,
  showLoginMessage,
  isAuthenticated,
  renderQuotaStatus,
  localServerOnline,
  checkLocalServer,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-[60] flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-xl w-full max-w-sm p-6 relative" onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} className="absolute top-3 right-3 text-gray-400 hover:text-gray-600">
          <X size={24} />
        </button>

        <h2 className="text-xl font-semibold mb-4 text-gray-800">Connection Settings</h2>

        {/* Ob-Server Section */}
        <div className="p-3 border rounded-md mb-4">
            <div className="flex justify-between items-center">
                <label htmlFor="ob-server-toggle" className="font-medium text-gray-700">Use Ob-Server Cloud</label>
                <button
                  id="ob-server-toggle"
                  className={`relative inline-flex items-center h-6 rounded-full w-11 transition-colors focus:outline-none ${
                    isUsingObServer ? 'bg-blue-500' : 'bg-slate-700'
                  }`}
                  onClick={handleToggleObServer}
                  aria-label={isUsingObServer ? "Disable Ob-Server" : "Enable Ob-Server"}
                >
                  <span
                    className={`inline-block w-4 h-4 transform transition-transform bg-white rounded-full ${
                      isUsingObServer ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
            </div>
            {showLoginMessage && <span className="text-xs text-red-500 font-semibold mt-1 block">Login Required</span>}
            {isUsingObServer ? (
                isAuthenticated ? (
                    <div className="text-sm text-center mt-2">
                        {renderQuotaStatus()}
                    </div>
                ) : null
            ) : (
                <div className="text-xs text-center mt-1">
                    <span className="font-semibold text-gray-500">
                        Fully Offline
                    </span>
                </div>
            )}
        </div>

        {/* Local Server Section */}
        <div className={`p-3 border rounded-md transition-opacity ${isUsingObServer ? 'opacity-50' : 'opacity-100'}`}>
            <div className="flex justify-between items-center">
                <label className="font-medium text-gray-700">Local Server</label>
                <span className={`text-sm font-semibold ${
                  localServerOnline ? 'text-green-600' : 'text-red-500'
                }`}>
                  {localServerOnline ? 'Online' : 'Offline'}
                </span>
            </div>
            <p className="text-xs text-gray-500 mt-1">http://localhost:3838</p>
        </div>

        {/* Local Server Check Button */}
        <div className="mt-6">
             <button
                onClick={checkLocalServer}
                className={`w-full py-2.5 rounded-md flex items-center justify-center text-base font-semibold text-white transition-colors duration-200
                              ${localServerOnline
                                ? 'bg-green-500'
                                : 'bg-red-500 hover:bg-red-600'
                              }`}
              >
                 {localServerOnline ? (
                  'Local: Online'
                ) : (
                  <>
                    <RefreshCw className="h-5 w-5 mr-2" />
                    Check Local Server
                  </>
                )}
            </button>
        </div>

      </div>
    </div>
  );
};

export default ConnectionSettingsModal;
