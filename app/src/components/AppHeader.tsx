// components/AppHeader.tsx
import React, { useState, useEffect } from 'react';
import { LogOut, ExternalLink, RefreshCw, Server } from 'lucide-react';
import { checkOllamaServer } from '@utils/ollamaServer';
import { setOllamaServerAddress } from '@utils/main_loop';
import { Logger } from '@utils/logging';
import SharingPermissionsModal from './SharingPermissionsModal';
import ConnectionSettingsModal from './ConnectionSettingsModal';
import StartupDialogs from './StartupDialogs';
import type { TokenProvider } from '@utils/main_loop';

// --- NEW HELPER FUNCTION ---
/**
 * Parses a server address string into its host (with protocol) and port.
 * Defaults to http if no protocol is provided.
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
  shouldHighlightMenu?: boolean;
  isUsingObServer?: boolean;
  setIsUsingObServer?: (value: boolean) => void;
  hostingContext?: 'official-web' | 'self-hosted' | 'tauri';
  getToken: TokenProvider;
  onUpgradeClick?: () => void;
  quotaInfo: QuotaInfo;
  setQuotaInfo: React.Dispatch<React.SetStateAction<QuotaInfo>>;
}


const LOCAL_STORAGE_KEY = 'observer_local_server_address';


const AppHeader: React.FC<AppHeaderProps> = ({
  serverStatus,
  setServerStatus,
  setError,
  authState,
  isUsingObServer: externalIsUsingObServer,
  setIsUsingObServer: externalSetIsUsingObServer,
  hostingContext = 'self-hosted',
  getToken,
  onUpgradeClick,
  quotaInfo,
  setQuotaInfo,
}) => {
  // --- MODIFIED --- Default to the full, desired URL for the proxy.
  const [serverAddress, setServerAddress] = useState(() => {
  return localStorage.getItem(LOCAL_STORAGE_KEY) || 'http://localhost:3838';
});

  const [internalIsUsingObServer, setInternalIsUsingObServer] = useState(false);
  const [isLoadingQuota, setIsLoadingQuota] = useState(false);
  const [isPermissionsModalOpen, setIsPermissionsModalOpen] = useState(false);
  const [showLoginMessage, setShowLoginMessage] = useState(false);
  const [isSessionExpired, setIsSessionExpired] = useState(false);
  const [isQuotaHovered, setIsQuotaHovered] = useState(false);
  const [has70PercentWarningBeenShown, setHas70PercentWarningBeenShown] = useState(false);

  // --- NEW --- State to control the visibility of the new settings modal
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [isStartupDialogOpen, setIsStartupDialogOpen] = useState(false);

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
          
          // Trigger upgrade modal at 50% usage for non-pro users
          if (!data.pro_status && typeof data.limit === 'number' && data.limit > 0) {
            const usagePercentage = ((data.limit - data.remaining) / data.limit) * 100;
            console.log(`Usage: ${usagePercentage.toFixed(1)}%, Remaining: ${data.remaining}/${data.limit}, Warning shown: ${has70PercentWarningBeenShown}`);
            if (usagePercentage >= 50 && !has70PercentWarningBeenShown && onUpgradeClick) {
              console.log('Triggering upgrade modal at 50% usage');
              setHas70PercentWarningBeenShown(true);
              onUpgradeClick();
            }
          }
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

  // Check for 50% usage threshold whenever quotaInfo updates
  useEffect(() => {
    if (!quotaInfo || quotaInfo.pro_status || has70PercentWarningBeenShown || !onUpgradeClick) {
      return;
    }
    
    if (typeof quotaInfo.remaining === 'number' && typeof quotaInfo.limit === 'number' && quotaInfo.limit > 0) {
      const usagePercentage = ((quotaInfo.limit - quotaInfo.remaining) / quotaInfo.limit) * 100;
      console.log(`Real-time usage check: ${usagePercentage.toFixed(1)}%, Remaining: ${quotaInfo.remaining}/${quotaInfo.limit}`);
      
      if (usagePercentage >= 50) {
        console.log('Triggering upgrade modal at 50% usage (real-time)');
        setHas70PercentWarningBeenShown(true);
        onUpgradeClick();
      }
    }
  }, [quotaInfo, has70PercentWarningBeenShown, onUpgradeClick]);

  const handleToggleObServer = () => {
    const newValue = !isUsingObServer;

    if (newValue && !isAuthenticated) {
      Logger.warn('AUTH', 'User attempted to enable Ob-Server while not authenticated.');
      setShowLoginMessage(true);
      setTimeout(() => setShowLoginMessage(false), 3000);
      return;
    }

    // If switching FROM Ob-Server TO local on official web app, show warning
    if (!newValue && hostingContext === 'official-web') {
      setIsStartupDialogOpen(true);
      return;
    }

    // Just update the state. The useEffect will handle the rest.
    if (externalSetIsUsingObServer) {
      externalSetIsUsingObServer(newValue);
    } else {
      setInternalIsUsingObServer(newValue);
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
      Logger.debug('SERVER', `parsed address: ${serverAddress} and got host: ${host} and port: ${port}`);

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

  const handleAddressInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (isUsingObServer) return;
    setServerAddress(e.target.value);
  };

  const handleAddressInputBlur = () => {
    if (isUsingObServer) return; // Don't format if in Ob-Server mode

    const currentAddress = serverAddress.trim();
    if (!currentAddress) return;

    // Only add a protocol if one isn't already there.
    if (!currentAddress.startsWith('http://') && !currentAddress.startsWith('https://')) {
        const isLocal = currentAddress.startsWith('localhost') || /^\d{1,3}(\.\d{1,3}){3}/.test(currentAddress);
        setServerAddress(isLocal ? `http://${currentAddress}` : `https://${currentAddress}`);
    }
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

  // Effect #1: The Mode Switcher. Its ONLY job is to update the address.
  useEffect(() => {
    if (isUsingObServer) {
      setServerAddress('api.observer-ai.com');
      Logger.info('SERVER', 'Mode switched to Ob-Server. Updating address...');
      setOllamaServerAddress('https://api.observer-ai.com', '443'); // Set global state immediately
    } else {
      // --- MODIFIED LOGIC ---
    // When switching back to local, get the last used address from storage.
    const savedAddress = localStorage.getItem(LOCAL_STORAGE_KEY) || 'http://localhost:3838';
    setServerAddress(savedAddress);
    Logger.info('SERVER', `Mode switched to Local. Restoring address to ${savedAddress}...`);

    // The rest of the logic uses the restored address
    const { host, port } = parseServerAddress(savedAddress);
    setOllamaServerAddress(host, port);
    setQuotaInfo(null);
    setIsSessionExpired(false);
  }
}, [isUsingObServer]);


  // Effect #2: The Connection Checker. This runs AFTER Effect #1 has updated the state.
  useEffect(() => {
    // This effect runs on the initial component mount AND whenever serverAddress changes.
    // By definition, it will always have the latest `serverAddress` value.
    Logger.info('SERVER', `Address changed to "${serverAddress}", initiating connection check.`);
    checkServerStatus(); // Call the function responsible for checking
  }, [serverAddress]); // The dependency array is the magic.


  useEffect(() => {
    if (isUsingObServer && isAuthenticated && serverStatus === 'online') {
      fetchQuotaInfo();
    }
  }, [isUsingObServer, isAuthenticated, serverStatus]);

  useEffect(() => {
    // We only want to save the address if the user is in local mode.
    // This prevents us from saving the Ob-Server API address as a user preference.
    if (!isUsingObServer) {
      localStorage.setItem(LOCAL_STORAGE_KEY, serverAddress);
    }
  }, [serverAddress, isUsingObServer]);

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
        
        // Show "Limited Use" that changes to credit count on hover
        return (
          <div
            className={`font-medium cursor-help ${
              quotaInfo.remaining <= 10 ? 'text-orange-500'
              : 'text-green-600'
            }`}
            onMouseEnter={() => setIsQuotaHovered(true)}
            onMouseLeave={() => setIsQuotaHovered(false)}
          >
            {isQuotaHovered 
              ? `${quotaInfo.remaining} / ${quotaInfo.limit} Credits left`
              : 'Limited Use'
            }
          </div>
        );
      }
    }
    return <span className="text-gray-500">Quota N/A</span>;
  };

  return (
    <>
      <header className="fixed top-0 left-0 right-0 bg-white shadow-md z-50">
        <div className="max-w-7xl mx-auto px-2 sm:px-4 py-3 sm:py-4">
          <div className="flex justify-between items-center">
            {/* Left side */}
            <div className="flex items-center space-x-2 sm:space-x-4">
              <img
                src="/eye-logo-black.svg"
                alt="Observer Logo"
                className="h-8 w-8 cursor-pointer hover:opacity-80"
                onClick={() => setIsPermissionsModalOpen(true)}
                title="Initialize screen capture"
              />
              {/* Updated Logo with conditional "pro" badge */}
              <div className="relative hidden md:block">
              {/* FIX: Wrap the text in an <a> tag instead of putting href on <h1> */}
              <a href="https://observer-ai.com" target="_blank" rel="noopener noreferrer" className="text-xl font-semibold">
                <h1>Observer</h1>
              </a>
              {isProUser && (
                <span className="absolute top-0.5 -right-5 text-xs font-semibold text-black">
                  pro
                </span>
              )}
            </div>

            </div>

            {/* Right side */}
            <div className="flex items-center space-x-1 sm:space-x-2 md:space-x-4">
              {/* Desktop Controls (Visible on md screens and up) */}
              <div className="hidden md:flex items-center space-x-1 sm:space-x-2">
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
                  onChange={handleAddressInputChange}
                  onBlur={handleAddressInputBlur} // Apply formatting when user is done.
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

              {/* Mobile Controls (Visible below md screens) */}
              <div className="flex md:hidden items-center space-x-2">
                {/* Status Indicator Dot */}
                <div className={`w-3 h-3 rounded-full
                    ${serverStatus === 'online' ? 'bg-green-500' : serverStatus === 'offline' ? 'bg-red-500' : 'bg-orange-500 animate-pulse'}
                `} title={`Status: ${serverStatus}`}></div>

                {/* Settings Button */}
                <button
                    onClick={() => setIsSettingsModalOpen(true)}
                    className="p-2 rounded-md hover:bg-gray-100"
                    aria-label="Open connection settings"
                >
                    <Server className="h-5 w-5 text-gray-600" />
                </button>
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

      {/* --- NEW --- Render the settings modal */}
      <ConnectionSettingsModal
        isOpen={isSettingsModalOpen}
        onClose={() => setIsSettingsModalOpen(false)}
        {...{
          isUsingObServer,
          handleToggleObServer,
          showLoginMessage,
          isAuthenticated,
          serverStatus,
          quotaInfo,
          renderQuotaStatus,
          serverAddress,
          handleAddressInputChange,
          checkServerStatus,
          getServerUrl
        }}
      />

      {isStartupDialogOpen && (
        <StartupDialogs
          onDismiss={() => setIsStartupDialogOpen(false)}
          setUseObServer={(value) => {
            setIsStartupDialogOpen(false);
            if (externalSetIsUsingObServer) {
              externalSetIsUsingObServer(value);
            } else {
              setInternalIsUsingObServer(value);
            }
          }}
          isAuthenticated={isAuthenticated}
          hostingContext={hostingContext}
          initialView="local-warning"
        />
      )}
    </>
  );
};

export default AppHeader;
