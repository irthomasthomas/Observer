import React, { useState, useEffect } from 'react';
import {
  Home, Users, Database, Settings, Cpu, Video, MessageCircle,
  PanelLeft, User as UserIcon, ChevronRight,
  FileText, Image as ImageIcon,
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
  const [memoriesOpen, setMemoriesOpen] = useState(false);

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
    { id: 'memories', icon: Database, label: 'Memories', color: 'blue' },
    { id: 'community', icon: Users, label: 'Community', color: 'blue' },
    { id: 'settings', icon: Settings, label: 'Settings', color: 'blue' },
  ];

  const memorySubItems = [
    { id: 'memoryText', icon: FileText, label: 'Text Memories' },
    { id: 'memoryImages', icon: ImageIcon, label: 'Image Memories' },
    { id: 'recordings', icon: Video, label: 'Video Memories' },
  ];
  const memoryTabActive = memorySubItems.some(i => i.id === activeTab);

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

                  if (item.id === 'memories') {
                    const open = memoriesOpen || memoryTabActive;
                    return (
                      <li key={item.id}>
                        <button
                          onClick={() => setMemoriesOpen(!open)}
                          aria-expanded={open}
                          className="w-full flex items-center px-3 py-2.5 rounded-lg transition-all duration-200 hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300"
                        >
                          <IconComponent className="w-5 h-5 flex-shrink-0" />
                          <span className="ml-3 text-sm font-medium flex-1 text-left">{item.label}</span>
                          <ChevronRight className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${open ? 'rotate-90' : ''}`} />
                        </button>
                        {open && (
                          <ul className="mt-1 ml-5 pl-3 border-l border-gray-200 dark:border-gray-700 space-y-0.5">
                            {memorySubItems.map((sub) => {
                              const SubIcon = sub.icon;
                              const subActive = activeTab === sub.id;
                              return (
                                <li key={sub.id}>
                                  <button
                                    onClick={() => handleTabClick(sub.id)}
                                    className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${
                                      subActive
                                        ? 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white font-medium'
                                        : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
                                    }`}
                                  >
                                    <SubIcon className="w-4 h-4 flex-shrink-0" />
                                    <span className="whitespace-nowrap">{sub.label}</span>
                                  </button>
                                </li>
                              );
                            })}
                          </ul>
                        )}
                      </li>
                    );
                  }

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

              <div className="text-[10px] text-gray-500 dark:text-gray-400 flex items-center justify-center gap-1.5 pt-1">
                <span>Observer v{version}</span>
                <span>·</span>
                {isIOS() ? (
                  <>
                    <button onClick={() => openUrl('https://observer-ai.com/#/Terms')} className="hover:text-blue-500 underline">Terms</button>
                    <span>·</span>
                    <button onClick={() => openUrl('https://observer-ai.com/#/Privacy')} className="hover:text-blue-500 underline">Privacy</button>
                  </>
                ) : (
                  <>
                    <a href="https://observer-ai.com/#/Terms" target="_blank" rel="noopener noreferrer" className="hover:text-blue-500 underline">Terms</a>
                    <span>·</span>
                    <a href="https://observer-ai.com/#/Privacy" target="_blank" rel="noopener noreferrer" className="hover:text-blue-500 underline">Privacy</a>
                  </>
                )}
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
