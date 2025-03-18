// src/utils/handlers/javascript.ts
import * as utils from './utils';
import { Logger } from '../logging';

/**
 * Execute JavaScript handler for processing agent responses
 */
export async function executeJavaScript(
  response: string, 
  agentId: string, 
  code: string
): Promise<boolean> {
  try {
    // We'll use a sandboxed approach with a context object
    const context = {
      response,
      agentId,
      // Define utility functions with full flexibility - allow accessing any agent's memory
      getMemory: async (targetId = agentId) => await utils.getMemory(targetId),
      setMemory: async (targetId: string, value?: any) => {
        // If only one parameter is provided, assume it's the value for current agent
        if (value === undefined) {
          return await utils.setMemory(agentId, targetId);
        }
        // Otherwise set memory for specified agent
        return await utils.setMemory(targetId, value);
      },
      appendMemory: async (targetId: string, content?: string, separator = '\n') => {
        // If only one parameter is provided, assume it's content for current agent
        if (content === undefined) {
          return await utils.appendMemory(agentId, targetId, separator);
        }
        // Otherwise append to specified agent's memory
        return await utils.appendMemory(targetId, content, separator);
      },
      notify: utils.notify,
      time: utils.time,
      console: console
    };
    
    // Create a wrapper function that sets up the context
    const wrappedCode = `
      (async function() {
        try {
          ${code}
          return true;
        } catch (e) {
          console.error('Error in handler:', e);
          return false;
        }
      })()
    `;
    
    // Use Function constructor with context binding
    const handler = new Function(...Object.keys(context), wrappedCode);
    
    // Execute with bound context values
    return await handler(...Object.values(context));
  } catch (error) {
    Logger.error(agentId, `Error executing JavaScript: ${error}`);
    return false;
  }
}
