// src/components/SidebarMenu.tsx
import React from 'react';
import { X, Home, Users, Database, Settings, Video } from 'lucide-react';
import { Logger } from '@utils/logging';

interface SidebarMenuProps {
  isOpen: boolean;
  onClose: () => void;
  activeTab: string;
  onTabChange: (tab: string) => void;
}

const SidebarMenu: React.FC<SidebarMenuProps> = ({
  isOpen,
  onClose,
  activeTab,
  onTabChange
}) => {
  const handleTabClick = (tab: string) => {
    onTabChange(tab);
    Logger.info('NAVIGATION', `Navigated to ${tab} tab`);
  };

  return (
    <>
      {/* Overlay */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 z-40"
          onClick={onClose}
        />
      )}
      
      {/* Sidebar */}
      <div 
        className={`fixed top-0 left-0 bottom-0 w-64 bg-white shadow-lg z-50 transform transition-transform duration-300 ease-in-out ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="p-4 border-b flex justify-between items-center">
          <h2 className="text-xl font-semibold">Observer</h2>
          <button 
            onClick={onClose}
            className="p-1 rounded-full hover:bg-gray-100"
          >
            <X className="h-6 w-6" />
          </button>
        </div>
        
        <nav className="p-4">
          <ul className="space-y-2">
            <li>
              <button
                onClick={() => handleTabClick('myAgents')}
                className={`w-full flex items-center space-x-3 px-4 py-2 rounded-md ${
                  activeTab === 'myAgents' 
                    ? 'bg-blue-100 text-blue-700' 
                    : 'hover:bg-gray-100'
                }`}
              >
                <Home className="h-5 w-5" />
                <span>My Agents</span>
              </button>
            </li>
            {/* --- NEW RECORDINGS TAB --- */}
            <li>
              <button
                onClick={() => handleTabClick('recordings')}
                className={`w-full flex items-center space-x-3 px-4 py-2 rounded-md ${
                  activeTab === 'recordings' 
                    ? 'bg-blue-100 text-blue-700' 
                    : 'hover:bg-gray-100'
                }`}
              >
                <Video className="h-5 w-5" />
                <span>Recordings</span>
              </button>
            </li>
            {/* ------------------------- */}
            <li>
              <button
                onClick={() => handleTabClick('community')}
                className={`w-full flex items-center space-x-3 px-4 py-2 rounded-md ${
                  activeTab === 'community' 
                    ? 'bg-blue-100 text-blue-700' 
                    : 'hover:bg-gray-100'
                }`}
              >
                <Users className="h-5 w-5" />
                <span>Community</span>
              </button>
            </li>
            <li>
              <button
                onClick={() => handleTabClick('models')}
                className={`w-full flex items-center space-x-3 px-4 py-2 rounded-md ${
                  activeTab === 'models' 
                    ? 'bg-blue-100 text-blue-700' 
                    : 'hover:bg-gray-100'
                }`}
              >
                <Database className="h-5 w-5" />
                <span>Models</span>
              </button>
            </li>
            <li>
              <button
                disabled
                className="w-full flex items-center space-x-3 px-4 py-2 rounded-md text-gray-400 cursor-not-allowed"
              >
                <Settings className="h-5 w-5" />
                <span>Settings</span>
                <span className="ml-auto text-xs px-1.5 py-0.5 bg-gray-200 rounded">Soon</span>
              </button>
            </li>
          </ul>
        </nav>
        
        <div className="absolute bottom-0 left-0 right-0 p-4 border-t text-center text-xs text-gray-500">
          Observer v0.1.0
        </div>
      </div>
    </>
  );
};

export default SidebarMenu;
