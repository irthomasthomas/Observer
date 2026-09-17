import React, { useState, useEffect } from 'react';
import {
  Home, Users, Database, Settings, Cpu, Video, Sparkles, MessageCircle,
  PanelLeft, User as UserIcon, MessageSquare, Terminal,
} from 'lucide-react';
import { Logger } from '@utils/logging';
import { isIOS, isTauri } from '../utils/platform';
import { openUrl } from '@tauri-apps/plugin-opener';
import { version } from '../../package.json';
import type { QuotaInfo } from '@/types/quota';
import type { CustomServer } from '@utils/inferenceServer';
import { GemmaModelManager } from '@utils/localLlm/GemmaModelManager';
import { NativeLlmManager } from '@utils/localLlm/NativeLlmManager';

interface SidebarAuthState {
  isLoading: boolean;
  isAuthenticated: boolean;
  user: any;
  loginWithRedirect: () => void;
}

interface PersistentSidebarProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  isMobileMenuOpen?: boolean;
  onCloseMobileMenu?: () => void;
  authState?: SidebarAuthState;
  quotaInfo?: QuotaInfo | null;
  onOpenAccount: () => void;
  onOpenPermissions: () => void;
  onFeedbackClick: () => void;
  onToggleLogs: () => void;
  /** Lifted to App.tsx: a standard (non-overlaying) sidebar needs App.tsx's layout to know
   *  its width, since it's a real flex sibling of main now, not a fixed box floating on top. */
  isExpanded: boolean;
  onToggleExpanded: () => void;
  /** Connectivity state, owned by App.tsx — drives the status dot on the Models item
   *  (moved here from the old AppHeader floating cluster). */
  isUsingObServer: boolean;
  customServers: CustomServer[];
  localServerOnline: boolean;
}

const PersistentSidebar: React.FC<PersistentSidebarProps> = ({
  activeTab,
  onTabChange,
  isMobileMenuOpen = false,
  onCloseMobileMenu,
  authState,
  quotaInfo,
  onOpenAccount,
  onOpenPermissions,
  onFeedbackClick,
  onToggleLogs,
  isExpanded,
  onToggleExpanded,
  isUsingObServer,
  customServers,
  localServerOnline,
}) => {
  const isAuthenticated = authState?.isAuthenticated ?? false;

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
  // On mobile the sidebar is always the full (expanded) drawer when open — there's no
  // separate "collapsed strip" concept there, only open/closed.
  const showExpanded = isExpanded || isMobileMenuOpen;

  const handleTabClick = (tab: string) => {
    onTabChange(tab);
    Logger.info('NAVIGATION', `Navigated to ${tab} tab`);

    if (onCloseMobileMenu) {
      onCloseMobileMenu();
    }
  };

  const menuItems = [
    { id: 'observerChat', icon: MessageCircle, label: 'Observer', color: 'purple' },
    { id: 'myAgents', icon: Home, label: 'Micro Agents', color: 'blue' },
    { id: 'models', icon: Cpu, label: 'Models', color: 'blue' },
    { id: 'memoryStore', icon: Database, label: 'Memories', color: 'blue' },
    { id: 'recordings', icon: Video, label: 'Recordings', color: 'blue' },
    { id: 'community', icon: Users, label: 'Community', color: 'blue' },
    { id: 'obServer', icon: Sparkles, label: 'Subscription', color: 'purple' },
    { id: 'settings', icon: Settings, label: 'Settings', color: 'blue' },
  ];

  const tierBadge = quotaInfo?.tier === 'max' ? 'MAX' : quotaInfo?.tier === 'pro' ? 'pro' : quotaInfo?.tier === 'plus' ? 'plus' : null;

  return (
    <>
      {/* Mobile Overlay */}
      {isMobileMenuOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-40 md:hidden"
          onClick={onCloseMobileMenu}
        />
      )}

      {/* Sidebar — a standard in-flow flex sibling of main on desktop (md:static), so main
          never needs to know or match its width by hand. Only on mobile is it a fixed
          off-canvas drawer, toggled by translate-x. */}
      <div
        className={`${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0
          fixed top-0 bottom-0 left-0 z-50 md:static md:z-auto
          bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-700
          transition-all duration-300 ease-in-out flex flex-col flex-shrink-0
          w-64 ${showExpanded ? 'md:w-64' : 'md:w-16'}`}
        style={{ paddingTop: 'env(safe-area-inset-top)' }}
      >
        {showExpanded ? (
          <>
            {/* Header — logo (was AppHeader's), doubles as the screen-capture-permissions trigger */}
            <div className="flex items-center justify-between shrink-0 px-3 py-4">
              <button onClick={onOpenPermissions} className="flex items-center gap-2 min-w-0" title="Initialize screen capture">
                <img src="/eye-logo-black.svg" alt="Observer" className="h-7 w-7 flex-shrink-0 hover:opacity-80" />
                <span className="relative text-lg font-semibold text-gray-900 dark:text-white truncate">
                  Observer
                  {tierBadge && (
                    <span className="absolute -top-1 -right-6 text-[10px] font-semibold text-gray-500">{tierBadge}</span>
                  )}
                </span>
              </button>
              <button
                onClick={onToggleExpanded}
                className="hidden md:flex p-1.5 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400"
                title="Collapse sidebar"
              >
                <PanelLeft className="w-4 h-4" />
              </button>
            </div>

            {/* Navigation */}
            <nav className="flex-1 min-h-0 overflow-y-auto pt-2 pb-4">
              <ul className="space-y-2 px-2">
                {menuItems.map((item) => {
                  const IconComponent = item.icon;
                  const isActive = activeTab === item.id;
                  const isPurple = item.color === 'purple';
                  const isModels = item.id === 'models';

                  return (
                    <li key={item.id}>
                      <button
                        onClick={() => handleTabClick(item.id)}
                        className={`w-full flex items-center px-3 py-2.5 rounded-lg transition-all duration-200 ${
                          isActive
                            ? isPurple
                              ? 'bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300'
                              : 'bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300'
                            : 'hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300'
                        }`}
                        {...(isModels ? { 'data-tutorial-models': true } : {})}
                      >
                        <IconComponent className="w-5 h-5 flex-shrink-0" />
                        <span className="ml-3 text-sm font-medium whitespace-nowrap overflow-hidden flex-1 text-left">
                          {item.label}
                        </span>
                        {isModels && (
                          anyModelDownloading ? (
                            <svg className="h-3 w-3 flex-shrink-0 animate-spin text-blue-500" viewBox="0 0 24 24" fill="none" aria-label="Downloading model…">
                              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeOpacity="0.25" />
                              <path d="M22 12a10 10 0 00-10-10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                            </svg>
                          ) : (
                            <span
                              className={`w-2 h-2 rounded-full flex-shrink-0
                                ${anyModelLoading ? 'bg-yellow-400 animate-pulse'
                                : computedServerStatus === 'online' ? 'bg-green-500'
                                : computedServerStatus === 'offline' ? 'bg-red-500'
                                : 'bg-orange-500 animate-pulse'}
                              `}
                              title={anyModelLoading ? 'Loading model…' : `Status: ${computedServerStatus}`}
                            />
                          )
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </nav>

            {/* Footer — support links + auth/account (both relocated from the old AppHeader /
                floating app footer so there's one consistent home for them). */}
            <div className="shrink-0 border-t border-gray-200 dark:border-gray-700 p-2 space-y-1">
              <div className="flex items-center gap-1">
                <button onClick={onFeedbackClick} className="p-2 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500" title="Feedback">
                  <MessageSquare className="w-4 h-4" />
                </button>
                <a href="https://discord.gg/wnBb7ZQDUC" target="_blank" rel="noopener noreferrer" className="p-2 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 text-indigo-500" title="Discord">
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor"><path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.127 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03z" /></svg>
                </a>
                <a href="https://x.com/AppObserverAI" target="_blank" rel="noopener noreferrer" className="p-2 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300" title="X / Twitter">
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.244H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" /></svg>
                </a>
                <a href="https://buymeacoffee.com/roy3838" target="_blank" rel="noopener noreferrer" className="p-2 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 text-yellow-600" title="Support the project">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" className="h-4 w-4"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" /></svg>
                </a>
                <a href="https://github.com/Roy3838/Observer" target="_blank" rel="noopener noreferrer" className="p-2 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300" title="GitHub">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" className="h-4 w-4"><path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22" /></svg>
                </a>
                <button onClick={onToggleLogs} className="p-2 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500" title="Console">
                  <Terminal className="w-4 h-4" />
                </button>
              </div>

              {/* Auth / account */}
              {authState && (
                authState.isLoading ? (
                  <div className="text-xs text-gray-400 px-2 py-1.5">...</div>
                ) : authState.isAuthenticated ? (
                  <button
                    onClick={onOpenAccount}
                    className="w-full flex items-center gap-2 px-2 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
                    title="Account settings"
                  >
                    <div className="w-7 h-7 rounded-full flex-shrink-0 overflow-hidden bg-gray-200 flex items-center justify-center">
                      {authState.user?.picture ? (
                        <img src={authState.user.picture} alt={authState.user?.name || 'User avatar'} className="w-full h-full object-cover" />
                      ) : (
                        <UserIcon className="h-4 w-4 text-gray-600" />
                      )}
                    </div>
                    <span className="text-sm text-gray-700 dark:text-gray-300 truncate">
                      {authState.user?.name || authState.user?.email || 'Account'}
                    </span>
                  </button>
                ) : (
                  <button
                    onClick={() => authState.loginWithRedirect()}
                    className="w-full px-3 bg-green-500 text-white rounded-lg hover:bg-green-600 text-sm font-medium py-2"
                  >
                    Log In | Sign Up
                  </button>
                )
              )}

              <div className="text-xs text-gray-500 dark:text-gray-400 text-center space-y-1 pt-1">
                <div>Observer v{version}</div>
                <div className="flex justify-center gap-2">
                  {isIOS() ? (
                    <>
                      <button onClick={() => openUrl('https://observer-ai.com/#/Privacy')} className="hover:text-blue-500 underline">Privacy</button>
                      <span>·</span>
                      <button onClick={() => openUrl('https://observer-ai.com/#/Terms')} className="hover:text-blue-500 underline">Terms</button>
                    </>
                  ) : (
                    <>
                      <a href="https://observer-ai.com/#/Privacy" target="_blank" rel="noopener noreferrer" className="hover:text-blue-500 underline">Privacy</a>
                      <span>·</span>
                      <a href="https://observer-ai.com/#/Terms" target="_blank" rel="noopener noreferrer" className="hover:text-blue-500 underline">Terms</a>
                    </>
                  )}
                </div>
              </div>
            </div>
          </>
        ) : (
          // Collapsed (desktop only — mobile is always the full drawer above): just the
          // logo and an expand button, nothing else. No icon-only nav state to keep in sync.
          <div className="flex flex-col items-center py-4 gap-3">
            <button onClick={onOpenPermissions} title="Initialize screen capture">
              <img src="/eye-logo-black.svg" alt="Observer" className="h-7 w-7 hover:opacity-80" />
            </button>
            <button
              onClick={onToggleExpanded}
              className="p-1.5 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400"
              title="Expand sidebar"
            >
              <PanelLeft className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </>
  );
};

export default PersistentSidebar;
