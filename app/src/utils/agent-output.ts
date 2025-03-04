// src/utils/agent-output.ts
import { Logger } from './logging';
import { utilities } from './agent_utilities';

// Map to store output processors
const processors = new Map<string, Function>();

/**
 * Register an output processor for an agent
 * 
 * @param agentId ID of the agent
 * @param processor Function that processes each line of output
 */
export function registerProcessor(agentId: string, processor: Function): void {
  processors.set(agentId, processor);
  Logger.info(agentId, `Registered output processor`);
}

/**
 * Process agent output text using the registered processor
 * 
 * @param agentId ID of the agent
 * @param text Output text from the model
 * @returns True if any lines were processed
 */
export async function processOutput(agentId: string, text: string): Promise<boolean> {
  // Get the processor (or use a default logger if none exists)
  const processor = processors.get(agentId) || ((line: string) => {
    Logger.info(agentId, `Agent output: ${line}`);
    return false;
  });
  
  // Filter out content inside <think>...</think> tags
  const filteredText = text.replace(/<think>[\s\S]*?<\/think>/g, '');
  
  // Process each non-empty line
  const lines = filteredText.split('\n').filter(line => line.trim());
  let processed = false;
  
  for (const line of lines) {
    try {
      const result = await processor(line, utilities, agentId);
      if (result) {
        processed = true;
      }
    } catch (error) {
      Logger.error(agentId, `Error processing line: ${error}`);
    }
  }
  
  return processed;
}

/**
 * Clear the processor for an agent
 * 
 * @param agentId ID of the agent
 */
export function clearProcessor(agentId: string): void {
  processors.delete(agentId);
  Logger.info(agentId, `Cleared output processor`);
}
