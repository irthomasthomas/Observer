import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-shell';
import {
  ExternalLink, Loader, CheckCircle2, XCircle, Power,
  Download, Settings, RotateCw, Check, AlertTriangle, Keyboard
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
  const [saveFeedback, setSaveFeedback] = useState<{ message: string, type: 'success' | 'error' } | null>(null);
  
  // --- SHORTCUT STATE VARIABLES ---
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [shortcutConfig, setShortcutConfig] = useState({
    toggle: '',
    move_up: '',
    move_down: '',
    move_left: '',
    move_right: ''
  });
  const [activeShortcuts, setActiveShortcuts] = useState<string[]>([]);
  const [shortcutFeedback, setShortcutFeedback] = useState<{ message: string, type: 'success' | 'error' } | null>(null);

  const runServerChecks = useCallback(async () => {
    setIsChecking(true);
    setFoundServers([]);
    setSaveFeedback(null);

    try {
      // 1. Determine which URLs to test (same logic as before)
      const savedUrl = await invoke<string | null>('get_ollama_url');
      let urlsToTest: string[] = [];
      if (savedUrl) {
        urlsToTest.push(savedUrl);
      } else {
        urlsToTest = ['http://127.0.0.1:11434', 'http://127.0.0.1:8080'];
      }

      // 2. Create two promises: one for the browser fetch, one for the Rust command.

      // Promise 1: Browser-based fetch
      const browserCheckPromise = new Promise<string[]>(async (resolve, reject) => {
        try {
          const fetchPromises = urlsToTest.map(url =>
            fetch(`${url}/v1/models`, {
              method: 'GET',
              headers: { 'Accept': 'application/json' },
              signal: AbortSignal.timeout(2500),
            }).then(response => {
              if (!response.ok) throw new Error(`Server at ${url} not OK.`);
              return url;
            })
          );
          const results = await Promise.allSettled(fetchPromises);
          const successfulUrls = results
            .filter((r): r is PromiseFulfilledResult<string> => r.status === 'fulfilled')
            .map(r => r.value);
          
          if (successfulUrls.length > 0) {
            console.log("Browser check succeeded:", successfulUrls);
            resolve(successfulUrls);
          } else {
            reject(new Error("Browser check found no servers."));
          }
        } catch (error) {
          reject(error);
        }
      });

      // Promise 2: Rust backend invoke
      const backendCheckPromise = new Promise<string[]>(async (resolve, reject) => {
        try {
          const successfulUrls = await invoke<string[]>('check_ollama_servers', { urls: urlsToTest });
          if (successfulUrls.length > 0) {
            console.log("Backend check succeeded:", successfulUrls);
            resolve(successfulUrls);
          } else {
            reject(new Error("Backend check found no servers."));
          }
        } catch (error) {
          reject(error);
        }
      });

      // 3. Race them! Promise.any resolves with the value of the FIRST promise to succeed.
      const successfulUrls = await Promise.any([browserCheckPromise, backendCheckPromise]);
      setFoundServers(successfulUrls);

    } catch (error) {
      // This block only runs if *both* checks fail.
      console.error("Both browser and backend checks failed:", error);
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
  
  // --- NEW: Functions to handle shortcut configuration ---
  const loadShortcutConfig = useCallback(async () => {
    try {
      const [config, active] = await Promise.all([
        invoke<any>('get_shortcut_config'),
        invoke<string[]>('get_active_shortcuts')
      ]);
      
      setShortcutConfig({
        toggle: config.toggle || '',
        move_up: config.move_up || '',
        move_down: config.move_down || '',
        move_left: config.move_left || '',
        move_right: config.move_right || ''
      });
      
      setActiveShortcuts(active);
    } catch (error) {
      console.error('Failed to load shortcut config:', error);
    }
  }, []);
  
  const handleSaveShortcuts = useCallback(async () => {
    try {
      const configToSave = {
        toggle: shortcutConfig.toggle.trim() || null,
        move_up: shortcutConfig.move_up.trim() || null,
        move_down: shortcutConfig.move_down.trim() || null,
        move_left: shortcutConfig.move_left.trim() || null,
        move_right: shortcutConfig.move_right.trim() || null
      };
      
      await invoke('set_shortcut_config', { config: configToSave });
      setShortcutFeedback({ 
        message: 'Shortcut settings saved! Restart the app to apply changes.', 
        type: 'success' 
      });
      
      // Reload to show current config
      loadShortcutConfig();
    } catch (error) {
      console.error('Failed to save shortcut config:', error);
      setShortcutFeedback({ 
        message: 'Error saving shortcut settings.', 
        type: 'error' 
      });
    }
  }, [shortcutConfig, loadShortcutConfig]);

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
  
  // 4. Load shortcut configuration on startup
  useEffect(() => {
    loadShortcutConfig();
  }, [loadShortcutConfig]);

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

                {/* --- NEW BUTTON ADDED HERE --- */}
                <button
                  onClick={handleOpenApp}
                  className="w-full mt-4 px-6 py-3 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 focus:outline-none focus:ring-4 focus:ring-gray-300 transition-all duration-300 font-semibold text-base flex items-center justify-center"
                >
                  I have ollama or another LLM server! proceed to Observer
                </button>
                {/* --- END OF NEW BUTTON --- */}

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
          <button onClick={() => {
            setShowAdvanced(!showAdvanced);
            setSaveFeedback(null);
          }} className="text-sm text-slate-600 hover:text-blue-700 font-medium flex items-center justify-center w-full">
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
        
        {/* --- NEW: Shortcut Configuration Section --- */}
        <div className="mt-4 border-t pt-4">
          <button onClick={() => {
            setShowShortcuts(!showShortcuts);
            setShortcutFeedback(null);
          }} className="text-sm text-slate-600 hover:text-blue-700 font-medium flex items-center justify-center w-full">
            <Keyboard className={`h-4 w-4 mr-2 transition-transform ${showShortcuts ? 'rotate-90' : ''}`} />
            Shortcut Configuration
          </button>
          
          {showShortcuts && (
            <div className="animate-fade-in mt-4 p-4 bg-slate-50 rounded-lg space-y-4 text-left">
              {/* Current Active Shortcuts Display */}
              {activeShortcuts.length > 0 && (
                <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-md">
                  <h4 className="text-sm font-medium text-green-800 mb-2">Currently Active Shortcuts:</h4>
                  <div className="flex flex-wrap gap-2">
                    {activeShortcuts.map((shortcut, index) => (
                      <span key={index} className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded font-mono">
                        {shortcut}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              
              {/* Shortcut Input Fields */}
              <div className="grid grid-cols-1 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Toggle Overlay</label>
                  <input
                    type="text"
                    value={shortcutConfig.toggle}
                    onChange={(e) => setShortcutConfig({...shortcutConfig, toggle: e.target.value})}
                    placeholder="e.g. Cmd+B or Alt+B"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 font-mono"
                  />
                </div>
                
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Move Up</label>
                    <input
                      type="text"
                      value={shortcutConfig.move_up}
                      onChange={(e) => setShortcutConfig({...shortcutConfig, move_up: e.target.value})}
                      placeholder="e.g. Cmd+ArrowUp"
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Move Down</label>
                    <input
                      type="text"
                      value={shortcutConfig.move_down}
                      onChange={(e) => setShortcutConfig({...shortcutConfig, move_down: e.target.value})}
                      placeholder="e.g. Cmd+ArrowDown"
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 font-mono"
                    />
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Move Left</label>
                    <input
                      type="text"
                      value={shortcutConfig.move_left}
                      onChange={(e) => setShortcutConfig({...shortcutConfig, move_left: e.target.value})}
                      placeholder="e.g. Cmd+ArrowLeft"
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Move Right</label>
                    <input
                      type="text"
                      value={shortcutConfig.move_right}
                      onChange={(e) => setShortcutConfig({...shortcutConfig, move_right: e.target.value})}
                      placeholder="e.g. Cmd+ArrowRight"
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 font-mono"
                    />
                  </div>
                </div>
              </div>
              
              {/* Save Button */}
              <div className="flex justify-end">
                <button
                  onClick={handleSaveShortcuts}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 text-sm"
                >
                  Save Shortcuts
                </button>
              </div>
              
              {/* Feedback Messages */}
              {shortcutFeedback && (
                <div className={`flex items-center text-sm ${shortcutFeedback.type === 'success' ? 'text-green-600' : 'text-red-600'}`}>
                  {shortcutFeedback.type === 'success' ? <Check className="h-4 w-4 mr-2" /> : <AlertTriangle className="h-4 w-4 mr-2" />}
                  {shortcutFeedback.message}
                </div>
              )}
              
              {/* Help Text */}
              <div className="text-xs text-slate-500 bg-slate-100 p-2 rounded">
                <strong>Format:</strong> Modifier+Key (e.g., Cmd+B, Alt+ArrowUp, Ctrl+Shift+X)<br/>
                <strong>Windows users:</strong> Try Alt+ instead of Cmd+ if shortcuts conflict with system shortcuts<br/>
                <strong>Note:</strong> Application restart required for changes to take effect
              </div>
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
