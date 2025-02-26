// src/utils/agent-commands.ts
import { Logger } from './logging';

// Define a simplified utilities object (no filesystem operations)
const commandUtilities = {
  getCurrentTime: () => {
    return new Date().toLocaleTimeString([], {
      hour: 'numeric', 
      minute: '2-digit',
      hour12: true
    }).toLowerCase();
  }
};

// Extract commands from agent code
export function extractCommands(agentId: string, codeText: string): Record<string, Function> {
  const commands: Record<string, Function> = {};
  
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
      
      // Create function with proper context
      const commandFn = new Function('agentId', 'utilities', `
        return ${functionCode}.bind(null);
      `)(agentId, commandUtilities);
      
      commands[commandName] = commandFn;
      Logger.info(agentId, `Extracted command: ${commandName}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      Logger.error(agentId, `Failed to extract command: ${errorMessage}`);
    }
  }
  
  return commands;
}

// Process text for commands
export async function processAgentCommands(
  agentId: string, 
  text: string, 
  agentCode: string
): Promise<boolean> {
  // Extract commands from agent code
  const commands = extractCommands(agentId, agentCode);
  
  // Find command patterns in text (COMMAND: params or just COMMAND)
  const commandRegex = /([A-Z]{2,})(?::\s*(.*?))?(?=\n[A-Z]{2,}:|$)/gs;
  let match;
  let commandExecuted = false;
  
  while ((match = commandRegex.exec(text)) !== null) {
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
