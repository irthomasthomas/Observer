// src/components/StartupDialog.tsx
import React from 'react';
import { Terminal, Cloud, Server, LogIn, ExternalLink } from 'lucide-react'; // Added ExternalLink

interface StartupDialogProps {
  onDismiss: () => void;
  onLogin?: () => void;
  // serverStatus and setServerStatus are no longer needed here if we simplify this dialog
  setUseObServer?: (value: boolean) => void;
}

const StartupDialog: React.FC<StartupDialogProps> = ({
  onDismiss,
  onLogin,
  setUseObServer
}) => {
  const ollamaProxyUrl = 'https://localhost:3838'; // For the link

  const handleObServerStart = () => {
    if (setUseObServer) {
      setUseObServer(true);
    }
    onDismiss();
  };

  const handleSetupLocal = () => {
     if (setUseObServer) {
         setUseObServer(false); // Ensure local mode is selected
     }
     onDismiss(); // Dismiss, user will use header to connect/troubleshoot
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-xl shadow-xl p-6 sm:p-8 max-w-3xl w-full">
        <div className="flex items-center gap-3 mb-6">
          <Terminal className="h-8 w-8 text-blue-500" />
          <h2 className="text-xl sm:text-2xl font-semibold">Welcome to Observer</h2>
        </div>

        <p className="text-gray-600 mb-6 text-sm sm:text-base">Choose how you want to get started:</p>

        <div className="grid md:grid-cols-2 gap-6 mb-6">
          {/* Ob-Server Cloud Card */}
          <div className="border rounded-lg p-5 sm:p-6 shadow-sm hover:shadow-md transition-shadow bg-blue-50 border-blue-100">
            <div className="flex justify-between items-start mb-4">
              <h3 className="text-lg sm:text-xl font-medium text-blue-700">Ob-Server Cloud</h3>
              <Cloud className="h-6 w-6 text-blue-500" />
            </div>
            <ul className="mb-6 space-y-2 text-sm sm:text-base">
              <li className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-blue-500"></div><span className="text-gray-700">No installation needed</span></li>
              <li className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-blue-500"></div><span className="text-gray-700">Easy to use</span></li>
              <li className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-blue-500"></div><span className="text-gray-700">Privacy respecting</span></li>
            </ul>
            <button
              onClick={handleObServerStart}
              className="w-full px-4 py-2.5 sm:py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors font-medium text-sm sm:text-base mb-3"
            >
              Start with Ob-Server
            </button>
            {onLogin && (
              <button 
                onClick={onLogin} 
                className="w-full flex items-center justify-center gap-1 text-blue-600 text-xs sm:text-sm hover:text-blue-800 transition-colors"
              >
                Log in to access <LogIn className="h-3.5 w-3.5 ml-1" />
              </button>
            )}
          </div>
          
          {/* Local Server Card - Simplified */}
          <div className="border rounded-lg p-5 sm:p-6 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex justify-between items-start mb-2"> {/* Reduced mb */}
              <h3 className="text-lg sm:text-xl font-medium text-gray-800">Local Server</h3>
              <Server className="h-6 w-6 text-gray-500" />
            </div>
            <ul className="mb-4 space-y-2 text-sm sm:text-base"> {/* Reduced mb */}
              <li className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-gray-500"></div><span className="text-gray-700">Full Control</span></li>
              <li className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-gray-500"></div><span className="text-gray-700">Use your own hardware</span></li>
              <li className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-gray-500"></div><span className="text-gray-700">Complete privacy</span></li>
            </ul>
            <p className="text-xs text-gray-600 mb-3">
              If <code>observer-ollama</code> is running at <code className="text-xs bg-gray-100 p-0.5 rounded">{ollamaProxyUrl}</code>, you might need to accept its certificate:
              <a 
                 href={ollamaProxyUrl} 
                 target="_blank" 
                 rel="noopener noreferrer" 
                 className="ml-1 inline-flex items-center text-blue-600 hover:text-blue-700 hover:underline"
                 onClick={(_) => {
                     // Allow default action (opening link)
                     // Optionally, could set a flag to try connecting soon after
                 }}
               >
                 Accept Cert <ExternalLink className="h-3 w-3 ml-0.5"/>
               </a>
            </p>
            <button
              onClick={handleSetupLocal} // This will now just select local mode and dismiss
              className="w-full px-4 py-2.5 sm:py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium text-sm sm:text-base"
            >
              Use Local Server
            </button>
          </div>
        </div>
        
        <div className="text-center text-xs sm:text-sm text-gray-500">
          You can switch between options anytime from the app header.
        </div>
      </div>
    </div>
  );
};

export default StartupDialog;
