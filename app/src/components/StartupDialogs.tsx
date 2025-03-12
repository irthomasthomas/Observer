import React, { useState } from 'react';
import { Terminal, Cloud, Server, LogIn } from 'lucide-react';
import LocalServerSetupDialog from './LocalServerSetupDialog';

interface StartupDialogProps {
  onDismiss: () => void;
  onLogin?: () => void; // Optional function to trigger login
  serverStatus: 'unchecked' | 'online' | 'offline';
  setServerStatus: (status: 'unchecked' | 'online' | 'offline') => void;
}

const StartupDialog: React.FC<StartupDialogProps> = ({
  onDismiss,
  onLogin,
  serverStatus,
  setServerStatus
}) => {
  const [showLocalSetup, setShowLocalSetup] = useState(false);
  
  // If local setup is being shown, render that component instead
  if (showLocalSetup) {
    return (
      <LocalServerSetupDialog 
        serverStatus={serverStatus}
        setServerStatus={setServerStatus}
        onDismiss={onDismiss}
        onBack={() => setShowLocalSetup(false)}
      />
    );
  }

  // Simply dismiss the dialog when starting with Ob-Server
  const handleObServerStart = () => {
    onDismiss();
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-xl p-8 max-w-3xl w-full mx-4">
        <div className="flex items-center gap-3 mb-6">
          <Terminal className="h-8 w-8 text-blue-500" />
          <h2 className="text-2xl font-semibold">Welcome to Observer</h2>
        </div>

        <p className="text-gray-600 mb-6">Choose how you want to get started with Observer</p>

        <div className="grid md:grid-cols-2 gap-6 mb-6">
          {/* Ob-Server Cloud Card */}
          <div className="border rounded-lg p-6 shadow-sm hover:shadow-md transition-shadow bg-blue-50 border-blue-100">
            <div className="flex justify-between items-start mb-4">
              <h3 className="text-xl font-medium text-blue-700">Ob-Server Cloud</h3>
              <Cloud className="h-6 w-6 text-blue-500" />
            </div>
            
            <ul className="mb-6 space-y-2">

              <li className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-blue-500"></div>
                <span className="text-gray-700">No installation needed</span>
              </li>

              <li className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-blue-500"></div>
                <span className="text-gray-700">Easy to use</span>
              </li>

              <li className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-blue-500"></div>
                <span className="text-gray-700">Privacy respecting</span>
              </li>
            </ul>
            
            <button
              onClick={handleObServerStart}
              className="w-full px-4 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors font-medium mb-3"
            >
              Start with Ob-Server
            </button>
            
            {onLogin && (
              <button 
                onClick={onLogin} 
                className="w-full flex items-center justify-center gap-1 text-blue-600 text-sm hover:text-blue-800 transition-colors"
              >
                Log in to access <LogIn className="h-3.5 w-3.5 ml-1" />
              </button>
            )}
          </div>
          
          {/* Local Server Card */}
          <div className="border rounded-lg p-6 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex justify-between items-start mb-4">
              <h3 className="text-xl font-medium text-gray-800">Local Server</h3>
              <Server className="h-6 w-6 text-gray-500" />
            </div>
            
            <ul className="mb-6 space-y-2">
              <li className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-gray-500"></div>
                <span className="text-gray-700">Full Control</span>
              </li>
              <li className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-gray-500"></div>
                <span className="text-gray-700">Use your own hardware</span>
              </li>
              <li className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-gray-500"></div>
                <span className="text-gray-700">Complete privacy</span>
              </li>
            </ul>
            
            <button
              onClick={() => setShowLocalSetup(true)}
              className="w-full px-4 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium"
            >
              Set Up Local Server
            </button>
          </div>
        </div>
        
        <div className="text-center text-sm text-gray-500">
          You can switch between options anytime from the header
        </div>
      </div>
    </div>
  );
};

export default StartupDialog;
