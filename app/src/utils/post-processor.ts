// src/utils/post-processor.ts
import { Logger } from './logging';
import { executeJavaScript } from './handlers/javascript';

/**
 * Process response using the JavaScript handler
 */
export async function postProcess(agentId: string, response: string, code: string): Promise<boolean> {
  try {
    Logger.debug(agentId, 'Starting response post-processing');
    
    // Execute the JavaScript handler with the response
    const result = await executeJavaScript(response, agentId, code);
    
    if (result) {
      Logger.info(agentId, 'Response processed successfully');
    } else {
      Logger.info(agentId, 'Response processed but no specific action taken');
    }
    
    return result;
  } catch (error) {
    Logger.error(agentId, `Error in post-processing: ${error}`);
    return false;
  }
}
