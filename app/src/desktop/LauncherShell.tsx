import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-shell';
import { ExternalLink, Loader, CheckCircle2, XCircle, Power, Download, ArrowRight } from 'lucide-react';

// --- Helper Component for the Status Display ---
const StatusDisplay: React.FC<{
  isChecking: boolean;
  foundPorts: number[];
}> = ({ isChecking, foundPorts }) => {
  if (isChecking) {
    return (
      <div className="flex items-center justify-center space-x-4 animate-fade-in">
        <Loader className="h-7 w-7 animate-spin text-slate-400" />
        <p className="text-base text-slate-500">Scanning for local AI servers...</p>
      </div>
    );
  }

  if (foundPorts.length > 0) {
    return (
      <div className="flex items-center justify-center space-x-4 animate-fade-in">
        <CheckCircle2 className="h-8 w-8 text-green-500" />
        <p className="text-base text-slate-700 font-medium">
          Success! Found server(s) running on port: <span className="font-bold">{foundPorts.join(', ')}</span>
        </p>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center space-x-4 animate-fade-in">
      <XCircle className="h-8 w-8 text-red-500" />
      <p className="text-base text-red-600 font-medium">No running AI model server was detected.</p>
    </div>
  );
};


function LauncherShell() {
  const [serverUrl, setServerUrl] = useState<string | null>(null);
  const [isChecking, setIsChecking] = useState(true);
  const [foundServers, setFoundServers] = useState<number[]>([]);

  const runServerChecks = useCallback(async () => {
    setIsChecking(true);
    setFoundServers([]); // Reset on each check

    const portsToScan = [11434, 8080]; // Common ports for Ollama and other servers
    const promises = portsToScan.map(port => 
      // Using a short timeout to fail faster on unresponsive ports
      fetch(`http://127.0.0.1:${port}/v1/models`, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(2000) // 2-second timeout per request
      }).then(response => {
        if (!response.ok) throw new Error(`Port ${port} is not a valid server.`);
        return port;
      })
    );

    const results = await Promise.allSettled(promises);
    
    const successfulPorts = results
      .filter((result): result is PromiseFulfilledResult<number> => result.status === 'fulfilled')
      .map(result => result.value);

    setFoundServers(successfulPorts);
    setIsChecking(false);
  }, []);

  // 1. Get the main app's URL from Tauri backend
  useEffect(() => {
    invoke<string>('get_server_url')
      .then(url => setServerUrl(url))
      .catch(console.error);
  }, []);

  // 2. Run the server checks once on startup
  useEffect(() => {
    runServerChecks();
  }, [runServerChecks]);

  const handleOpenApp = () => serverUrl && open(serverUrl);
  const handleDownloadOllama = () => open('https://ollama.com');

  const showSuccessState = !isChecking && foundServers.length > 0;
  const showFailureState = !isChecking && foundServers.length === 0;

  return (
    <div className="fixed inset-0 bg-gray-100 flex items-center justify-center p-4 font-sans">
      <div className="bg-white rounded-2xl shadow-2xl p-8 sm:p-10 max-w-2xl w-full text-center">
        
        {/* Header */}
        <div className="mb-8">
            <div className="flex justify-center items-center mb-5">
              <img src="/eye-logo-black.svg" alt="Observer AI Logo" className="h-20 w-20 mr-4" />
              <h1 className="text-5xl font-bold text-slate-800 tracking-tight">Observer AI</h1>
            </div>
            <p className="text-xl text-gray-500 max-w-md mx-auto">
              {showSuccessState ? "You're all set and ready to launch!" : "Welcome! Let's find your local AI server."}
            </p>
        </div>

        {/* System Check Status Area */}
        <div className="bg-slate-50 rounded-xl p-6 h-20 flex items-center justify-center mb-8">
            <StatusDisplay isChecking={isChecking} foundPorts={foundServers} />
        </div>

        {/* Action Area */}
        <div className="mt-8 h-32 flex flex-col justify-center"> {/* Fixed height to prevent layout shifts */}
          {showFailureState && (
            <div className="animate-fade-in">
              <p className="text-slate-600 mb-4">Ollama is the easiest way to get started. It's free and open-source.</p>
              <button
                  onClick={handleDownloadOllama}
                  className="w-full px-6 py-4 bg-blue-500 text-white rounded-lg hover:bg-blue-600 focus:outline-none focus:ring-4 focus:ring-blue-300 transition-all duration-300 font-semibold text-lg shadow-lg hover:shadow-xl flex items-center justify-center"
              >
                  <Download className="h-6 w-6 mr-3" />
                  Download Ollama
              </button>
              
              {/* --- THIS IS THE MODIFIED BUTTON --- */}
              <button 
                onClick={handleOpenApp} 
                className="text-sm text-slate-500 hover:text-blue-600 hover:underline mt-5 transition group inline-flex items-center"
              >
                I already have a server, go to Observer
                <ArrowRight className="h-4 w-4 ml-1.5 transition-transform group-hover:translate-x-1" />
              </button>
            </div>
          )}

          {showSuccessState && (
              <div className="animate-fade-in">
                <button
                    onClick={handleOpenApp}
                    className="w-full px-6 py-4 bg-green-500 text-white rounded-lg hover:bg-green-600 focus:outline-none focus:ring-4 focus:ring-green-300 transition-all duration-300 font-semibold text-lg shadow-lg hover:shadow-xl flex items-center justify-center"
                >
                    Launch Observer
                    <ExternalLink className="h-6 w-6 ml-3" />
                </button>
              </div>
          )}
        </div>
        
        <p className="text-xs text-gray-400 mt-8">
            <Power className="h-3 w-3 inline-block mr-1.5" />
            The background server is running. You can close this launcher window.
        </p>
      </div>
    </div>
  );
}

export default LauncherShell;
