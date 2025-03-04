// src/utils/agent_utilities.ts
import { Logger } from './logging';
import { getAgentMemory, updateAgentMemory } from './agent_database';

/**
 * Utilities for use in agent output processors
 */
export const utilities = {
  /**
   * Get the current time in a readable format
   * @returns Formatted time string (e.g. "3:45 pm")
   */
  getCurrentTime: (): string => {
    return new Date().toLocaleTimeString([], {
      hour: 'numeric', 
      minute: '2-digit',
      hour12: true
    }).toLowerCase();
  },
  
  /**
   * Get the memory for a specific agent
   * @param agentId ID of the agent
   * @returns The agent's memory content
   */
  getAgentMemory: async (agentId: string): Promise<string> => {
    return await getAgentMemory(agentId);
  },
  
  /**
   * Update an agent's memory
   * @param agentId ID of the agent
   * @param memory New memory content
   */
  updateAgentMemory: async (agentId: string, memory: any): Promise<void> => {
    await updateAgentMemory(agentId, memory);
  },
  
  /**
   * Send a browser notification
   * @param title Notification title
   * @param options Notification options
   * @returns Promise that resolves when notification is displayed or rejected
   */
  pushNotification: async (title: string, options?: NotificationOptions): Promise<Notification | null> => {
    try {
      // Check if notifications are supported
      if (!('Notification' in window)) {
        Logger.warn('NOTIFICATION', 'Browser notifications not supported');
        return null;
      }
      
      // Check permission status
      if (Notification.permission === 'granted') {
        return new Notification(title, options);
      } 
      else if (Notification.permission !== 'denied') {
        // Request permission
        const permission = await Notification.requestPermission();
        
        if (permission === 'granted') {
          return new Notification(title, options);
        } else {
          Logger.warn('NOTIFICATION', 'Notification permission denied');
          return null;
        }
      }
      
      return null;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      Logger.error('NOTIFICATION', `Error sending notification: ${errorMessage}`);
      return null;
    }
  },
  
  /**
   * Execute code in the browser with error handling
   * @param code JavaScript code to execute
   * @returns Result of execution or error message
   */
  executeInBrowser: async (code: string): Promise<{success: boolean, result?: any, error?: string}> => {
    try {
      // Using Function constructor to create a function from string
      const execFn = new Function(`return (async () => { ${code} })();`);
      const result = await execFn();
      return { success: true, result };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      Logger.error('BROWSER_EXEC', `Error executing code: ${errorMessage}`);
      return { success: false, error: errorMessage };
    }
  },
  
  /**
   * Store data in browser localStorage
   * @param key Storage key
   * @param value Value to store (will be JSON stringified)
   */
  storeLocalData: (key: string, value: any): void => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      Logger.error('STORAGE', `Error storing data: ${errorMessage}`);
    }
  },
  
  /**
   * Retrieve data from browser localStorage
   * @param key Storage key
   * @param defaultValue Value to return if key not found
   * @returns Parsed stored data or defaultValue
   */
  getLocalData: <T>(key: string, defaultValue?: T): T | null => {
    try {
      const data = localStorage.getItem(key);
      return data ? JSON.parse(data) : (defaultValue ?? null);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      Logger.error('STORAGE', `Error retrieving data: ${errorMessage}`);
      return defaultValue ?? null;
    }
  }
};
