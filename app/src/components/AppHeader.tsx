import React, { useState, useEffect } from 'react';
import { Menu, LogOut, ExternalLink, RefreshCw } from 'lucide-react'; 
import { checkOllamaServer } from '@utils/ollamaServer';
import { setOllamaServerAddress } from '@utils/main_loop';
import TextBubble from './TextBubble';
import { Logger } from '@utils/logging';
import { startScreenCapture } from '@utils/screenCapture';

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
  isUsingObServer: externalIsUsingObServer,
  setIsUsingObServer: externalSetIsUsingObServer
}) => {
  const [serverAddress, setServerAddress] = useState('localhost:3838');
  const [pulseMenu, setPulseMenu] = useState(false);
  const [internalIsUsingObServer, setInternalIsUsingObServer] = useState(false);
  const [quotaInfo, setQuotaInfo] = useState<{ used: number; remaining: number } | null>(null);
  const [isLoadingQuota, setIsLoadingQuota] = useState(false);
  
  const isUsingObServer = externalIsUsingObServer !== undefined 
    ? externalIsUsingObServer 
    : internalIsUsingObServer;
  
  useEffect(() => {
    setPulseMenu(true);
    const timer = setTimeout(() => {
      setPulseMenu(false);
    }, 10000);
    return () => clearTimeout(timer);
  }, []);

  const [showLoginHint, setShowLoginHint] = useState(true);
    
  useEffect(() => {
    if (authState?.isAuthenticated) {
      localStorage.setItem('auth_user', JSON.stringify(authState.user || {}));
      localStorage.setItem('auth_authenticated', 'true');
      setShowLoginHint(false);
      
      if (isUsingObServer && authState.user?.sub) {
        registerWithObserver(authState.user.sub);
      }
    }
  }, [authState?.isAuthenticated, authState?.user, isUsingObServer]);
    
  const isAuthenticated = authState?.isAuthenticated || localStorage.getItem('auth_authenticated') === 'true';
  const userData = isAuthenticated && !authState?.user ? 
    JSON.parse(localStorage.getItem('auth_user') || '{}') : 
    authState?.user;
      
  const handleLogout = () => {
    localStorage.removeItem('auth_authenticated');
    localStorage.removeItem('auth_user');
    authState?.logout({ logoutParams: { returnTo: window.location.origin } });
  };

  const registerWithObserver = async (userId: string) => {
    try {
      Logger.info('AUTH', `Registering with Observer backend for user: ${userId}`);
      const response = await fetch('https://api.observer-ai.com/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId })
      });
      
      if (!response.ok) throw new Error(`Failed to register with Observer: ${response.status}`);
      
      const data = await response.json();
      if (data.auth_code) {
        localStorage.setItem('observer_auth_code', data.auth_code);
        Logger.info('AUTH', `Successfully saved auth code: ${data.auth_code}`);
      } else {
        throw new Error('No auth code received from server');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      Logger.error('AUTH', `Error registering with Observer backend: ${errorMessage}`, err);
    }
  };

  const fetchQuotaInfo = async () => {
    if (serverStatus !== 'online') return;
    
    try {
      setIsLoadingQuota(true);
      const baseUrl = isUsingObServer ? 'https://api.observer-ai.com' : `https://${serverAddress}`;
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      const authCode = localStorage.getItem('observer_auth_code');
      
      if (authCode && isUsingObServer) {
        headers['X-Observer-Auth-Code'] = authCode;
      }
      
      const response = await fetch(`${baseUrl}/quota`, { method: 'GET', headers });
      
      if (response.ok) {
        const data = await response.json();
        setQuotaInfo({ used: data.used, remaining: data.remaining });
      } else {
        setQuotaInfo(null);
      }
    } catch (err) {
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

  const handleToggleObServer = () => {
    const newValue = !isUsingObServer;
    
    if (externalSetIsUsingObServer) {
      externalSetIsUsingObServer(newValue);
    } else {
      setInternalIsUsingObServer(newValue);
    }
    
    if (newValue) {
      setServerAddress('api.observer-ai.com');
      setOllamaServerAddress('api.observer-ai.com', '443');
      Logger.info('SERVER', 'Switched to Ob-Server (api.observer-ai.com)');
      checkObServerStatus();
    } else {
      setServerAddress('localhost:3838');
      setOllamaServerAddress('localhost', '3838');
      Logger.info('SERVER', 'Switched to custom server mode');
      setServerStatus('unchecked');
      setQuotaInfo(null);
    }
  };

  const checkObServerStatus = async () => {
    try {
      setServerStatus('unchecked');
      Logger.info('SERVER', 'Checking connection to Ob-Server (api.observer-ai.com)');
      setOllamaServerAddress('api.observer-ai.com', '443');
      
      if (isAuthenticated && userData?.sub) {
        await registerWithObserver(userData.sub);
      }
      
      setServerStatus('online');
      setError(null);
      Logger.info('SERVER', 'Connected successfully to Ob-Server at api.observer-ai.com');
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
      setOllamaServerAddress(host, port);
      
      const result = await checkOllamaServer(host, port);
      
      if (result.status === 'online') {
        setServerStatus('online');
        setError(null);
        Logger.info('SERVER', `Connected successfully to Ollama server at ${host}:${port}`);
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
    if (isUsingObServer) return;
    
    const newAddress = e.target.value;
    setServerAddress(newAddress);
    
    if (newAddress.includes(':')) {
      const [host, port] = newAddress.split(':');
      setOllamaServerAddress(host, port);
    }
  };

  const getServerUrl = () => {
    let url = serverAddress;
    if (!/^https?:\/\//i.test(url)) {
      url = url.includes('observer-ai.com') ? `https://${url}` : `http://${url}`;
    }
    return url;
  };

  useEffect(() => {
    if (serverStatus === 'online') {
      fetchQuotaInfo();
    }
  }, [serverStatus, isUsingObServer]);

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
                onClick={handleScreenCaptureClick}
                title="Initialize screen capture"
              />
              <h1 className="text-xl font-semibold hidden md:block">Observer</h1>
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
                        isUsingObServer ? 'bg-blue-500' : 'bg-gray-200'
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
                  {isUsingObServer && serverStatus === 'online' && (
                    <div className="text-xs text-center mt-1">
                      {isLoadingQuota ? (
                        <span className="text-gray-500">Loading...</span>
                      ) : quotaInfo ? (
                        <span className={`font-medium ${
                          !isAuthenticated && quotaInfo.remaining <= 10 ? 
                          quotaInfo.remaining === 0 ? 'text-red-500' : 'text-orange-500' 
                          : 'text-green-600'
                        }`}>
                          {isAuthenticated ? 
                            'Unlimited access' : 
                            `${quotaInfo.remaining}/${10} left`}
                        </span>
                      ) : (
                        <span className="text-gray-500">Quota N/A</span>
                      )}
                    </div>
                  )}
                </div>
                {/* Server Address Input */}
                <input
                  type="text"
                  value={serverAddress}
                  onChange={handleServerAddressChange}
                  placeholder="api.observer.local"
                  className={`px-2 sm:px-3 py-2 border rounded-md text-sm 
                              ${isUsingObServer ? 'bg-gray-100 opacity-70' : ''} 
                              w-32 sm:w-32 md:w-32 lg:w-auto`}
                  disabled={isUsingObServer}
                />

                {/* MODIFIED: Status Button with new logic */}
                <button
                  onClick={checkServerStatus}
                  className={`py-2 rounded-md flex items-center justify-center text-sm transition-colors duration-200 lg:min-w-32
                              ${serverStatus === 'online'
                                ? 'bg-green-500 text-white'
                                : serverStatus === 'offline'
                                ? 'bg-red-500 text-white hover:bg-red-600'
                                : 'bg-orange-500 text-white hover:bg-orange-600' // 'unchecked' is orange
                              }
                              px-2 sm:px-3 md:px-4`}
                >
                  {serverStatus === 'online' ? (
                    <>
                      <span aria-hidden="true">✓</span>
                      <span className="hidden lg:inline ml-1.5">Connected</span>
                    </>
                  ) : ( // Covers both 'offline' and 'unchecked' states
                    <>
                      <RefreshCw className="h-4 w-4" />
                      <span className="hidden lg:inline ml-1.5">Retry</span>
                    </>
                  )}
                </button>
                
                {/* MODIFIED: Helper link visibility */}
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
                        {userData?.name || userData?.email || 'User'}
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
      
      {/* Pop-up Bubbles remain the same */}
      {isUsingObServer && (
        <div className="fixed z-60" style={{ top: '70px', right: '35%' }}>
          <TextBubble 
            message={isAuthenticated ? 
              "✅ Ob-Server: Unlimited Access" :
              "✅ Ob-Server: Sign in for unlimited access."
            } 
            duration={5000} 
          />
        </div>
      )}
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
    </>
  );
};

export default AppHeader;
