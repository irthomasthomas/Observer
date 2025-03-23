import React, { useState, useEffect } from 'react';
import { Menu } from 'lucide-react';
import { checkOllamaServer } from '@utils/ollamaServer';
import { setOllamaServerAddress } from '@utils/main_loop';
import TextBubble from './TextBubble';
import { Logger } from '@utils/logging';
import { startScreenCapture, stopScreenCapture } from '@utils/screenCapture';

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
}

const AppHeader: React.FC<AppHeaderProps> = ({
  serverStatus,
  setServerStatus,
  setError,
  authState,
  onMenuClick,
  // New props with optional nature
  isUsingObServer: externalIsUsingObServer,
  setIsUsingObServer: externalSetIsUsingObServer
}) => {
  const [serverAddress, setServerAddress] = useState('localhost:3838');
  const [showServerHint] = useState(true);
  const [pulseMenu, setPulseMenu] = useState(false);
  // Internal state as fallback if external state is not provided
  const [internalIsUsingObServer, setInternalIsUsingObServer] = useState(false);
  const [quotaInfo, setQuotaInfo] = useState<{ used: number; remaining: number } | null>(null);
  const [isLoadingQuota, setIsLoadingQuota] = useState(false);
  
  // Use either external state/setter or internal state/setter
  const isUsingObServer = externalIsUsingObServer !== undefined 
    ? externalIsUsingObServer 
    : internalIsUsingObServer;
  
  // Set a default pulsing effect when component mounts
  useEffect(() => {
    // Create a pulsing effect for the menu button
    setPulseMenu(true);
    
    // Stop pulsing after 10 seconds
    const timer = setTimeout(() => {
      setPulseMenu(false);
    }, 10000);
    
    return () => clearTimeout(timer);
  }, []);

  // State for the login hint bubble
  const [showLoginHint, setShowLoginHint] = useState(true);
  
  // State for the Ob-Server trial bubble
  const [showObServerTrialBubble, setShowObServerTrialBubble] = useState(true);

  // Only way of checking if logged in or not, Components weren't re-rendering
  useEffect(() => {
    // Save when authenticated 
    if (authState?.isAuthenticated) {
      localStorage.setItem('auth_user', JSON.stringify(authState.user || {}));
      localStorage.setItem('auth_authenticated', 'true');
      // Hide login hint when authenticated
      setShowLoginHint(false);
    }
  }, [authState?.isAuthenticated, authState?.user]);
    
  // Use local storage to override auth state when needed
  const isAuthenticated = authState?.isAuthenticated || localStorage.getItem('auth_authenticated') === 'true';
  const userData = isAuthenticated && !authState?.user ? 
    JSON.parse(localStorage.getItem('auth_user') || '{}') : 
    authState?.user;
      
  // Custom logout that clears localStorage
  const handleLogout = () => {
    localStorage.removeItem('auth_authenticated');
    localStorage.removeItem('auth_user');
    authState?.logout({ logoutParams: { returnTo: window.location.origin } });
  };

  // Fetch quota information
  const fetchQuotaInfo = async () => {
    if (serverStatus !== 'online') return;
    
    try {
      setIsLoadingQuota(true);
      const host = isUsingObServer ? 'api.observer-ai.com' : serverAddress.split(':')[0];
      const port = isUsingObServer ? '443' : serverAddress.split(':')[1];
      
      // Construct the correct URL based on whether using Ob-Server or local
      const baseUrl = isUsingObServer 
        ? `https://api.observer-ai.com`
        : `https://${host}:${port}`;
      
      const response = await fetch(`${baseUrl}/quota`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
      });
      
      if (response.ok) {
        const data = await response.json();
        setQuotaInfo({
          used: data.used,
          remaining: data.remaining
        });
        Logger.info('QUOTA', `Quota info fetched: ${data.used} used, ${data.remaining} remaining`);
      } else {
        Logger.error('QUOTA', `Failed to fetch quota info: ${response.status}`);
        setQuotaInfo(null);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      Logger.error('QUOTA', `Error fetching quota info: ${errorMessage}`, err);
      setQuotaInfo(null);
    } finally {
      setIsLoadingQuota(false);
    }
  };

  const handleScreenCaptureClick = async () => {
    try {
      await startScreenCapture();
      Logger.info('SCREEN', 'Screen capture initialized');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      Logger.error('SCREEN', `Screen capture error: ${errorMessage}`);
    }
  };

  // Modified handler for toggling Ob-Server use
  const handleToggleObServer = () => {
    const newValue = !isUsingObServer;
    
    // Use external setter if provided, otherwise use internal setter
    if (externalSetIsUsingObServer) {
      externalSetIsUsingObServer(newValue);
    } else {
      setInternalIsUsingObServer(newValue);
    }
    
    // Update server address and other settings based on the toggle
    if (newValue) {
      // Switch to Ob-Server
      setServerAddress('api.observer-ai.com');
      setOllamaServerAddress('api.observer-ai.com', '443');
      Logger.info('SERVER', 'Switched to Ob-Server (api.observer-ai.com)');
      // Check server automatically when enabling Ob-Server
      checkObServerStatus();
      // Hide the trial bubble when enabling Ob-Server
      setShowObServerTrialBubble(false);
    } else {
      // Switch back to custom server
      setServerAddress('localhost:3838');
      setOllamaServerAddress('localhost', '3838');
      Logger.info('SERVER', 'Switched to custom server mode');
      setServerStatus('unchecked');
      setQuotaInfo(null);
      // Show the trial bubble again when disabling Ob-Server
      setShowObServerTrialBubble(true);
    }
  };

  const checkObServerStatus = async () => {
    try {
      setServerStatus('unchecked');
      Logger.info('SERVER', 'Checking connection to Ob-Server (api.observer-ai.com)');
      
      // Set the server address for agent loops
      setOllamaServerAddress('api.observer-ai.com', '443');
      
      // We'll just assume Ob-Server is online for simplicity
      // In a real implementation, you might want to do an actual health check
      setServerStatus('online');
      setError(null);
      Logger.info('SERVER', 'Connected successfully to Ob-Server at api.observer-ai.com');
      
      // Fetch quota information after successful connection
      fetchQuotaInfo();
    } catch (err) {
      setServerStatus('offline');
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError('Failed to connect to Ob-Server');
      Logger.error('SERVER', `Error checking Ob-Server status: ${errorMessage}`, err);
    }
  };

  const checkServerStatus = async () => {
    if (isUsingObServer) {
      checkObServerStatus();
      return;
    }
    
    try {
      setServerStatus('unchecked');
      const [host, port] = serverAddress.split(':');
      
      Logger.info('SERVER', `Checking connection to Ollama server at ${host}:${port}`);
      
      // Set the server address for agent loops
      setOllamaServerAddress(host, port);
      
      const result = await checkOllamaServer(host, port);
      
      if (result.status === 'online') {
        setServerStatus('online');
        setError(null);
        Logger.info('SERVER', `Connected successfully to Ollama server at ${host}:${port}`);
        
        // Fetch quota information after successful connection
        fetchQuotaInfo();
      } else {
        setServerStatus('offline');
        setError(result.error || 'Failed to connect to Ollama server');
        Logger.error('SERVER', `Failed to connect to Ollama server: ${result.error || 'Unknown error'}`);
      }
    } catch (err) {
      setServerStatus('offline');
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError('Failed to connect to Ollama server');
      Logger.error('SERVER', `Error checking server status: ${errorMessage}`, err);
    }
  };

  const handleServerAddressChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (isUsingObServer) return; // Don't allow changes when using Ob-Server
    
    const newAddress = e.target.value;
    setServerAddress(newAddress);
    
    // Update server address for agent loops when input changes
    if (newAddress.includes(':')) {
      const [host, port] = newAddress.split(':');
      setOllamaServerAddress(host, port);
      Logger.debug('SERVER', `Server address updated to ${host}:${port}`);
    }
  };

  // Refresh quota information when status is online or server changes
  useEffect(() => {
    if (serverStatus === 'online') {
      fetchQuotaInfo();
    }
  }, [serverStatus, isUsingObServer]);

  // Effect to update server address and check connection when isUsingObServer changes
  useEffect(() => {
    if (isUsingObServer) {
      setServerAddress('api.observer-ai.com');
      checkObServerStatus();
    } else {
      setServerAddress('localhost:3838');
    }
  }, [isUsingObServer]);

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
      
      {/* Fixed Header */}
      <header className="fixed top-0 left-0 right-0 bg-white shadow-md z-50">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center space-x-4">
              {/* Hamburger Menu Button with conditional highlight */}
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
                onClick={handleScreenCaptureClick}
                title="Initialize screen capture"
              />


                <h1 className="text-xl font-semibold">Observer</h1>
              </div> 

            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2">
                {/* Ob-Server Toggle Switch (available to all users) */}
                <div className="flex flex-col items-center">
                  <div className="flex items-center space-x-2">
                    <span className="text-sm text-gray-600">Ob-Server</span>
                    <button 
                      className={`relative inline-flex items-center h-6 rounded-full w-11 transition-colors focus:outline-none ${
                        isUsingObServer ? 'bg-blue-500' : 'bg-gray-200'
                      }`}
                      onClick={handleToggleObServer}
                    >
                      <span
                        className={`inline-block w-4 h-4 transform transition-transform bg-white rounded-full ${
                          isUsingObServer ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </div>
                  
                  {/* Quota Information Display */}
                  {isUsingObServer && serverStatus === 'online' && (
                    <div className="text-xs text-center mt-1">
                      {isLoadingQuota ? (
                        <span className="text-gray-500">Loading quota...</span>
                      ) : quotaInfo ? (
                        <span className={`font-medium ${
                          !isAuthenticated && quotaInfo.remaining <= 5 ? 
                          quotaInfo.remaining === 0 ? 'text-red-500' : 'text-orange-500' 
                          : 'text-green-600'
                        }`}>
                          {isAuthenticated ? 
                            'Unlimited access' : 
                            `${quotaInfo.remaining}/${5} executions left`}
                        </span>
                      ) : (
                        <span className="text-gray-500">Quota unavailable</span>
                      )}
                    </div>
                  )}
                </div>
                
                {/* Server Address Input (disabled when using Ob-Server) */}
                <input
                  type="text"
                  value={serverAddress}
                  onChange={handleServerAddressChange}
                  placeholder="api.observer.local"
                  className={`px-3 py-2 border rounded-md ${isUsingObServer ? 'bg-gray-100 opacity-70' : ''}`}
                  disabled={isUsingObServer}
                />
                
                <button
                  onClick={checkServerStatus}
                  className={`px-4 py-2 rounded-md ${
                    serverStatus === 'online' 
                      ? 'bg-green-500 text-white' 
                      : serverStatus === 'offline'
                      ? 'bg-red-500 text-white'
                      : 'bg-gray-200'
                  }`}
                >
                  {serverStatus === 'online' ? '✓ Connected' : 
                   serverStatus === 'offline' ? '✗ Disconnected' : 
                   'Check Server'}
                </button>
              </div>

              <div className="flex items-center space-x-4">
                {/* Authentication UI */}
                {authState ? (
                  authState.isLoading ? (
                    <div className="px-4 py-2 bg-gray-100 rounded">Loading...</div>
                  ) : isAuthenticated ? (
                    <div className="flex items-center space-x-3">
                      <span className="text-sm text-gray-700">
                        {userData?.name || userData?.email || 'User'}
                      </span>
                      <button
                        onClick={handleLogout}
                        className="px-3 py-1 bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
                      >
                        Logout
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => authState.loginWithRedirect()}
                      className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600"
                    >
                      Log In | Sign Up
                    </button>
                  )
                ) : (
                  <div className="px-4 py-2 bg-yellow-100 text-yellow-800 rounded text-sm">
                    Auth not initialized
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </header>

      {showServerHint && !isUsingObServer && (
        <div className="fixed z-60" style={{ top: '70px', right: '35%' }}>
          <TextBubble 
            message="Enter your Observer-Ollama address here! (default: localhost:3838)" 
            duration={7000} 
          />
        </div>
      )}
      
      {/* Ob-Server Activated Bubble */}
      {isUsingObServer && (
        <div className="fixed z-60" style={{ top: '70px', right: '35%' }}>
          <TextBubble 
            message={isAuthenticated ? 
              "✅ You're using our hosted Ob-Server service with unlimited access!" :
              "✅ You're using our hosted Ob-Server service! Sign in for unlimited access."
            } 
            duration={5000} 
          />
        </div>
      )}
      
      {/* Login Hint Bubble - show to non-auth users using Ob-Server with low quota */}
      {!isAuthenticated && isUsingObServer && quotaInfo && quotaInfo.remaining <= 3 && quotaInfo.remaining > 0 && showLoginHint && (
        <div className="fixed z-60" style={{ top: '110px', right: '20px' }}>
          <div className="bg-white rounded-lg shadow-lg p-3 max-w-xs relative">
            <button 
              onClick={() => setShowLoginHint(false)}
              className="absolute top-2 right-2 text-gray-400 hover:text-gray-600"
              aria-label="Close"
            >
              <span className="text-lg">×</span>
            </button>
            <div className="flex items-start mb-2">
              <span className="mr-2 text-blue-500">💡</span>
              <p className="text-sm text-gray-700">
                You have {quotaInfo.remaining} executions left. Sign in to get unlimited access!
              </p>
            </div>
            <button 
              onClick={() => authState?.loginWithRedirect()}
              className="w-full mt-2 px-3 py-1 bg-green-500 text-white rounded-md hover:bg-green-600 text-sm"
            >
              Sign In
            </button>
          </div>
        </div>
      )}
      
      {/* Ob-Server Free Trial Bubble - for all users not using Ob-Server */}
      {!isUsingObServer && showObServerTrialBubble && (
        <div className="fixed z-60" style={{ top: '110px', left: '50%', transform: 'translateX(-50%)' }}>
          <div className="bg-white rounded-lg shadow-lg p-3 max-w-xs relative">
            <button 
              onClick={() => setShowObServerTrialBubble(false)}
              className="absolute top-2 right-2 text-gray-400 hover:text-gray-600"
              aria-label="Close"
            >
              <span className="text-lg">×</span>
            </button>
            <div className="flex items-start mb-2">
              <span className="mr-2 text-blue-500">🚀</span>
              <p className="text-sm text-gray-700">
                {isAuthenticated ? 
                  "Try our hosted Ob-Server with unlimited access!" : 
                  "Try our hosted Ob-Server with 5 free executions! Sign in for unlimited access."}
              </p>
            </div>
            <button 
              onClick={handleToggleObServer}
              className="w-full mt-2 px-3 py-1 bg-blue-500 text-white rounded-md hover:bg-blue-600 text-sm"
            >
              Enable
            </button>
          </div>
        </div>
      )}
    </>
  );
};

export default AppHeader;
