import React, { useState, useEffect } from 'react';
import { Menu, LogOut, ExternalLink, RefreshCw } from 'lucide-react';
import { checkOllamaServer } from '@utils/ollamaServer';
import { setOllamaServerAddress } from '@utils/main_loop';
import { Logger } from '@utils/logging';
import SharingPermissionsModal from './SharingPermissionsModal';
import type { TokenProvider } from '@utils/main_loop';

// --- NEW HELPER FUNCTION ---
/**
 * Parses a server address string into its host (with protocol) and port.
 * Defaults to https if no protocol is provided.
 * @param address The full address string, e.g., "localhost:3838" or "http://127.0.0.1:8080"
 * @returns An object with host and port.
 */
const parseServerAddress = (address: string): { host: string; port: string } => {
  let processedAddress = address.trim();

  // If the user doesn't specify a protocol, default to http for simplicity.
  if (!processedAddress.startsWith('http://') && !processedAddress.startsWith('https://')) {
    processedAddress = `http://${processedAddress}`;
  }

  const lastColonIndex = processedAddress.lastIndexOf(':');
  
  // Ensure the colon is present and is after the protocol part (e.g., "https://")
  if (lastColonIndex === -1 || lastColonIndex < processedAddress.indexOf('//')) {
    Logger.warn('SERVER_PARSE', `No port found in address: ${address}. Returning full address as host.`);
    return { host: processedAddress, port: '' }; // No port found
  }

  const host = processedAddress.substring(0, lastColonIndex);
  const port = processedAddress.substring(lastColonIndex + 1);

  return { host, port };
};


// --- The rest of your component ---
type QuotaInfo = {
  used: number;
  remaining: number | 'unlimited';
  limit: number | 'unlimited';
  pro_status: boolean;
} | null;

interface AuthState {
  isLoading: boolean;
  isAuthenticated: boolean;
  user: any;
  loginWithRedirect: () => void;
  logout: (options?: any) => void;
}

interface AppHeaderProps {
  serverStatus: 'unchecked' | 'online' | 'offline';
  setServerStatus: React.Dispatch<React.SetStateAction<'unchecked' | 'online' | 'offline'>>;
  setError: React.Dispatch<React.SetStateAction<string | null>>;
  authState?: AuthState;
  onMenuClick: () => void;
  shouldHighlightMenu?: boolean;
  isUsingObServer?: boolean;
  setIsUsingObServer?: (value: boolean) => void;
  getToken: TokenProvider;
}

const AppHeader: React.FC<AppHeaderProps> = ({
  serverStatus,
  setServerStatus,
  setError,
  authState,
  onMenuClick,
  isUsingObServer: externalIsUsingObServer,
  setIsUsingObServer: externalSetIsUsingObServer,
  getToken,
}) => {
  // --- MODIFIED --- Default to the full, desired URL for the proxy.
  const [serverAddress, setServerAddress] = useState('http://localhost:3838');
  const [pulseMenu, setPulseMenu] = useState(false);
  const [internalIsUsingObServer, setInternalIsUsingObServer] = useState(false);
  const [quotaInfo, setQuotaInfo] = useState<QuotaInfo>(null);
  const [isLoadingQuota, setIsLoadingQuota] = useState(false);
  const [isPermissionsModalOpen, setIsPermissionsModalOpen] = useState(false);
  const [showLoginMessage, setShowLoginMessage] = useState(false);
  const [isSessionExpired, setIsSessionExpired] = useState(false);

  const isUsingObServer = externalIsUsingObServer !== undefined
    ? externalIsUsingObServer
    : internalIsUsingObServer;

  const isAuthenticated = authState?.isAuthenticated ?? false;
  const user = authState?.user;
  
  const isProUser = quotaInfo?.pro_status === true;

  const handleLogout = () => {
    authState?.logout({ logoutParams: { returnTo: window.location.origin } });
  };

  const fetchQuotaInfo = async () => {
    if (!isUsingObServer || !isAuthenticated || serverStatus !== 'online') {
      setQuotaInfo(null);
      setIsSessionExpired(false);
      return;
    }

    try {
      setIsLoadingQuota(true);
      const token = await getToken();
      if (!token) throw new Error("Authentication token not available.");

      const headers = { 'Authorization': `Bearer ${token}` };
      const response = await fetch('https://api.observer-ai.com/quota', { headers });

      if (response.ok) {
        const data: QuotaInfo = await response.json();
        setQuotaInfo(data);
        setIsSessionExpired(false);
        if (data && typeof data.remaining === 'number') {
          localStorage.setItem('observer-quota-remaining', data.remaining.toString());
        } else {
          localStorage.removeItem('observer-quota-remaining');
        }
      } else if (response.status === 401) {
        Logger.warn('AUTH', 'Session expired. Quota check failed with 401.');
        setQuotaInfo(null);
        setIsSessionExpired(true);
        localStorage.removeItem('observer-quota-remaining');
      } else {
        Logger.error('QUOTA', `Failed to fetch quota, status: ${response.status}`);
        setQuotaInfo(null);
        setIsSessionExpired(false);
        localStorage.removeItem('observer-quota-remaining');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      Logger.error('QUOTA', `Error fetching quota info: ${errorMessage}`, err);
      setQuotaInfo(null);
      setIsSessionExpired(false);
    } finally {
      setIsLoadingQuota(false);
    }
  };

  const handleToggleObServer = () => {
    const newValue = !isUsingObServer;

    if (newValue && !isAuthenticated) {
      Logger.warn('AUTH', 'User attempted to enable Ob-Server while not authenticated.');
      setShowLoginMessage(true);
      setTimeout(() => setShowLoginMessage(false), 3000);
      return;
    }

    // Just update the state. The useEffect will handle the rest.
    if (externalSetIsUsingObServer) {
      externalSetIsUsingObServer(newValue);
    } else {
      setInternalIsUsingObServer(newValue);
    }
  };

  const checkObServerStatus = async () => {
    try {
      setServerStatus('unchecked');
      // --- MODIFIED --- Standardize how Ob-Server is handled
      const { host, port } = parseServerAddress('api.observer-ai.com');
      Logger.info('SERVER', `Checking connection to Ob-Server at ${host}:${port}`);
      setOllamaServerAddress(host, port);
      
      const result = await checkOllamaServer(host, port);
      if (result.status === 'online') {
        setServerStatus('online');
        setError(null);
        Logger.info('SERVER', `Connected successfully to Ob-Server at ${host}:${port}`);
      } else {
        throw new Error(result.error || 'Failed to connect');
      }
    } catch (err) {
      setServerStatus('offline');
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError('Failed to connect to Ob-Server');
      Logger.error('SERVER', `Error checking Ob-Server status: ${errorMessage}`, err);
    }
  };

  const checkServerStatus = async () => {
    if (isUsingObServer) {
      // --- Handle Ob-Server Case ---
      try {
        setServerStatus('unchecked');
        const host = 'https://api.observer-ai.com';
        const port = '443';
        Logger.info('SERVER', `Checking connection to Ob-Server...`);
        // We set this in the useEffect, but it's safe to re-affirm here.
        setOllamaServerAddress(host, port);
        
        const result = await checkOllamaServer(host, port);
        if (result.status === 'online') {
          setServerStatus('online');
          setError(null);
          Logger.info('SERVER', `Connected successfully to Ob-Server`);
        } else {
          throw new Error(result.error || 'Failed to connect');
        }
      } catch (err) {
        setServerStatus('offline');
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        setError('Failed to connect to Ob-Server');
        Logger.error('SERVER', `Error checking Ob-Server status: ${errorMessage}`, err);
      }
      return;
    }
    
    // --- Handle Local Inference Case ---
    try {
      setServerStatus('unchecked');
      const { host, port } = parseServerAddress(serverAddress);
      
      if (!host || !port) {
        throw new Error(`Invalid server address format. Please use 'host:port'.`);
      }

      Logger.info('SERVER', `Checking connection to local server at ${host}:${port}`);
      setOllamaServerAddress(host, port);
      
      const result = await checkOllamaServer(host, port);
      
      if (result.status === 'online') {
        setServerStatus('online');
        setError(null);
        Logger.info('SERVER', `Connected successfully to local server.`);
      } else {
        setServerStatus('offline');
        setError(result.error || 'Failed to connect to local server');
        Logger.error('SERVER', `Failed to connect: ${result.error || 'Unknown error'}`);
      }
    } catch (err) {
      setServerStatus('offline');
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(`Connection failed: ${errorMessage}`);
      Logger.error('SERVER', `Error checking local server status: ${errorMessage}`, err);
    }
  };

  const handleServerAddressChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (isUsingObServer) return;
    // --- MODIFIED --- Only update the local state. The parsing happens on action.
    setServerAddress(e.target.value);
  };

  const getServerUrl = () => {
    // --- MODIFIED --- Use the parser to always get a valid URL for the link
    const { host, port } = parseServerAddress(serverAddress);
    return port ? `${host}:${port}` : host;
  };

  useEffect(() => {
    const handleQuotaUpdate = () => {
      const storedQuota = localStorage.getItem('observer-quota-remaining');
      if (storedQuota) {
        setQuotaInfo(prev => prev ? { ...prev, remaining: parseInt(storedQuota, 10) } : null);
      }
    };

    window.addEventListener('quotaUpdated', handleQuotaUpdate);
    return () => {
      window.removeEventListener('quotaUpdated', handleQuotaUpdate);
    };
  }, []);

  useEffect(() => {
    if (isUsingObServer) {
      // --- Switching TO Ob-Server ---
      setServerAddress('api.observer-ai.com'); // Update input field display
      setOllamaServerAddress('https://api.observer-ai.com', '443'); // Set global state
      Logger.info('SERVER', 'Switched to Ob-Server mode.');
    } else {
      // --- Switching TO Local Inference ---
      const defaultLocal = 'http://localhost:3838'; // Your new default
      setServerAddress(defaultLocal); // Update input field
      const { host, port } = parseServerAddress(defaultLocal);
      setOllamaServerAddress(host, port); // Set global state
      setQuotaInfo(null); // Clear cloud state
      setIsSessionExpired(false);
      Logger.info('SERVER', 'Switched to local inference mode.');
    }
    
    // Crucially, trigger the check *after* the state has been set for the new mode.
    checkServerStatus();
    
  }, [isUsingObServer]);


  useEffect(() => {
    if (isUsingObServer && isAuthenticated && serverStatus === 'online') {
      fetchQuotaInfo();
    }
  }, [isUsingObServer, isAuthenticated, serverStatus]);

  // --- REMOVED --- an effect that set serverAddress based on isUsingObServer,
  // as this logic is now handled more robustly in handleToggleObServer.

  useEffect(() => {
    setPulseMenu(true);
    const timer = setTimeout(() => {
      setPulseMenu(false);
    }, 10000);
    return () => clearTimeout(timer);
  }, []);

  const renderQuotaStatus = () => {
    if (isSessionExpired) {
      return (
        <button
          type="button"
          onClick={() => authState?.loginWithRedirect()}
          className="text-red-500 font-semibold hover:underline cursor-pointer"
          title="Your session has expired. Click to log in again."
        >
          Session Expired
        </button>
      );
    }

    if (isLoadingQuota) {
      return <span className="text-gray-500">Loading...</span>;
    }

    if (quotaInfo) {
      if (quotaInfo.pro_status) {
        return <span className="font-semibold text-green-600">Unlimited Access</span>;
      }
      if (typeof quotaInfo.remaining === 'number') {
        if (quotaInfo.remaining <= 0) {
          return (
            <span className="font-medium text-red-500">
              No credits left!
            </span>
          );
        }
        return (
          <span className={`font-medium ${
            quotaInfo.remaining <= 10 ? 'text-orange-500'
            : 'text-green-600'
          }`}>
            {`${quotaInfo.remaining} / ${quotaInfo.limit} credits left`}
          </span>
        );
      }
    }
    return <span className="text-gray-500">Quota N/A</span>;
  };

  return (
    <>
      <style>
        {`
          @keyframes menu-pulse {
            0%, 100% { box-shadow: 0 0 0 0 rgba(59, 130, 246, 0.7); }
            50% { box-shadow: 0 0 0 8px rgba(59, 130, 246, 0); }
          }
          .menu-pulse {
            animation: menu-pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
            background-color: rgba(59, 130, 246, 0.1);
          }
        `}
      </style>
      
      <header className="fixed top-0 left-0 right-0 bg-white shadow-md z-50">
        <div className="max-w-7xl mx-auto px-2 sm:px-4 py-3 sm:py-4">
          <div className="flex justify-between items-center">
            {/* Left side */}
            <div className="flex items-center space-x-2 sm:space-x-4">
              <button
                onClick={onMenuClick}
                className={`p-2 rounded-md ${pulseMenu ? 'menu-pulse relative' : 'hover:bg-gray-100'}`}
                aria-label="Open menu"
              >
                <Menu className="h-6 w-6" />
                {pulseMenu && (
                  <span className="absolute top-0 right-0 flex h-3 w-3">
                    <span className="animate-ping absolute h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                    <span className="relative rounded-full h-3 w-3 bg-blue-500"></span>
                  </span>
                )}
              </button>
              <img 
                src="/eye-logo-black.svg" 
                alt="Observer Logo" 
                className="h-8 w-8 cursor-pointer hover:opacity-80"
                onClick={() => setIsPermissionsModalOpen(true)}
                title="Initialize screen capture"
              />
              {/* Updated Logo with conditional "pro" badge */}
              <div className="relative hidden md:block">
                <h1 className="text-xl font-semibold">Observer</h1>
                {isProUser && (
                  <span className="absolute top-0.5 -right-5 text-xs font-semibold text-black">
                    pro
                  </span>
                )}
              </div>
            </div> 

            {/* Right side */}
            <div className="flex items-center space-x-1 sm:space-x-2 md:space-x-4">
              <div className="flex items-center space-x-1 sm:space-x-2"> 
                {/* Ob-Server Toggle */}
                <div className="flex flex-col items-center">
                  <div className="flex items-center space-x-1 sm:space-x-2">
                    <span className="text-sm text-gray-600 hidden md:inline">Ob-Server</span>
                    <button 
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
                  {showLoginMessage ? (
                    <span className="text-xs text-red-500 font-semibold mt-1">
                      Login Required
                    </span>
                  ) : isUsingObServer ? (
                    isAuthenticated && serverStatus === 'online' && (
                      <div className="text-xs text-center mt-1 h-4"> {/* h-4 to prevent layout shift */}
                        {renderQuotaStatus()}
                      </div>
                    )
                  ) : (
                    <div className="text-xs text-center mt-1">
                      <span className="font-semibold text-slate-700">
                        Local Inference
                      </span>
                    </div>
                  )}
                </div>
                {/* Server Address Input */}
                <input
                  type="text"
                  value={serverAddress}
                  onChange={handleServerAddressChange}
                  placeholder="http://localhost:11434" // Updated placeholder to reflect default
                  className={`px-2 sm:px-3 py-2 border rounded-md text-sm 
                              ${isUsingObServer ? 'bg-gray-100 opacity-70' : ''} 
                              w-32 sm:w-32 md:w-32 lg:w-auto`}
                  disabled={isUsingObServer}
                />

                {/* Status Button */}
                <button
                  onClick={checkServerStatus}
                  className={`py-2 rounded-md flex items-center justify-center text-sm transition-colors duration-200 lg:min-w-32
                              ${serverStatus === 'online'
                                ? 'bg-green-500 text-white'
                                : serverStatus === 'offline'
                                ? 'bg-red-500 text-white hover:bg-red-600'
                                : 'bg-orange-500 text-white hover:bg-orange-600'
                              }
                              px-2 sm:px-3 md:px-4`}
                >
                  {serverStatus === 'online' ? (
                    <>
                      <span aria-hidden="true">✓</span>
                      <span className="hidden lg:inline ml-1.5">Connected</span>
                    </>
                  ) : (
                    <>
                      <RefreshCw className="h-4 w-4" />
                      <span className="hidden lg:inline ml-1.5">Retry</span>
                    </>
                  )}
                </button>
                
                {/* Helper link for local server */}
                {(serverStatus === 'offline' || serverStatus === 'unchecked') && !isUsingObServer && (
                  <a
                    href={getServerUrl()}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center space-x-1.5 ml-1 sm:ml-2 p-2 rounded-md bg-gray-100 hover:bg-gray-200 transition-colors duration-200 group"
                    title={`Check ${serverAddress} status in a new tab`}
                  >
                    <span className="text-sm text-gray-700 hidden lg:inline">Check Server</span>
                    <ExternalLink className="h-4 w-4 text-gray-500 group-hover:text-blue-600 transition-colors" />
                  </a>
                )}
              </div>

              {/* Auth Section */}
              <div className="flex items-center space-x-1 sm:space-x-2 md:space-x-3">
                {authState ? (
                  authState.isLoading ? (
                    <div className="text-sm px-2 sm:px-3 py-2 bg-gray-100 rounded md:text-base md:px-4">Loading...</div>
                  ) : isAuthenticated ? (
                    <div className="flex items-center space-x-1 sm:space-x-2 md:space-x-3">
                      <span className="text-sm text-gray-700 hidden md:inline">
                        {user?.name || user?.email || 'User'}
                      </span>
                      <button
                        onClick={handleLogout}
                        className="bg-gray-200 text-gray-700 rounded hover:bg-gray-300 flex items-center justify-center p-2" 
                        aria-label="Logout"
                      >
                      <LogOut className="h-5 w-5" />
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => authState.loginWithRedirect()}
                      className="bg-green-500 text-white rounded hover:bg-green-600 
                                 text-sm px-2 py-2 sm:px-3 md:text-base md:px-4"
                    >
                      <span className="md:hidden">Log In</span>
                      <span className="hidden md:inline">Log In | Sign Up</span>
                    </button>
                  )
                ) : (
                  <div className="bg-yellow-100 text-yellow-800 rounded text-xs sm:text-sm px-2 py-2 sm:px-3">
                    <span className="md:hidden">Auth...</span>
                    <span className="hidden md:inline">Auth not initialized</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </header>
      
      <SharingPermissionsModal
        isOpen={isPermissionsModalOpen}
        onClose={() => setIsPermissionsModalOpen(false)}
      />
    </>
  );
};

export default AppHeader;
