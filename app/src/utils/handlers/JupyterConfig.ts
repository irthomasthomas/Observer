// src/utils/handlers/jupyterConfig.ts
import { Logger } from '../logging';

// Default values
let jupyterHost = '127.0.0.1';
let jupyterPort = '8888';
let jupyterToken = '';

// Store key for localStorage
const STORAGE_KEY = 'jupyter_config';

// Load from localStorage on init
try {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored) {
    const config = JSON.parse(stored);
    jupyterHost = config.host || jupyterHost;
    jupyterPort = config.port || jupyterPort;
    jupyterToken = config.token || jupyterToken;
    Logger.info('CONFIG', 'Loaded Jupyter config from storage');
  }
} catch (error) {
  Logger.error('CONFIG', 'Error loading config:', error);
}

export function setJupyterConfig(host: string, port: string, token: string) {
  // Only update if values are provided
  if (host) jupyterHost = host;
  if (port) jupyterPort = port;
  if (token) jupyterToken = token;
  
  // Save to localStorage
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      host: jupyterHost,
      port: jupyterPort,
      token: jupyterToken
    }));
  } catch (error) {
    Logger.error('CONFIG', 'Error saving config:', error);
  }
}

export function getJupyterConfig() {
  return {
    host: jupyterHost,
    port: jupyterPort, 
    token: jupyterToken
  };
}
