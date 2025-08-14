// src/utils/commandPolling.ts

import { isAgentLoopRunning, startAgentLoop, stopAgentLoop } from './main_loop';
import { Logger } from './logging';
import { listAgents } from './agent_database';

let isPollingActive = false;
let pollInterval: number | null = null;
let agentSyncInterval: number | null = null;

/**
 * Starts command polling - only works in self-hosted environments
 * @param hostingContext - The hosting context from App.tsx ('official-web' | 'self-hosted')
 */
export function startCommandPolling(hostingContext: 'official-web' | 'self-hosted') {
  // Only enable command polling for self-hosted environments
  if (hostingContext !== 'self-hosted') {
    Logger.info('Commands', 'Command polling disabled - not in self-hosted environment');
    return;
  }

  if (isPollingActive) {
    Logger.warn('Commands', 'Command polling already active');
    return;
  }

  const serverUrl = 'http://127.0.0.1:3838'; // Tauri server URL
  isPollingActive = true;

  Logger.info('Commands', 'Starting command polling for agent hotkeys');

  // Start agent discovery sync (every 30 seconds)
  const syncAgents = async () => {
    try {
      const agents = await listAgents();
      const agentList = agents.map(agent => ({
        id: agent.id,
        name: agent.name
      }));
      
      await fetch(`${serverUrl}/agents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agents: agentList })
      });
      
      Logger.debug('Commands', `Synced ${agentList.length} agents to Tauri`);
    } catch (error) {
      Logger.debug('Commands', `Agent sync error: ${error}`);
    }
  };

  // Initial sync and then every 30 seconds
  syncAgents();
  agentSyncInterval = window.setInterval(syncAgents, 30000);

  pollInterval = window.setInterval(async () => {
    try {
      // Get pending toggle commands
      const response = await fetch(`${serverUrl}/commands`);
      
      if (!response.ok) {
        // Server might not be ready yet, fail silently
        return;
      }

      const data = await response.json();
      
      if (!data.commands || Object.keys(data.commands).length === 0) {
        return;
      }
      
      const completedCommands: string[] = [];
      
      // Process each toggle command
      for (const [agentId, command] of Object.entries(data.commands)) {
        if (command === 'toggle') {
          const isRunning = isAgentLoopRunning(agentId);
          
          if (isRunning) {
            Logger.info('Commands', `🔴 Stopping agent ${agentId} via hotkey`);
            await stopAgentLoop(agentId);
          } else {
            Logger.info('Commands', `🟢 Starting agent ${agentId} via hotkey`);
            await startAgentLoop(agentId);
          }
          
          completedCommands.push(agentId);
        }
      }
      
      // Mark commands as completed
      if (completedCommands.length > 0) {
        await fetch(`${serverUrl}/commands`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ completed: completedCommands })
        });
      }
      
    } catch (error) {
      // Fail silently - server might not be available
      Logger.debug('Commands', `Command polling error: ${error}`);
    }
  }, 500); // Same interval as overlay polling for consistency
}

/**
 * Stops command polling
 */
export function stopCommandPolling() {
  if (!isPollingActive) {
    return;
  }

  Logger.info('Commands', 'Stopping command polling');
  
  if (pollInterval !== null) {
    window.clearInterval(pollInterval);
    pollInterval = null;
  }
  
  if (agentSyncInterval !== null) {
    window.clearInterval(agentSyncInterval);
    agentSyncInterval = null;
  }
  
  isPollingActive = false;
}

/**
 * Get current polling status
 */
export function isCommandPollingActive(): boolean {
  return isPollingActive;
}