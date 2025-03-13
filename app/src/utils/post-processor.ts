// src/utils/processors/post-processor.ts
import { Logger } from './logging';

// Map to store output processors
const processors = new Map<string, Function>();

/**
 * Register an output processor for an agent
 * @param agentId ID of the agent
 * @param processor Function that processes the complete output
 */
export function registerProcessor(agentId: string, processor: Function): void {
  processors.set(agentId, processor);
  Logger.info(agentId, `Registered output processor`);
}

/**
 * Clear the processor for an agent
 * @param agentId ID of the agent
 */
export function clearProcessor(agentId: string): void {
  processors.delete(agentId);
  Logger.info(agentId, `Cleared output processor`);
}

/**
 * Dynamically imports and sets up an agent processor from code
 * @param agentCode The agent code to import
 * @param agentId The agent ID
 * @returns A function that can process agent output
 */
async function setupProcessor(agentCode: string, agentId: string): Promise<Function> {
  try {
    // Create a blob URL from the code
    const blob = new Blob([
      // Wrap the code in a function that we can invoke
      `export default function(response, utilities, agentId) {
        ${agentCode}
        return true;
      }`
    ], { type: 'application/javascript' });
    const url = URL.createObjectURL(blob);
    
    // Import the module
    const module = await import(/* @vite-ignore */ url);
    
    // Clean up
    URL.revokeObjectURL(url);
    
    // Return the default export, which is our wrapped function
    if (typeof module.default === 'function') {
      return module.default;
    } else {
      Logger.warn(agentId, 'Failed to create function from agent code');
      return (line: string) => {
        Logger.info(agentId, `Agent output: ${line}`);
        return false;
      };
    }
  } catch (error) {
    Logger.error(agentId, `Error importing agent processor: ${error}`);
    return (line: string) => {
      Logger.info(agentId, `Agent output: ${line}`);
      return false;
    };
  }
}

/**
 * Main post-processing function for handling agent responses
 * @param agentId ID of the agent
 * @param response Response text from the model
 * @param agentCode Code for the agent's processor
 * @param utilities Utilities to pass to the processor
 * @returns Whether processing was successful
 */
export async function postProcess(
  agentId: string, 
  response: string, 
  agentCode: string,
  utilities: any
): Promise<boolean> {
  try {
    Logger.debug(agentId, 'Starting response post-processing');
    
    // Always refresh the processor with the latest code
    const processor = await setupProcessor(agentCode, agentId);
    registerProcessor(agentId, processor);
    
    // Get the processor (or use a default logger if none exists)
    const activeProcessor = processors.get(agentId) || ((text: string) => {
      Logger.info(agentId, `Agent output: ${text.length > 100 ? 
        text.substring(0, 100) + '...' : text}`);
      return false;
    });
    
    // Process the entire response
    Logger.info(agentId, `Processing response`);
    const result = await activeProcessor(response, utilities, agentId);
    
    if (result) {
      Logger.info(agentId, `Response processed successfully`);
    } else {
      Logger.info(agentId, `Response processed but no specific action taken`);
    }
    
    // Add additional post-processors here in the future
    
    Logger.debug(agentId, 'Completed response post-processing');
    return !!result; // Convert to boolean
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    Logger.error(agentId, `Error in post-processing: ${errorMessage}`);
    return false;
  }
}
