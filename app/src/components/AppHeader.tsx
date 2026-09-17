// components/AppHeader.tsx
import React, { useState, useEffect } from 'react';
import { Cpu, Menu, Sun, Moon } from 'lucide-react';
import type { CustomServer } from '@utils/inferenceServer';
import { isTauri } from '@utils/platform';
import { GemmaModelManager } from '@utils/localLlm/GemmaModelManager';
import { NativeLlmManager } from '@utils/localLlm/NativeLlmManager';
import SharingPermissionsModal from './SharingPermissionsModal';
import AccountModal from './AccountModal';
import type { TokenProvider } from '@utils/main_loop';

interface AuthState {
  isLoading: boolean;
  isAuthenticated: boolean;
  user: any;
  loginWithRedirect: () => void;
  logout: (options?: any) => void;
}

interface AppHeaderProps {
  authState?: AuthState;
  isUsingObServer: boolean;
  getToken: TokenProvider;
  onToggleMobileMenu?: () => void;
  isDarkMode?: boolean;
  onToggleDarkMode?: () => void;
  /** Lifted so the sidebar's logo button (PersistentSidebar) can open the same modal. */
  isPermissionsModalOpen: boolean;
  onClosePermissionsModal: () => void;
  /** Lifted so the sidebar's account button (PersistentSidebar) can open the same modal. */
  isAccountModalOpen: boolean;
  onCloseAccountModal: () => void;
  /** Connectivity state, owned by App.tsx so it's shared with the Models tab. */
  customServers: CustomServer[];
  localServerOnline: boolean;
  /** The "Models" pill navigates to the Models tab instead of opening a modal here. */
  onOpenModels: () => void;
}

const AppHeader: React.FC<AppHeaderProps> = ({
  authState,
  isUsingObServer,
  getToken,
  onToggleMobileMenu,
  isDarkMode,
  onToggleDarkMode,
  isPermissionsModalOpen,
  onClosePermissionsModal,
  isAccountModalOpen,
  onCloseAccountModal,
  customServers,
  localServerOnline,
  onOpenModels,
}) => {
  const isAuthenticated = authState?.isAuthenticated ?? false;
  const user = authState?.user;

  const [isNativeLoading, setIsNativeLoading] = useState(false);
  const [isNativeDownloading, setIsNativeDownloading] = useState(false);
  const [isModelLoading, setIsModelLoading] = useState(false);

  // Track Transformers.js model loading state
  useEffect(() => {
    const manager = GemmaModelManager.getInstance();
    const unsubscribe = manager.onStateChange((state) => {
      setIsModelLoading(state.status === 'loading');
    });
    setIsModelLoading(manager.getState().status === 'loading');
    return unsubscribe;
  }, []);

  // Track llama.cpp download/loading state (Tauri only)
  useEffect(() => {
    if (!isTauri()) return;
    const manager = NativeLlmManager.getInstance();
    const unsubscribe = manager.onStateChange((state) => {
      setIsNativeDownloading(state.status === 'downloading');
      setIsNativeLoading(state.status === 'loading');
    });
    const initial = manager.getState();
    setIsNativeDownloading(initial.status === 'downloading');
    setIsNativeLoading(initial.status === 'loading');
    return unsubscribe;
  }, []);

  const anyModelDownloading = isNativeDownloading;
  const anyModelLoading = isModelLoading || isNativeLoading;

  // Calculate overall server status based on all enabled servers
  const computedServerStatus: 'unchecked' | 'online' | 'offline' = (() => {
    const enabledCustomServersOnline = customServers.some(s => s.enabled && s.status === 'online');
    const obServerOnline = isUsingObServer && isAuthenticated;

    // If ANY enabled server is online, show green
    if (localServerOnline || obServerOnline || enabledCustomServersOnline) {
      return 'online';
    }

    // If all checked servers are offline, show red
    const hasCheckedServers = customServers.some(s => s.status !== 'unchecked');
    if (!localServerOnline && (!isUsingObServer || !isAuthenticated) && (customServers.length === 0 || hasCheckedServers)) {
      return 'offline';
    }

    // Otherwise show unchecked
    return 'unchecked';
  })();

  const handleLogout = () => {
    authState?.logout();
  };

  const handleDeleteAccount = async () => {
    try {
      const token = await getToken();
      await fetch('https://api.observer-ai.com/delete-account', {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
    } catch (error) {
      console.error('Failed to delete account:', error);
    }
    // Logout after deletion (or failed deletion attempt)
    handleLogout();
  };

  return (
    <>
      {/* Mobile-only sidebar toggle — no header bar left to host it now that the sidebar
          carries the logo/auth (desktop) and stays hidden until opened (mobile). */}
      <button
        onClick={onToggleMobileMenu}
        className="md:hidden fixed top-4 left-4 z-40 p-2.5 rounded-full bg-white/90 backdrop-blur-sm shadow-md border border-gray-200 hover:bg-gray-50"
        aria-label="Toggle navigation menu"
      >
        <Menu className="h-5 w-5 text-gray-600" />
      </button>

      {/* Floating top-right cluster — dark mode + server status/Models, Claude/ChatGPT-style
          (no full-width header bar). */}
      <div className="fixed top-4 right-4 z-40 flex items-center gap-1.5 bg-white/90 backdrop-blur-sm rounded-full shadow-md border border-gray-200 px-2 py-1.5">
        {onToggleDarkMode && (
          <button
            onClick={onToggleDarkMode}
            className="p-2 rounded-full hover:bg-gray-100"
            aria-label="Toggle dark mode"
            title="Toggle dark mode"
          >
            {isDarkMode ? (
              <Sun className="h-4 w-4 text-yellow-500" />
            ) : (
              <Moon className="h-4 w-4 text-gray-600" />
            )}
          </button>
        )}

        <div className="w-px h-5 bg-gray-200" />

        {anyModelDownloading ? (
          <svg className="h-3.5 w-3.5 animate-spin text-blue-500" viewBox="0 0 24 24" fill="none" aria-label="Downloading model…">
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeOpacity="0.25" />
            <path d="M22 12a10 10 0 00-10-10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
          </svg>
        ) : (
          <div className={`w-2.5 h-2.5 rounded-full
              ${anyModelLoading ? 'bg-yellow-400 animate-pulse'
              : computedServerStatus === 'online' ? 'bg-green-500'
              : computedServerStatus === 'offline' ? 'bg-red-500'
              : 'bg-orange-500 animate-pulse'}
          `} title={anyModelLoading ? 'Loading model…' : `Status: ${computedServerStatus}`} />
        )}

        <button
            onClick={onOpenModels}
            className="flex items-center gap-1 px-2 py-1.5 rounded-full hover:bg-gray-100"
            aria-label="Open models"
            data-tutorial-models
        >
            <Cpu className="h-4 w-4 text-gray-600" />
            <span className="text-sm text-gray-600 hidden sm:inline">Models</span>
        </button>
      </div>

      <SharingPermissionsModal
        isOpen={isPermissionsModalOpen}
        onClose={onClosePermissionsModal}
      />

      <AccountModal
        isOpen={isAccountModalOpen}
        onClose={onCloseAccountModal}
        user={user}
        onLogout={handleLogout}
        onDeleteAccount={handleDeleteAccount}
      />
    </>
  );
};

export default AppHeader;
