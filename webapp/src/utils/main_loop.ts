// src/utils/main_loop.ts
import { CompleteAgent, getAgent, getAgentCode } from './agent_database';
import { 
  startScreenCapture, 
  stopScreenCapture, 
  captureFrameAndOCR, 
  injectOCRTextIntoPrompt 
} from './screenCapture';
import { sendPromptToOllama } from './ollamaApi';
import { Logger } from './logging'; // Import the Logger
import { processAgentCommands } from './agent-commands.ts'

const activeLoops: Record<string, {
  intervalId: number,
  isRunning: boolean,
  serverHost?: string,
  serverPort?: string
}> = {};

let serverHost = 'localhost';
let serverPort = '11434';

/**
 * Set the Ollama server connection details
 * @param host Server host
 * @param port Server port
 */
export function setOllamaServerAddress(host: string, port: string): void {
  serverHost = host;
  serverPort = port;
  Logger.info('SERVER', `Ollama server address set to ${host}:${port}`);
}

/**
 * Start the main execution loop for an agent
 * @param agentId The ID of the agent to start
 */
export async function startAgentLoop(agentId: string): Promise<void> {
  // Check if already running
  if (activeLoops[agentId]?.isRunning) {
    Logger.warn(agentId, `Agent is already running`);
    return;
  }

  try {
    // Get the agent from the database
    const agent = await getAgent(agentId);
    
    if (!agent) {
      const error = `Agent ${agentId} not found`;
      Logger.error(agentId, error);
      throw new Error(error);
    }
    
    Logger.info(agentId, `Starting agent loop for ${agent.name}`);
    
    // Initialize screen capture if needed
    if (agent.system_prompt.includes('SCREEN_OCR')) {
      Logger.info(agentId, `Agent requires screen access for OCR, requesting permission...`);
      const stream = await startScreenCapture();
      
      if (!stream) {
        const error = 'Failed to start screen capture';
        Logger.error(agentId, error);
        throw new Error(error);
      }
      
      Logger.info(agentId, `Screen capture started successfully`);
    }
    
    // Store server connection info in the loop object
    const loopInfo = {
      intervalId: 0,
      isRunning: true,
      serverHost,
      serverPort
    };
    
    // Create the interval for the agent loop
    loopInfo.intervalId = window.setInterval(
      () => executeAgentIteration(agentId),
      agent.loop_interval_seconds * 1000
    );
    
    Logger.info(agentId, `Agent loop scheduled every ${agent.loop_interval_seconds} seconds`);
    
    // Store the loop information
    activeLoops[agentId] = loopInfo;
    
    // Run first iteration immediately
    Logger.info(agentId, `Running first iteration immediately`);
    await executeAgentIteration(agentId);
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    Logger.error(agentId, `Error starting agent: ${errorMessage}`, error);
    throw error;
  }
}

/**
 * Stop the main execution loop for an agent
 * @param agentId The ID of the agent to stop
 */
export function stopAgentLoop(agentId: string): void {
  const loop = activeLoops[agentId];
  
  if (loop && loop.isRunning) {
    Logger.info(agentId, `Stopping agent loop`);
    
    // Clear the interval
    window.clearInterval(loop.intervalId);
    
    // Stop screen capture if this is the last active agent using it
    const otherAgentsUsingScreenCapture = Object.entries(activeLoops)
      .filter(([id, l]) => id !== agentId && l.isRunning)
      .some(([_, l]) => true); // Just check if any remain
      
    if (!otherAgentsUsingScreenCapture) {
      Logger.info(agentId, `Stopping screen capture (no other agents are using it)`);
      stopScreenCapture();
    }
    
    // Update the loop status
    activeLoops[agentId] = {
      ...loop,
      isRunning: false
    };
    
    Logger.info(agentId, `Agent loop stopped successfully`);
  } else {
    Logger.warn(agentId, `Attempted to stop agent that wasn't running`);
  }
}

/**
 * Execute a single iteration of the agent's loop
 * @param agentId The ID of the agent
 */
async function executeAgentIteration(agentId: string): Promise<void> {
  try {
    // Check if the loop is still active
    if (!activeLoops[agentId]?.isRunning) {
      Logger.debug(agentId, `Skipping execution for stopped agent`);
      return;
    }
    
    Logger.debug(agentId, `Starting agent iteration`);
    
    // Get the latest agent data
    const agent = await getAgent(agentId);
    
    if (!agent) {
      const error = `Agent ${agentId} not found`;
      Logger.error(agentId, error);
      throw new Error(error);
    }
    
    // Get the system prompt
    let systemPrompt = agent.system_prompt;
    
    // Check if we need to inject OCR
    if (systemPrompt.includes('SCREEN_OCR')) {
      Logger.info(agentId, `Performing OCR for screen analysis`);
      
      // Capture the screen and perform OCR
      const ocrResult = await captureFrameAndOCR();
      
      if (ocrResult.success && ocrResult.text) {
        // Inject the OCR text into the prompt
        systemPrompt = injectOCRTextIntoPrompt(systemPrompt, ocrResult.text);
        Logger.info(agentId, `OCR successful, text injected into prompt`, {
          textLength: ocrResult.text.length,
          textPreview: ocrResult.text.slice(0, 100) + (ocrResult.text.length > 100 ? '...' : '')
        });
      } else {
        Logger.error(agentId, `OCR failed: ${ocrResult.error || 'Unknown error'}`);
      }
    }
    
    // Send the prompt to Ollama and get response
    try {
      Logger.info(agentId, `Sending prompt to Ollama (${serverHost}:${serverPort}, model: ${agent.model_name})`);
      
      const response = await sendPromptToOllama(
        serverHost,
        serverPort,
        agent.model_name,
        systemPrompt
      );
      
      Logger.info(agentId, `Received response from Ollama`, {
        responseLength: response.length,
        responsePreview: response.slice(0, 100) + (response.length > 100 ? '...' : '')
      });

      // Get the agent code
      const agentCode = await getAgentCode(agentId) || '';

      // Process commands
      const commandsExecuted = await processAgentCommands(agentId, response, agentCode);
      if (commandsExecuted) {
        Logger.info(agentId, `Commands executed from agent response`);
      }
      
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      Logger.error(agentId, `Error calling Ollama: ${errorMessage}`, error);
    }
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    Logger.error(agentId, `Error in agent iteration: ${errorMessage}`, error);
  }
}

/**
 * Check if an agent's loop is currently running
 * @param agentId The ID of the agent to check
 * @returns True if the agent is running, false otherwise
 */
export function isAgentLoopRunning(agentId: string): boolean {
  return activeLoops[agentId]?.isRunning === true;
}

/**
 * Get all currently running agent IDs
 * @returns Array of agent IDs that are currently running
 */
export function getRunningAgentIds(): string[] {
  return Object.entries(activeLoops)
    .filter(([_, loop]) => loop.isRunning)
    .map(([agentId, _]) => agentId);
}
