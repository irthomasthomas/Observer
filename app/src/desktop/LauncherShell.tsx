import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-shell';
import { ExternalLink, Loader } from 'lucide-react';

function LauncherShell() {
  const [serverUrl, setServerUrl] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    invoke<string>('get_server_url')
      .then((url) => {
        if (url) {
            setServerUrl(url);
        }
      })
      .catch(console.error)
      .finally(() => {
        setIsLoading(false);
      });
  }, []);

  const handleOpenApp = () => {
    if (serverUrl) {
      open(serverUrl);
    }
  };

  return (
    <div className="fixed inset-0 bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl p-8 max-w-md w-full text-center">
        <div className="flex justify-center items-center mb-6">
          <img src="/eye-logo-black.svg" alt="Observer AI Logo" className="h-12 w-12 mr-4" />
          <h1 className="text-3xl font-bold text-slate-800">Observer AI</h1>
        </div>
        <p className="text-gray-600 mb-8 text-base">
          The application server is running in the background. Click the button below to launch Observer in your browser.
        </p>
        {isLoading ? (
          <div className="flex items-center justify-center p-4 bg-gray-100 rounded-lg">
            <Loader className="animate-spin h-6 w-6 text-slate-500 mr-3" />
            <p className="text-slate-600 font-medium">Loading server address...</p>
          </div>
        ) : serverUrl ? (
          <button
            onClick={handleOpenApp}
            className="w-full px-6 py-4 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-all duration-300 font-semibold text-lg shadow-md hover:shadow-lg flex items-center justify-center"
          >
            Open Observer
            <ExternalLink className="h-5 w-5 ml-2.5" />
          </button>
        ) : (
          <p className="p-4 bg-red-100 text-red-700 rounded-lg">
            Could not retrieve the server address. Please ensure the server is running correctly.
          </p>
        )}
        <p className="text-xs text-gray-400 mt-8">
          You can close this launcher window. The server will continue to run in the background.
        </p>
      </div>
    </div>
  );
}

export default LauncherShell;
