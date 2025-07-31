// src/utils/post-processor.ts

import { Logger } from './logging';
import { executeJavaScript } from './handlers/javascript';
import { executePython } from './handlers/python';
import type { TokenProvider } from './main_loop'; // Import the type for clarity

/**
 * Process response using the JavaScript or Python handler
 * based on the presence of a '#python' marker
 */
export async function postProcess(
    agentId: string, 
    response: string, 
    code: string, 
    iterationId: string, // <-- New parameter
    getToken?: TokenProvider 
): Promise<boolean> {
  try {
    Logger.debug(agentId, 'Starting response post-processing', { iterationId });
    
    if (code.trim().startsWith('#python')) {
      Logger.debug(agentId, 'Detected Python code, using Python handler', { iterationId });
      // Python handler doesn't support iterationId yet
      return await executePython(response, agentId, code);
    } else {
      Logger.debug(agentId, 'Using JavaScript handler', { iterationId });
      // Pass iterationId and getToken to JavaScript handler
      return await executeJavaScript(response, agentId, code, iterationId, getToken);
    }
  } catch (error) {
    Logger.error(agentId, `Error in post-processing: ${error instanceof Error ? error.message : String(error)}`, { 
      iterationId, 
      error: error instanceof Error ? error.message : String(error) 
    });
    return false;
  }
}
