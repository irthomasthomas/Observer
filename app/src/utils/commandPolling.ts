// src/utils/commandPolling.ts

import { isAgentLoopRunning, startAgentLoop, stopAgentLoop } from './main_loop';
import { Logger } from './logging';
import { listAgents } from './agent_database';

let isSSEActive = false;
let eventSource: EventSource | null = null;
let reconnectTimeout: number | null = null;

export type TokenProvider = () => Promise<string | undefined>;

/**
 * Starts SSE command streaming - only works in self-hosted environments
 * @param hostingContext - The hosting context from App.tsx ('official-web' | 'self-hosted')
 * @param getToken - Token provider function for Ob-Server authentication
 */
export function startCommandPolling(hostingContext: 'official-web' | 'self-hosted', getToken?: TokenProvider) {
  // Only enable SSE for self-hosted environments
  if (hostingContext !== 'self-hosted') {
    Logger.info('Commands', 'SSE command streaming disabled - not in self-hosted environment');
    return;
  }

  if (isSSEActive) {
    Logger.warn('Commands', 'SSE command streaming already active');
    return;
  }

  const serverUrl = 'http://127.0.0.1:3838'; // Tauri server URL
  isSSEActive = true;

  Logger.info('Commands', 'Starting SSE command streaming for agent hotkeys');

  // Register agents with Tauri (one-time on startup)
  const registerAgents = async () => {
    try {
      const agents = await listAgents();
      const agentList = agents.map(agent => ({
        id: agent.id,
        name: agent.name
      }));
      
      await fetch(`${serverUrl}/register-agents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agents: agentList })
      });
      
      Logger.info('Commands', `Registered ${agentList.length} agents with Tauri`);
    } catch (error) {
      Logger.error('Commands', `Agent registration error: ${error}`);
    }
  };

  // Connect to SSE command stream
  const connectSSE = () => {
    try {
      eventSource = new EventSource(`${serverUrl}/commands-stream`);
      
      eventSource.onopen = () => {
        Logger.info('Commands', 'SSE connection established');
        // Clear any pending reconnect timeout
        if (reconnectTimeout) {
          clearTimeout(reconnectTimeout);
          reconnectTimeout = null;
        }
      };
      
      eventSource.onmessage = async (event) => {
        try {
          const commandData = JSON.parse(event.data);
          Logger.debug('Commands', 'Received SSE command:', commandData);
          
          if (commandData.type === 'command') {
            const { agentId, action } = commandData;
            
            if (action === 'toggle') {
              const isRunning = isAgentLoopRunning(agentId);
              
              if (isRunning) {
                Logger.info('Commands', `🔴 Stopping agent ${agentId} via hotkey`);
                await stopAgentLoop(agentId);
              } else {
                Logger.info('Commands', `🟢 Starting agent ${agentId} via hotkey`);
                await startAgentLoop(agentId, getToken);
              }
            } else if (action === 'start') {
              Logger.info('Commands', `🟢 Starting agent ${agentId} via hotkey`);
              await startAgentLoop(agentId, getToken);
            } else if (action === 'stop') {
              Logger.info('Commands', `🔴 Stopping agent ${agentId} via hotkey`);
              await stopAgentLoop(agentId);
            }
          }
        } catch (error) {
          Logger.error('Commands', `Failed to process SSE command: ${error}`);
        }
      };
      
      eventSource.onerror = (_) => {
        Logger.warn('Commands', 'SSE connection error, will reconnect in 5s');
        eventSource?.close();
        
        // Auto-reconnect after 5 seconds
        if (isSSEActive) {
          reconnectTimeout = window.setTimeout(() => {
            Logger.info('Commands', 'Attempting SSE reconnection...');
            connectSSE();
          }, 5000);
        }
      };
      
    } catch (error) {
      Logger.error('Commands', `Failed to establish SSE connection: ${error}`);
    }
  };

  // Register agents first, then connect to SSE stream
  registerAgents().then(() => {
    connectSSE();
  });
}

/**
 * Stops SSE command streaming
 */
export function stopCommandPolling() {
  if (!isSSEActive) {
    return;
  }

  Logger.info('Commands', 'Stopping SSE command streaming');
  
  isSSEActive = false;
  
  if (eventSource) {
    eventSource.close();
    eventSource = null;
  }
  
  if (reconnectTimeout) {
    clearTimeout(reconnectTimeout);
    reconnectTimeout = null;
  }
}

/**
 * Get current SSE streaming status
 */
export function isCommandPollingActive(): boolean {
  return isSSEActive;
}
