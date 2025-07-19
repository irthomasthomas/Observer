import React, { useState } from 'react';
import { Terminal, Cloud, Server, AlertTriangle } from 'lucide-react';
import { getOllamaServerAddress } from '@utils/main_loop';

interface StartupDialogProps {
  onDismiss: () => void;
  onLogin?: () => void;
  setUseObServer?: (value: boolean) => void;
  isAuthenticated: boolean;
  // This prop determines the UI's behavior
  hostingContext: 'official-web' | 'self-hosted' | 'tauri';
}

const StartupDialog: React.FC<StartupDialogProps> = ({
  onDismiss,
  onLogin,
  setUseObServer,
  isAuthenticated,
  hostingContext
}) => {
  // State to manage which view is shown: the initial choice or the warning.
  const [view, setView] = useState<'initial' | 'local-warning'>('initial');

  // Handler for the "Ob-Server" option
  const handleObServerStart = () => {
    if (!isAuthenticated) {
      if (onLogin) onLogin();
    } else {
      if (setUseObServer) setUseObServer(true);
      onDismiss();
    }
  };

  // When "Use Local Server" is clicked, check the context before proceeding.
  const handleSetupLocalClick = () => {
    if (hostingContext === 'official-web') {
      // If on the main website, show the warning instead of immediately proceeding.
      setView('local-warning');
    } else {
      // On self-hosted/Tauri versions, it works out of the box.
      if (setUseObServer) setUseObServer(false);
      onDismiss();
    }
  };
  
  // Handler for the "Proceed, I know what I'm doing" button on the warning screen.
  const handleProceedWithLocal = () => {
    if (setUseObServer) setUseObServer(false);
    onDismiss();
  };

  // Helper to open the server address for certificate acceptance
  const handleAcceptCertClick = (e: React.MouseEvent) => {
    e.preventDefault();
    const { host, port } = getOllamaServerAddress();
    const url = `${host}:${port}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100] backdrop-blur-sm p-4">
      <div className="bg-white rounded-xl shadow-xl p-4 sm:p-6 md:p-8 max-w-3xl w-full transition-all duration-300">
        
        {/* View 1: Initial Selection */}
        {view === 'initial' && (
          <>
            <div className="flex items-center gap-3 mb-4 sm:mb-6">
              <Terminal className="h-7 w-7 sm:h-8 sm:w-8 text-blue-500" />
              <h2 className="text-xl sm:text-2xl font-semibold">Welcome to Observer</h2>
            </div>
            <p className="text-gray-600 mb-6 text-sm sm:text-base">Choose how you want to get started:</p>
            
            <div className="grid md:grid-cols-2 gap-4 md:gap-6 mb-6">
              {/* Ob-Server Cloud Card */}
              <div className="border rounded-lg p-4 sm:p-5 shadow-sm hover:shadow-md transition-shadow bg-blue-50 border-blue-100 flex flex-col justify-between h-full">
                <div>
                    <div className="flex justify-between items-start mb-4">
                        <h3 className="text-lg font-medium text-blue-700">Ob-Server Cloud</h3>
                        <Cloud className="h-5 w-5 sm:h-6 sm:w-6 text-blue-500" />
                    </div>
                    <ul className="space-y-2 text-sm hidden sm:block">
                        <li className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-blue-500 flex-shrink-0"></div><span className="text-gray-700">No installation needed</span></li>
                        <li className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-blue-500 flex-shrink-0"></div><span className="text-gray-700">Easy to use</span></li>
                        <li className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-blue-500 flex-shrink-0"></div><span className="text-gray-700">Privacy respecting</span></li>
                    </ul>
                    <p className="text-sm text-blue-800/80 block sm:hidden">Easy · No Install · Privacy Respecting</p>
                </div>
                <div className="mt-6">
                    <button onClick={handleObServerStart} className="w-full px-4 py-2.5 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors font-medium text-sm">
                        {isAuthenticated ? 'Start with Ob-Server' : 'Log In to Get Started'}
                    </button>
                </div>
              </div>
              
              {/* Local Server Card */}
              <div className="border rounded-lg p-4 sm:p-5 shadow-sm hover:shadow-md transition-shadow bg-gray-50 border-gray-200 flex flex-col justify-between h-full">
                <div>
                    <div className="flex justify-between items-start mb-4">
                        <h3 className="text-lg font-medium text-slate-800">Local Server</h3>
                        <Server className="h-5 w-5 sm:h-6 sm:w-6 text-slate-500" />
                    </div>
                    <ul className="space-y-2 text-sm hidden sm:block">
                        <li className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-slate-500 flex-shrink-0"></div><span className="text-gray-700">Full Control</span></li>
                        <li className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-slate-500 flex-shrink-0"></div><span className="text-gray-700">Use your own hardware</span></li>
                        <li className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-slate-500 flex-shrink-0"></div><span className="text-gray-700">Complete privacy</span></li>
                    </ul>
                    <p className="text-sm text-slate-600 block sm:hidden">Full Control · Complete Privacy</p>
                </div>
                <div className="mt-6">
                    <p className="text-center text-xs text-gray-600 mb-2 leading-relaxed">
                      Run <a href="https://github.com/Roy3838/Observer" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">observer-ollama</a> and <a href="#" onClick={handleAcceptCertClick} className="text-blue-600 hover:underline">check server</a>.
                    </p>
                    <button onClick={handleSetupLocalClick} className="w-full px-4 py-2.5 bg-slate-700 text-white rounded-lg hover:bg-slate-800 transition-colors font-medium text-sm">
                        Use Local Server
                    </button>
                </div>
              </div>
            </div>
            <div className="text-center text-xs sm:text-sm text-gray-500 mt-6">
              You can switch between options anytime from the app header.
            </div>
          </>
        )}

        {/* View 2: The Warning for Local Setup on Official Site */}
        {view === 'local-warning' && (
          <div>
            <div className="flex items-center gap-3 mb-4">
              <AlertTriangle className="h-7 w-7 text-orange-500 flex-shrink-0" />
              <h2 className="text-xl sm:text-2xl font-semibold">Heads-Up: Connecting Locally</h2>
            </div>
            
            <p className="text-gray-700 mb-4">
              To connect your local models to our secure website (<span className="font-mono bg-gray-100 px-1 rounded text-sm">app.observer-ai.com</span>), your browser requires that your local server also use a secure (HTTPS) connection.
            </p>

            <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
                <h3 className="font-semibold text-green-800 mb-2">Recommended Solution: Self-Host</h3>
                <p className="text-sm text-green-700 mb-3">
                    Our Docker and upcoming Desktop App setups run everything on your machine, which avoids this browser security issue entirely and is the easiest path for local inference.
                </p>
                <div className="flex flex-wrap gap-3">
                    <a href="https://github.com/Roy3838/Observer?tab=readme-ov-file#option-1-full-docker-setup-recommended" target="_blank" rel="noopener noreferrer" className="px-4 py-2 bg-slate-800 text-white rounded-md text-sm font-medium hover:bg-slate-900">
                        View Docker Setup
                    </a>
                    {/* Placeholder for when Tauri/Desktop App is ready */}
                    {/* <a href="#" className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700">Download Desktop App</a> */}
                </div>
            </div>

            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                <h3 className="font-semibold text-gray-800 mb-2">Advanced Option</h3>
                <p className="text-sm text-gray-600">
                    If you've already configured your local server with a valid HTTPS certificate (e.g., using a reverse proxy), you can proceed.
                </p>
            </div>

            <div className="mt-8 flex flex-col-reverse sm:flex-row justify-between items-center gap-4">
                <button onClick={() => setView('initial')} className="text-sm text-gray-600 hover:underline">
                    ← Go Back
                </button>
                <button onClick={handleProceedWithLocal} className="w-full sm:w-auto px-5 py-2.5 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors font-medium text-sm shadow-sm hover:shadow-md">
                    Proceed, I know what I'm doing
                </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default StartupDialog;
