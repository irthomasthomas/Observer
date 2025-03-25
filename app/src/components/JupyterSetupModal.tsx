// src/components/JupyterSetupModal.tsx
import React, { useState, useEffect } from 'react';
import { Loader2, X } from 'lucide-react';
import { getJupyterConfig, setJupyterConfig } from '@utils/handlers/jupyterConfig';

// Simple event system for opening the modal from anywhere
const EVENT_NAME = 'openJupyterSetupModal';
let modalCallback: ((success: boolean) => void) | null = null;

// Function to open the modal from anywhere
export function openJupyterSetupModal(callback?: (success: boolean) => void) {
  modalCallback = callback || null;
  window.dispatchEvent(new CustomEvent(EVENT_NAME));
}

// The actual modal component
const JupyterSetupModal = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [host, setHost] = useState('127.0.0.1');
  const [port, setPort] = useState('8888');
  const [token, setToken] = useState('');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<'success' | 'error' | null>(null);

  // Listen for the open event
  useEffect(() => {
    const handleOpen = () => setIsOpen(true);
    window.addEventListener(EVENT_NAME, handleOpen);
    return () => window.removeEventListener(EVENT_NAME, handleOpen);
  }, []);

  // Load config when opened
  useEffect(() => {
    if (isOpen) {
      const config = getJupyterConfig();
      setHost(config.host);
      setPort(config.port);
      setToken(config.token);
    }
  }, [isOpen]);

  const handleClose = (success = false) => {
    setIsOpen(false);
    if (modalCallback) {
      modalCallback(success);
      modalCallback = null;
    }
  };

  const handleSave = () => {
    setJupyterConfig(host, port, token);
    handleClose(true);
  };

  const testConnection = async () => {
    setTesting(true);
    setTestResult(null);
    
    try {
      const url = `http://${host}:${port}/api/kernels`;
      const response = await fetch(url, {
        headers: {
          'Authorization': `token ${token}`
        }
      });
      
      if (response.ok) {
        setTestResult('success');
      } else {
        setTestResult('error');
      }
    } catch (error) {
      setTestResult('error');
    } finally {
      setTesting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg w-96 max-w-full">
        <div className="flex justify-between items-center p-4 border-b">
          <h3 className="font-medium">Jupyter Server Configuration</h3>
          <button onClick={() => handleClose()} className="text-gray-500 hover:text-gray-700">
            <X size={18} />
          </button>
        </div>
        
        <div className="p-4">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Host</label>
              <input
                type="text"
                value={host}
                onChange={(e) => setHost(e.target.value)}
                className="w-full p-2 border rounded"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium mb-1">Port</label>
              <input
                type="text"
                value={port}
                onChange={(e) => setPort(e.target.value)}
                className="w-full p-2 border rounded"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium mb-1">Token</label>
              <input
                type="password"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                className="w-full p-2 border rounded"
              />
              <p className="text-xs text-gray-500 mt-1">
                Find this in your terminal after starting Jupyter with <code>jupyter notebook --no-browser</code>
              </p>
            </div>
          </div>
          
          {testResult === 'success' && (
            <div className="mt-4 p-2 bg-green-50 text-green-700 text-sm rounded border border-green-200">
              Connection successful!
            </div>
          )}
          
          {testResult === 'error' && (
            <div className="mt-4 p-2 bg-red-50 text-red-700 text-sm rounded border border-red-200">
              Connection failed. Check your settings and try again.
            </div>
          )}
        </div>
        
        <div className="flex justify-between p-4 border-t bg-gray-50">
          <button
            onClick={testConnection}
            disabled={testing}
            className="px-3 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700 flex items-center"
          >
            {testing ? (
              <>
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                Testing...
              </>
            ) : 'Test Connection'}
          </button>
          
          <div className="space-x-2">
            <button
              onClick={() => handleClose()}
              className="px-3 py-1.5 bg-gray-200 text-gray-800 rounded hover:bg-gray-300"
            >
              Cancel
            </button>
            
            <button
              onClick={handleSave}
              className="px-3 py-1.5 bg-green-600 text-white rounded hover:bg-green-700"
              disabled={testing}
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default JupyterSetupModal;
