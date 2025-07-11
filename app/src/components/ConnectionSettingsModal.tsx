// components/ConnectionSettingsModal.tsx

import React from 'react';
import { X, ExternalLink, RefreshCw } from 'lucide-react';

// Re-using the types from AppHeader. You might want to move these to a shared types file.
type ServerStatus = 'unchecked' | 'online' | 'offline';
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
  serverStatus: ServerStatus;
  quotaInfo: QuotaInfo;
  renderQuotaStatus: () => React.ReactNode;
  serverAddress: string;
  handleAddressInputChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  checkServerStatus: () => void;
  getServerUrl: () => string;
}

const ConnectionSettingsModal: React.FC<ConnectionSettingsModalProps> = ({
  isOpen,
  onClose,
  isUsingObServer,
  handleToggleObServer,
  showLoginMessage,
  isAuthenticated,
  serverStatus,
  renderQuotaStatus,
  serverAddress,
  handleAddressInputChange,
  checkServerStatus,
  getServerUrl,
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
            {isUsingObServer && isAuthenticated && serverStatus === 'online' && (
                <div className="text-sm text-center mt-2">
                    {renderQuotaStatus()}
                </div>
            )}
        </div>

        {/* Local Server Section */}
        <div className={`p-3 border rounded-md transition-opacity ${isUsingObServer ? 'opacity-50' : 'opacity-100'}`}>
            <label htmlFor="server-address-input" className="font-medium text-gray-700 mb-2 block">Local Inference Server</label>
            <div className="flex items-center space-x-2">
                 <input
                  id="server-address-input"
                  type="text"
                  value={serverAddress}
                  onChange={handleAddressInputChange}
                  placeholder="http://localhost:3838"
                  className="flex-grow px-3 py-2 border rounded-md text-sm bg-white"
                  disabled={isUsingObServer}
                />
                 {(serverStatus === 'offline' || serverStatus === 'unchecked') && !isUsingObServer && (
                  <a
                    href={getServerUrl()}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-2 rounded-md bg-gray-100 hover:bg-gray-200 transition-colors group"
                    title="Check server status in new tab"
                  >
                    <ExternalLink className="h-5 w-5 text-gray-500 group-hover:text-blue-600" />
                  </a>
                )}
            </div>
             {!isUsingObServer && <p className="text-xs text-gray-500 mt-1">e.g., http://127.0.0.1:3838</p>}
        </div>

        {/* Action Button */}
        <div className="mt-6">
             <button
                onClick={checkServerStatus}
                className={`w-full py-2.5 rounded-md flex items-center justify-center text-base font-semibold text-white transition-colors duration-200
                              ${serverStatus === 'online'
                                ? 'bg-green-500'
                                : serverStatus === 'offline'
                                ? 'bg-red-500 hover:bg-red-600'
                                : 'bg-orange-500 hover:bg-orange-600'
                              }`}
              >
                 {serverStatus === 'online' ? (
                  'Connected'
                ) : (
                  <>
                    <RefreshCw className="h-5 w-5 mr-2" />
                    Retry Connection
                  </>
                )}
            </button>
        </div>

      </div>
    </div>
  );
};

export default ConnectionSettingsModal;
