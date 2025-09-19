import React, { useState } from 'react';
import { Home, Users, Database, Settings, Video, Server } from 'lucide-react';
import { Logger } from '@utils/logging';

interface PersistentSidebarProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
}

const PersistentSidebar: React.FC<PersistentSidebarProps> = ({
  activeTab,
  onTabChange
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const handleTabClick = (tab: string) => {
    onTabChange(tab);
    Logger.info('NAVIGATION', `Navigated to ${tab} tab`);
  };

  const menuItems = [
    { id: 'myAgents', icon: Home, label: 'My Agents', color: 'blue' },
    { id: 'recordings', icon: Video, label: 'Recordings', color: 'blue' },
    { id: 'community', icon: Users, label: 'Community', color: 'blue' },
    { id: 'models', icon: Database, label: 'Models', color: 'blue' },
    { id: 'obServer', icon: Server, label: 'ObServer', color: 'purple' },
    { id: 'settings', icon: Settings, label: 'Settings', color: 'blue' },
  ];

  return (
    <div 
      className={`fixed top-16 left-0 bottom-0 bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-700 z-30 transition-all duration-300 ease-in-out ${
        isExpanded ? 'w-64' : 'w-16'
      }`}
      onMouseEnter={() => setIsExpanded(true)}
      onMouseLeave={() => setIsExpanded(false)}
    >

      {/* Navigation */}
      <nav className="pt-6 pb-4">
        <ul className="space-y-2 px-2">
          {menuItems.map((item) => {
            const IconComponent = item.icon;
            const isActive = activeTab === item.id;
            const isObServer = item.id === 'obServer';
            
            return (
              <li key={item.id}>
                <button
                  onClick={() => handleTabClick(item.id)}
                  className={`w-full flex items-center rounded-lg transition-all duration-200 ${
                    isExpanded ? 'px-3 py-2.5' : 'p-3 justify-center'
                  } ${
                    isActive 
                      ? isObServer
                        ? 'bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300' 
                        : 'bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300'
                      : 'hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300'
                  }`}
                  title={!isExpanded ? item.label : undefined}
                >
                  <IconComponent className={`${isExpanded ? 'w-5 h-5' : 'w-5 h-5'} flex-shrink-0`} />
                  {isExpanded && (
                    <span className="ml-3 text-sm font-medium whitespace-nowrap overflow-hidden">
                      {item.label}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Footer */}
      {isExpanded && (
        <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-gray-200 dark:border-gray-700">
          <div className="text-xs text-gray-500 dark:text-gray-400 text-center">
            Observer v0.1.0
          </div>
        </div>
      )}
    </div>
  );
};

export default PersistentSidebar;
