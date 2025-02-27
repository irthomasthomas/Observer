// src/utils/agent-commands.ts
import { Logger } from './logging';
import { commandUtilities } from './command_utilities';
import { registerCommand, getCommands, clearCommands } from './command_registry';

/**
 * Register agent commands from code text
 * @param agentId ID of the agent
 * @param codeText The agent's code
 */
export function registerAgentCommands(agentId: string, codeText: string): void {
  // Clear existing commands first
  clearCommands(agentId);
  
  // Match blocks like: //COMMAND_NAME\nfunction(params) {...}
  const commandBlocks = codeText.split('//');
  
  for (let i = 1; i < commandBlocks.length; i++) {
    try {
      const block = commandBlocks[i];
      const lines = block.split('\n');
      const commandName = lines[0].trim().toUpperCase();
      
      // Skip if invalid command name or no function follows
      if (!commandName || !lines[1] || !lines[1].trim().startsWith('function')) {
        continue;
      }
      
      // Extract function body
      const functionCode = lines.slice(1).join('\n');
      
      // Create function with proper context - now properly handling async functions
      const commandFn = new Function('agentId', 'utilities', `
        const fn = ${functionCode};
        return async function(params) {
          return await fn.call(null, params);
        };
      `)(agentId, commandUtilities);
      
      // Register the command instead of adding to local map
      registerCommand(agentId, commandName, commandFn);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      Logger.error(agentId, `Failed to register command: ${errorMessage}`);
    }
  }
}



/**
 * Process LLM response text and execute any commands
 * @param agentId ID of the agent
 * @param text Text from the LLM response
 * @param agentCode The agent's code containing command definitions
 * @returns True if any commands were executed
 */
export async function processAgentCommands(
  agentId: string, 
  text: string, 
  agentCode: string
): Promise<boolean> {
  // Filter out content inside <think>...</think> tags first
  const filteredText = text.replace(/<think>[\s\S]*?<\/think>/g, '');
  
  // Pre-scan for commands to see if we need to process anything
  const commandRegex = /\b([A-Z_]{2,})(?::(?:\s*)(.*))?(?=\s|$)/gm;
  const commandMatches = [...filteredText.matchAll(commandRegex)];
  
  // Only register/clear commands if we actually found potential commands
  if (commandMatches.length > 0) {
    // Register commands from agent code (which currently clears first)
    registerAgentCommands(agentId, agentCode);
    
    // Get the newly registered commands
    const commands = getCommands(agentId);
    
    // Execute found commands
    let commandExecuted = false;
    for (const match of commandMatches) {
      const [_, commandName, params = ""] = match;
      
      if (commands[commandName]) {
        try {
          Logger.info(agentId, `Executing command: ${commandName}`);
          await commands[commandName](params.trim());
          commandExecuted = true;
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          Logger.error(agentId, `Error executing command ${commandName}: ${errorMessage}`);
        }
      }
    }
    
    return commandExecuted;
  }
  
  return false;
}

