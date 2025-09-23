// components/AppHeader.tsx
import React, { useState, useEffect } from 'react';
import { LogOut, RefreshCw, Server } from 'lucide-react';
import { checkInferenceServer, addInferenceAddress, removeInferenceAddress, fetchModels } from '@utils/inferenceServer';
import { Logger } from '@utils/logging';
import SharingPermissionsModal from './SharingPermissionsModal';
import ConnectionSettingsModal from './ConnectionSettingsModal';
import StartupDialogs from './StartupDialogs';
import type { TokenProvider } from '@utils/main_loop';

// Server address constants
const OB_SERVER_ADDRESS = 'https://api.observer-ai.com:443';
const LOCAL_SERVER_ADDRESS = 'http://localhost:3838';


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
  onShowTerminalModal?: () => void;
  quotaInfo: QuotaInfo;
  setQuotaInfo: React.Dispatch<React.SetStateAction<QuotaInfo>>;
}



const AppHeader: React.FC<AppHeaderProps> = ({
  serverStatus,
  authState,
  isUsingObServer: externalIsUsingObServer,
  setIsUsingObServer: externalSetIsUsingObServer,
  hostingContext = 'self-hosted',
  getToken,
  onUpgradeClick,
  onShowTerminalModal,
  quotaInfo,
  setQuotaInfo,
}) => {
  const [localServerOnline, setLocalServerOnline] = useState(false);

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

  const fetchQuotaInfo = async (forceObServer = false) => {
    const usingObServer = forceObServer || isUsingObServer;
    if (!usingObServer || !isAuthenticated) {
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
      Logger.warn('AUTH', 'User attempted to enable ObServer while not authenticated.');
      setShowLoginMessage(true);
      setTimeout(() => setShowLoginMessage(false), 3000);
      return;
    }

    // If switching FROM ObServer TO local on official web app, show warning
    if (!newValue && hostingContext === 'official-web') {
      setIsStartupDialogOpen(true);
      return;
    }

    // Update state and manage inference addresses
    if (newValue) {
      // Add ObServer immediately
      addInferenceAddress(OB_SERVER_ADDRESS);
      // Fetch models to include ObServer models
      fetchModels();
      // Check quota when turning on ObServer
      if (isAuthenticated) {
        fetchQuotaInfo(true); // Force check even though state hasn't updated yet
      }
    } else {
      // Remove ObServer
      removeInferenceAddress(OB_SERVER_ADDRESS);
      // Fetch models to remove ObServer models
      fetchModels();
    }

    if (externalSetIsUsingObServer) {
      externalSetIsUsingObServer(newValue);
    } else {
      setInternalIsUsingObServer(newValue);
    }
  };

  const checkForEmptyOllamaModels = async () => {
    try {
      // Check if this is an Ollama server by checking the /api/tags endpoint
      const response = await fetch(`${LOCAL_SERVER_ADDRESS}/api/tags`, {
        signal: AbortSignal.timeout(1000)
      });

      if (response.ok) {
        const data = await response.json();
        if (data.models && data.models.length === 0) {
          Logger.info('MODELS', 'Local Ollama server detected with no models, showing terminal modal');
          if (onShowTerminalModal) {
            onShowTerminalModal();
          }
        }
      }
    } catch (error) {
      // Not an Ollama server or not reachable via /api/tags, ignore
      Logger.debug('MODELS', 'Local server is not Ollama or /api/tags not accessible');
    }
  };

  const checkLocalServer = async () => {
    try {
      Logger.info('SERVER', `Checking local server connection at ${LOCAL_SERVER_ADDRESS}...`);
      const result = await checkInferenceServer(LOCAL_SERVER_ADDRESS);

      if (result.status === 'online') {
        setLocalServerOnline(true);
        addInferenceAddress(LOCAL_SERVER_ADDRESS);
        Logger.info('SERVER', `Local server at ${LOCAL_SERVER_ADDRESS} is online and added to inference addresses`);
        // Update model list when server comes online
        await fetchModels();
        // Check if it's an Ollama server with no models
        await checkForEmptyOllamaModels();
      } else {
        setLocalServerOnline(false);
        removeInferenceAddress(LOCAL_SERVER_ADDRESS);
        Logger.warn('SERVER', `Local server at ${LOCAL_SERVER_ADDRESS} is offline: ${result.error}`);
        // Update model list when server goes offline
        await fetchModels();
      }
    } catch (err) {
      setLocalServerOnline(false);
      removeInferenceAddress(LOCAL_SERVER_ADDRESS);
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      Logger.error('SERVER', `Error checking local server: ${errorMessage}`, err);
    }
  };


  const checkLocalServerOnly = async () => {
    await checkLocalServer();
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

  // Initialize and check local server on mount
  useEffect(() => {
    checkLocalServer();
  }, []);


  // Clear quota info when switching away from ObServer
  useEffect(() => {
    if (!isUsingObServer) {
      setQuotaInfo(null);
      setIsSessionExpired(false);
    }
  }, [isUsingObServer]);


  // Handle ObServer state changes - trigger full workflow when enabled
  useEffect(() => {
    if (isUsingObServer) {
      // Add ObServer inference address
      addInferenceAddress(OB_SERVER_ADDRESS);
      // Fetch models to include ObServer models
      fetchModels();
      // Check quota when turning on ObServer
      if (isAuthenticated) {
        fetchQuotaInfo(true);
      }
    } else {
      // Remove ObServer inference address when disabled
      removeInferenceAddress(OB_SERVER_ADDRESS);
      // Fetch models to remove ObServer models
      fetchModels();
    }
  }, [isUsingObServer, isAuthenticated]);

  useEffect(() => {
    if (isUsingObServer && isAuthenticated && serverStatus === 'online') {
      fetchQuotaInfo();
    }
  }, [isUsingObServer, isAuthenticated, serverStatus]);

  // Removed: No longer need to save server address to localStorage

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
                {/* ObServer Toggle */}
                <div className="flex flex-col items-center">
                  <div className="flex items-center space-x-1 sm:space-x-2">
                    <span className="text-sm text-gray-600 hidden md:inline">ObServer</span>
                    <button
                      className={`relative inline-flex items-center h-6 rounded-full w-11 transition-colors focus:outline-none ${
                        isUsingObServer ? 'bg-blue-500' : 'bg-slate-700'
                      }`}
                      onClick={handleToggleObServer}
                      aria-label={isUsingObServer ? "Disable ObServer" : "Enable ObServer"}
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
                    isAuthenticated && (
                      <div className="text-xs text-center mt-1 h-4"> {/* h-4 to prevent layout shift */}
                        {renderQuotaStatus()}
                      </div>
                    )
                  ) : (
                    <div className="text-xs text-center mt-1">
                      <span className="font-semibold text-gray-500">
                        Fully Offline
                      </span>
                    </div>
                  )}
                </div>

                {/* Local Server Status Button - Hidden on official web */}
                {hostingContext !== 'official-web' && (
                  <button
                    onClick={checkLocalServerOnly}
                    className={`py-2 rounded-md flex items-center justify-center text-sm transition-colors duration-200 lg:min-w-36
                                ${localServerOnline
                                  ? 'bg-green-500 text-white'
                                  : 'bg-red-500 text-white hover:bg-red-600'
                                }
                                px-2 sm:px-3 md:px-4`}
                  >
                    {localServerOnline ? (
                      <>
                        <Server className="h-4 w-4" />
                        <span className="hidden lg:inline ml-1.5">Local: Online</span>
                      </>
                    ) : (
                      <>
                        <Server className="h-4 w-4" />
                        <RefreshCw className="h-3 w-3 ml-1" />
                        <span className="hidden lg:inline ml-1.5">Local: Offline</span>
                      </>
                    )}
                  </button>
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
          quotaInfo,
          renderQuotaStatus,
          localServerOnline,
          checkLocalServer: checkLocalServerOnly
        }}
      />

      {isStartupDialogOpen && (
        <StartupDialogs
          onDismiss={() => setIsStartupDialogOpen(false)}
          onLogin={() => authState?.loginWithRedirect()}
          onToggleObServer={handleToggleObServer}
          isAuthenticated={isAuthenticated}
          hostingContext={hostingContext}
        />
      )}
    </>
  );
};

export default AppHeader;
