import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-shell';
import { 
  ExternalLink, Loader, CheckCircle2, XCircle, Power, 
  Download, Settings, RotateCw, Check, AlertTriangle 
} from 'lucide-react';

// --- Helper Component for the Status Display (MODIFIED) ---
// Now accepts strings to display full URLs or ports.
const StatusDisplay: React.FC<{
  isChecking: boolean;
  foundServers: string[];
}> = ({ isChecking, foundServers }) => {
  if (isChecking) {
    return (
      <div className="flex items-center justify-center space-x-4 animate-fade-in">
        <Loader className="h-7 w-7 animate-spin text-slate-400" />
        <p className="text-base text-slate-500">Scanning for local AI server...</p>
      </div>
    );
  }

  if (foundServers.length > 0) {
    return (
      <div className="flex items-center justify-center space-x-4 animate-fade-in">
        <CheckCircle2 className="h-8 w-8 text-green-500" />
        <p className="text-base text-slate-700 font-medium">
          Success! Found server at: <span className="font-bold">{foundServers.join(', ')}</span>
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
  // --- STATE MODIFICATION ---
  // Now stores full URLs or identifiers for display
  const [foundServers, setFoundServers] = useState<string[]>([]);
  
  // --- NEW STATE VARIABLES ---
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [customUrlInput, setCustomUrlInput] = useState('');
  const [saveFeedback, setSaveFeedback] = useState<{message: string, type: 'success' | 'error'} | null>(null);

  // --- REWRITTEN SERVER CHECK LOGIC ---
  const runServerChecks = useCallback(async () => {
    setIsChecking(true);
    setFoundServers([]);
    setSaveFeedback(null);

    try {
      // 1. First, ask the Rust backend for a saved custom URL
      const savedUrl = await invoke<string | null>('get_ollama_url');

      let urlsToTest: string[] = [];
      if (savedUrl) {
        // If a custom URL is saved, we ONLY test that one.
        urlsToTest.push(savedUrl);
      } else {
        // Otherwise, fall back to default local ports.
        urlsToTest = ['http://127.0.0.1:11434', 'http://127.0.0.1:8080'];
      }

      // 2. Create fetch promises for all URLs we need to test.
      const promises = urlsToTest.map(url =>
        fetch(`${url}/v1/models`, {
          method: 'GET',
          headers: { 'Accept': 'application/json' },
          signal: AbortSignal.timeout(2500),
        }).then(response => {
          if (!response.ok) throw new Error(`Server at ${url} is not a valid endpoint.`);
          return url; // On success, return the URL that worked.
        })
      );
      
      const results = await Promise.allSettled(promises);
      const successfulUrls = results
        .filter((result): result is PromiseFulfilledResult<string> => result.status === 'fulfilled')
        .map(result => result.value);

      setFoundServers(successfulUrls);

    } catch (error) {
      console.error("Error during server check:", error);
      setFoundServers([]);
    } finally {
      setIsChecking(false);
    }
  }, []);

  // --- NEW: Function to handle saving the custom URL ---
  const handleSaveSettings = useCallback(async () => {
    const urlToSave = customUrlInput.trim() === '' ? null : customUrlInput.trim();
    
    // Simple validation
    if (urlToSave && !urlToSave.startsWith('http')) {
        setSaveFeedback({ message: 'URL must start with http:// or https://', type: 'error' });
        return;
    }
    
    try {
      await invoke('set_ollama_url', { newUrl: urlToSave });
      setSaveFeedback({ message: 'Settings saved!', type: 'success' });
      // Important: Immediately re-run the check with the new settings
      runServerChecks();
    } catch (error) {
      console.error("Failed to save settings:", error);
      setSaveFeedback({ message: 'Error saving settings.', type: 'error' });
    }
  }, [customUrlInput, runServerChecks]);
  
  // --- EFFECT HOOKS ---

  // 1. Get the main app's URL from Tauri backend (unchanged)
  useEffect(() => {
    invoke<string>('get_server_url')
      .then(url => setServerUrl(url))
      .catch(console.error);
  }, []);
  
  // 2. NEW: On load, fetch the saved custom URL to populate the input field.
  useEffect(() => {
    invoke<string | null>('get_ollama_url')
      .then(url => {
        if (url) {
          setCustomUrlInput(url);
        }
      })
      .catch(console.error);
  }, []);

  // 3. Run the server checks once on startup (unchanged)
  useEffect(() => {
    runServerChecks();
  }, [runServerChecks]);

  // --- Handlers (unchanged) ---
  const handleOpenApp = () => serverUrl && open(serverUrl);
  const handleDownloadOllama = () => open('https://ollama.com');

  const showSuccessState = !isChecking && foundServers.length > 0;
  const showFailureState = !isChecking && foundServers.length === 0;

  return (
    <div className="fixed inset-0 bg-gray-100 flex items-center justify-center p-4 font-sans">
      <div className="bg-white rounded-2xl shadow-2xl p-8 sm:p-10 max-w-2xl w-full text-center transition-all">
        
        {/* Header (unchanged) */}
        <div className="mb-8">
            <div className="flex justify-center items-center mb-5">
              <img src="/eye-logo-black.svg" alt="Observer AI Logo" className="h-20 w-20 mr-4" />
              <h1 className="text-5xl font-bold text-slate-800 tracking-tight">Observer AI</h1>
            </div>
            <p className="text-xl text-gray-500 max-w-md mx-auto">
              {showSuccessState ? "You're all set and ready to launch!" : "Welcome! Let's find your local AI server."}
            </p>
        </div>

        {/* System Check Status Area (unchanged other than prop) */}
        <div className="bg-slate-50 rounded-xl p-6 h-20 flex items-center justify-center mb-8">
            <StatusDisplay isChecking={isChecking} foundServers={foundServers} />
        </div>

        {/* --- MODIFIED Action Area --- */}
        <div className="mt-8 min-h-[8rem] flex flex-col justify-center">
          {showFailureState && (
            <div className="animate-fade-in space-y-4">
              <div>
                <p className="text-slate-600 mb-4">No server found. The easiest way to get started is with Ollama.</p>
                <button
                    onClick={handleDownloadOllama}
                    className="w-full px-6 py-4 bg-blue-500 text-white rounded-lg hover:bg-blue-600 focus:outline-none focus:ring-4 focus:ring-blue-300 transition-all duration-300 font-semibold text-lg shadow-lg hover:shadow-xl flex items-center justify-center"
                >
                    <Download className="h-6 w-6 mr-3" />
                    Download Ollama
                </button>
              </div>
              
              {/* --- NEW: Retry Button --- */}
              <button 
                onClick={runServerChecks} 
                className="text-sm text-slate-500 hover:text-blue-600 hover:underline transition group inline-flex items-center"
              >
                <RotateCw className="h-4 w-4 mr-1.5 transition-transform group-hover:rotate-[-90deg]" />
                Retry Connection
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

        {/* --- NEW: Advanced Options Section --- */}
        <div className="mt-8 border-t pt-6">
            <button onClick={() => setShowAdvanced(!showAdvanced)} className="text-sm text-slate-600 hover:text-blue-700 font-medium flex items-center justify-center w-full">
                <Settings className={`h-4 w-4 mr-2 transition-transform ${showAdvanced ? 'rotate-90' : ''}`} />
                Advanced Server Configuration
            </button>

            {showAdvanced && (
                <div className="animate-fade-in mt-4 p-4 bg-slate-50 rounded-lg space-y-3 text-left">
                    <label htmlFor="custom-url" className="block text-sm font-medium text-slate-700">
                      Custom Model Server URL
                    </label>
                    <div className="flex items-center space-x-2">
                        <input 
                          id="custom-url"
                          type="text"
                          value={customUrlInput}
                          onChange={(e) => setCustomUrlInput(e.target.value)}
                          placeholder="e.g. http://192.168.1.50:11434"
                          className="flex-grow px-3 py-2 border border-slate-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                        />
                        <button 
                          onClick={handleSaveSettings}
                          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                        >
                          Save
                        </button>
                    </div>
                    {saveFeedback && (
                      <div className={`flex items-center text-sm ${saveFeedback.type === 'success' ? 'text-green-600' : 'text-red-600'}`}>
                        {saveFeedback.type === 'success' ? <Check className="h-4 w-4 mr-2" /> : <AlertTriangle className="h-4 w-4 mr-2" />}
                        {saveFeedback.message}
                      </div>
                    )}
                </div>
            )}
        </div>
        
        <p className="text-xs text-gray-400 mt-6">
            <Power className="h-3 w-3 inline-block mr-1.5" />
            The background server is running. You can close this launcher.
        </p>
      </div>
    </div>
  );
}

export default LauncherShell;
