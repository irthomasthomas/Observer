// src/utils/handlers/utils.ts
import { Logger } from '../logging';
import { getAgentMemory as fetchAgentMemory, updateAgentMemory as saveAgentMemory } from '../agent_database';

/**
 * Utility functions for handlers
 */

/**
 * Get the current time in a readable format
 */
export function time(): string {
  return new Date().toLocaleTimeString([], {
    hour: 'numeric', 
    minute: '2-digit',
    hour12: true
  }).toLowerCase();
}

/**
 * Get agent's memory value
 */
export async function getMemory(agentId: string): Promise<string> {
  return await fetchAgentMemory(agentId);
}

/**
 * Set agent's memory value
 */
export async function setMemory(agentId: string, memory: any): Promise<void> {
  await saveAgentMemory(agentId, memory);
  
  // Log the memory update
  Logger.info(agentId, `Memory Updated`, {
    logType: 'memory-update',
    content: memory
  });
}

/**
 * Append to agent's memory value
 * @param agentId The agent's ID
 * @param content Content to append to memory
 * @param separator Optional separator between existing memory and new content (default: '\n')
 */
export async function appendMemory(agentId: string, content: string, separator: string = '\n'): Promise<void> {
  try {
    // Get current memory
    const currentMemory = await fetchAgentMemory(agentId);
    
    // If current memory exists and isn't empty, append with separator
    // Otherwise just set the content directly
    const newMemory = currentMemory ? `${currentMemory}${separator}${content}` : content;
    
    // Save updated memory
    await saveAgentMemory(agentId, newMemory);
    
    Logger.debug('MEMORY', `Appended to agent ${agentId} memory`);
    
    // Log the memory append
    Logger.info(agentId, `Memory Appended`, {
      logType: 'memory-update',
      content: newMemory,
      update: {
        appended: content,
        separator: separator
      }
    });
  } catch (error) {
    Logger.error('MEMORY', `Error appending to memory: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Send a notification
 */
export function notify(title: string, message: string): void {
  try {
    window.postMessage({ type: 'NOTIFICATION', title, message }, '*');
  } catch (error) {
    Logger.error('NOTIFICATION', `Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}
