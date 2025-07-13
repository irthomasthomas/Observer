import React from 'react';
import { Terminal, Cloud, Server } from 'lucide-react';
import { getOllamaServerAddress } from '@utils/main_loop';

interface StartupDialogProps {
  onDismiss: () => void;
  onLogin?: () => void;
  setUseObServer?: (value: boolean) => void;
  isAuthenticated: boolean;
}

const StartupDialog: React.FC<StartupDialogProps> = ({
  onDismiss,
  onLogin,
  setUseObServer,
  isAuthenticated
}) => {
  const handleObServerStart = () => {
    if (!isAuthenticated) {
      if (onLogin) onLogin();
    } else {
      if (setUseObServer) setUseObServer(true);
      onDismiss();
    }
  };

  const handleSetupLocal = () => {
    if (setUseObServer) setUseObServer(false);
    onDismiss();
  };

  const handleAcceptCertClick = (e: React.MouseEvent) => {
    e.preventDefault();
    const { host, port } = getOllamaServerAddress();
    const url = `${host}:${port}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-xl shadow-xl p-5 md:p-8 max-w-3xl w-full">
        <div className="flex items-center gap-3 mb-6">
          <Terminal className="h-8 w-8 text-blue-500" />
          <h2 className="text-xl sm:text-2xl font-semibold">Welcome to Observer</h2>
        </div>
        <p className="text-gray-600 mb-6 text-sm sm:text-base">Choose how you want to get started:</p>
        
        {/* --- START: PRODUCT HUNT BANNER --- */}
        <div className="my-6 p-4 bg-purple-50 border border-purple-200 rounded-lg text-center shadow-sm">
            <h3 className="font-semibold text-lg text-purple-800 mb-2">
                🚀 We're Live on Product Hunt!
            </h3>
            <p className="text-sm text-purple-700 mb-4">
                As a solo developer, your support would mean the world to me. Please consider upvoting!
            </p>
            <a 
                href="https://www.producthunt.com/products/observer-ai?utm_source=other&utm_medium=social" 
                target="_blank" 
                rel="noopener noreferrer"
                className="inline-block bg-orange-500 hover:bg-orange-600 text-white font-bold py-2 px-5 rounded-lg transition-colors text-sm"
            >
                Support on Product Hunt
            </a>
        </div>
        {/* --- END: PRODUCT HUNT BANNER --- */}

        <div className="grid md:grid-cols-2 gap-6 mb-6">
          {/* Ob-Server Cloud Card */}
          <div className="border rounded-lg p-5 sm:p-6 shadow-sm hover:shadow-md transition-shadow bg-blue-50 border-blue-100 flex flex-col justify-between h-full">
            <div>
              <div className="flex justify-between items-start mb-4">
                <h3 className="text-lg sm:text-xl font-medium text-blue-700">Ob-Server Cloud</h3>
                <Cloud className="h-6 w-6 text-blue-500" />
              </div>
              <ul className="space-y-2 text-sm sm:text-base">
                <li className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-blue-500"></div><span className="text-gray-700">No installation needed</span></li>
                <li className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-blue-500"></div><span className="text-gray-700">Easy to use</span></li>
                <li className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-blue-500"></div><span className="text-gray-700">Privacy respecting</span></li>
              </ul>
            </div>
            <div className="mt-6">
              <button 
                onClick={handleObServerStart} 
                className="w-full px-4 py-2.5 sm:py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors font-medium text-sm sm:text-base"
              >
                {isAuthenticated ? 'Start with Ob-Server' : 'Log In to Get Started'}
              </button>
            </div>
          </div>
          
          {/* Local Server Card */}
          <div className="border rounded-lg p-5 sm:p-6 shadow-sm hover:shadow-md transition-shadow bg-gray-50 border-gray-200 flex flex-col justify-between h-full">
            <div>
                <div className="flex justify-between items-start mb-4">
                <h3 className="text-lg sm:text-xl font-medium text-slate-800">Local Server</h3>
                <Server className="h-6 w-6 text-slate-500" />
                </div>
                <ul className="space-y-2 text-sm sm:text-base">
                <li className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-slate-500"></div><span className="text-gray-700">Full Control</span></li>
                <li className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-slate-500"></div><span className="text-gray-700">Use your own hardware</span></li>
                <li className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-slate-500"></div><span className="text-gray-700">Complete privacy</span></li>
                </ul>
            </div>
            <div className="mt-6">
                <p className="text-center text-xs text-gray-600 mt-3 leading-relaxed">
                  Run <a href="https://github.com/Roy3838/Observer" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">observer-ollama</a> and <a href="#" onClick={handleAcceptCertClick} className="text-blue-600 hover:underline">check server</a>.
                </p>
                <button onClick={handleSetupLocal} className="w-full px-4 py-2.5 sm:py-3 bg-slate-700 text-white rounded-lg hover:bg-slate-800 transition-colors font-medium text-sm sm:text-base">
                    Use Local Server
                </button>
            </div>
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
