import React, { useEffect, useState } from 'react';
import { X, Check, Server } from 'lucide-react';
import { getJupyterConfig, setJupyterConfig } from '@utils/handlers/JupyterConfig';
import { Logger } from '@utils/logging';

interface JupyterServerModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const JupyterServerModal: React.FC<JupyterServerModalProps> = ({ isOpen, onClose }) => {
  const [jupyterHost, setJupyterHost] = useState<string>('127.0.0.1');
  const [jupyterPort, setJupyterPort] = useState<string>('8888');
  const [jupyterToken, setJupyterToken] = useState<string>('');
  const [jupyterStatus, setJupyterStatus] = useState<'unknown' | 'checking' | 'connected' | 'error'>('unknown');
  const [testOutput, setTestOutput] = useState<string>('');

  // Load current config when modal opens
  useEffect(() => {
    if (isOpen) {
      const config = getJupyterConfig();
      setJupyterHost(config.host);
      setJupyterPort(config.port);
      setJupyterToken(config.token);
      setJupyterStatus('unknown');
      setTestOutput('');
    }
  }, [isOpen]);

  // Save Jupyter Config
  const handleSave = () => {
    try {
      setJupyterConfig(jupyterHost, jupyterPort, jupyterToken);
      Logger.info('CONFIG', 'Jupyter configuration saved');
      onClose();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      Logger.error('CONFIG', `Error saving Jupyter config: ${errorMessage}`);
      setTestOutput(prev => prev + `\nError saving configuration: ${errorMessage}`);
    }
  };

  // Test Jupyter connection
  const testJupyterConnection = async () => {
    setJupyterStatus('checking');
    setTestOutput('Testing connection...');
    
    try {
      // Simple fetch to test connection
      const url = `http://${jupyterHost}:${jupyterPort}/api/kernels`;
      const response = await fetch(url, {
        headers: {
          'Authorization': `token ${jupyterToken}`
        }
      });
      
      if (response.ok) {
        setJupyterStatus('connected');
        setTestOutput(`✅ Connected to Jupyter server at ${jupyterHost}:${jupyterPort}`);
        Logger.info('CONFIG', `Successfully connected to Jupyter server at ${jupyterHost}:${jupyterPort}`);
      } else {
        setJupyterStatus('error');
        setTestOutput(`❌ Connection failed: ${response.status} ${response.statusText}`);
        Logger.warn('CONFIG', `Jupyter connection failed: ${response.status} ${response.statusText}`);
      }
    } catch (error) {
      setJupyterStatus('error');
      const errorMessage = error instanceof Error ? error.message : String(error);
      setTestOutput(`❌ Connection error: ${errorMessage}`);
      Logger.error('CONFIG', `Jupyter connection error: ${errorMessage}`);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="bg-white rounded-lg w-full max-w-lg shadow-xl">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="text-xl font-semibold text-gray-800 flex items-center">
            <Server className="mr-2 text-blue-600" size={20} />
            Jupyter Server Configuration
          </h2>
          <button
            onClick={onClose}
            className="p-2 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <p className="text-sm text-gray-600 mb-4">
            Configure your Jupyter server connection for Python code execution. These settings will be saved in your browser.
          </p>
          
          <div className="space-y-4">
            <div className="flex flex-col">
              <label className="block text-sm font-medium text-gray-700 mb-1">Host</label>
              <input
                type="text"
                value={jupyterHost}
                onChange={(e) => setJupyterHost(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="127.0.0.1"
              />
            </div>
            
            <div className="flex flex-col">
              <label className="block text-sm font-medium text-gray-700 mb-1">Port</label>
              <input
                type="text"
                value={jupyterPort}
                onChange={(e) => setJupyterPort(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="8888"
              />
            </div>
            
            <div className="flex flex-col">
              <label className="block text-sm font-medium text-gray-700 mb-1">Token</label>
              <input
                type="password"
                value={jupyterToken}
                onChange={(e) => setJupyterToken(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Enter Jupyter token"
              />
              <p className="mt-1 text-xs text-gray-500">
                Find your token in Jupyter's terminal output when starting the server.
              </p>
            </div>
          </div>

          {testOutput && (
            <div className={`mt-4 p-3 rounded text-sm font-mono ${
              jupyterStatus === 'connected' ? 'bg-green-50 text-green-800' : 
              jupyterStatus === 'error' ? 'bg-red-50 text-red-800' :
              'bg-gray-50 text-gray-800'
            }`}>
              {testOutput}
            </div>
          )}
        </div>

        <div className="bg-gray-50 px-6 py-4 flex justify-between rounded-b-lg">
          {jupyterStatus === 'connected' && (
            <div className="flex items-center text-sm text-green-600">
              <Check size={16} className="mr-1" />
              Connected
            </div>
          )}
          {jupyterStatus === 'error' && (
            <div className="flex items-center text-sm text-red-600">
              <X size={16} className="mr-1" />
              Connection Error
            </div>
          )}
          {jupyterStatus !== 'connected' && jupyterStatus !== 'error' && <div></div>}
          
          <div className="flex space-x-3">
            <button
              onClick={testJupyterConnection}
              disabled={jupyterStatus === 'checking'}
              className={`px-4 py-2 rounded-md text-sm font-medium ${
                jupyterStatus === 'checking'
                  ? 'bg-gray-300 text-gray-600 cursor-not-allowed'
                  : 'bg-blue-100 text-blue-700 hover:bg-blue-200'
              }`}
            >
              {jupyterStatus === 'checking' ? (
                <span className="flex items-center">
                  <div className="w-3 h-3 mr-2 border-2 border-blue-700 border-t-transparent rounded-full animate-spin"></div>
                  Testing...
                </span>
              ) : 'Test Connection'}
            </button>
            
            <button
              onClick={handleSave}
              className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700"
            >
              Save Configuration
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default JupyterServerModal;
