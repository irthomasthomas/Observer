// src/utils/main_loop.ts
import { 
  getAgent, 
  getAgentCode, 
  getAgentMemory, 
} from './agent_database';
import { 
  startScreenCapture, 
  stopScreenCapture, 
  captureFrameAndOCR, 
  injectOCRTextIntoPrompt 
} from './screenCapture';
import { sendPromptToOllama } from './ollamaApi';
import { Logger } from './logging'; // Import the Logger
import { processAgentCommands } from './agent-commands.ts'
import { clearCommands } from './command_registry';

const activeLoops: Record<string, {
  timeoutId: number | null,
  isRunning: boolean,
  isExecuting: boolean, // Track if an iteration is currently executing
  lastExecutionTime: number, // Track when the last execution started
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
 * Schedule next execution
 * @param agentId The ID of the agent
 */
async function scheduleNextExecution(agentId: string): Promise<void> {
  // If the agent isn't running anymore, don't schedule
  if (!activeLoops[agentId]?.isRunning) return;
  
  try {
    const agent = await getAgent(agentId);
    if (!agent) return;
    
    const loop = activeLoops[agentId];
    if (!loop) return;
    
    // Calculate time since last execution
    const now = Date.now();
    const elapsed = now - loop.lastExecutionTime;
    const intervalMs = agent.loop_interval_seconds * 1000;
    
    // If we've reached or passed the interval, execute immediately
    if (elapsed >= intervalMs) {
      executeAgentIteration(agentId);
    } else {
      // Otherwise, set a timeout for the remaining time
      const remainingTime = intervalMs - elapsed;
      
      // Clear any existing timeout
      if (loop.timeoutId !== null) {
        window.clearTimeout(loop.timeoutId);
      }
      
      // Set a new timeout
      loop.timeoutId = window.setTimeout(() => {
        if (activeLoops[agentId]?.isRunning && !activeLoops[agentId]?.isExecuting) {
          executeAgentIteration(agentId);
        }
      }, remainingTime);
    }
  } catch (error) {
    Logger.error(agentId, `Error scheduling next execution: ${error}`);
  }
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
      timeoutId: null,
      isRunning: true,
      isExecuting: false,
      lastExecutionTime: 0,
      serverHost,
      serverPort
    };
    
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
    
    // Clear the timeout
    if (loop.timeoutId !== null) {
      window.clearTimeout(loop.timeoutId);
    }

    // Clear agent commands
    clearCommands(agentId);

    // Stop screen capture if this is the last active agent using it
    const otherAgentsUsingScreenCapture = Object.entries(activeLoops)
      .filter(([id, l]) => id !== agentId && l.isRunning)
      .some(([_]) => true);
      
    if (!otherAgentsUsingScreenCapture) {
      Logger.info(agentId, `Stopping screen capture (no other agents are using it)`);
      stopScreenCapture();
    }
    
    // Update the loop status
    activeLoops[agentId] = {
      ...loop,
      isRunning: false,
      timeoutId: null
    };
    
    Logger.info(agentId, `Agent loop stopped successfully`);
  } else {
    Logger.warn(agentId, `Attempted to stop agent that wasn't running`);
  }
}

/**
 * Replace all memory references in a prompt with actual memory content
 * @param prompt The system prompt
 * @param agentId The current agent ID
 * @returns Updated prompt with all memories injected
 */
async function injectAllMemoriesIntoPrompt(prompt: string): Promise<string> {
  let updatedPrompt = prompt;
  
  // Look for all memory references in the format $MEMORY@agentId
  const memoryRegex = /\$MEMORY@([a-zA-Z0-9_]+)/g;
  let match;
  
  // Store all promises to fetch memories
  const memoryPromises: Promise<{id: string, memory: string}>[] = [];
  const agentIds: string[] = [];
  
  // Find all agent IDs referenced in the prompt
  while ((match = memoryRegex.exec(prompt)) !== null) {
    const referencedAgentId = match[1];
    agentIds.push(referencedAgentId);
    
    // Fetch the memory for this agent
    memoryPromises.push(
      getAgentMemory(referencedAgentId)
        .then(memory => ({ id: referencedAgentId, memory }))
        .catch(() => ({ id: referencedAgentId, memory: `[Error: Unable to access memory for agent ${referencedAgentId}]` }))
    );
  }
  
  // Wait for all memories to be fetched
  const memories = await Promise.all(memoryPromises);
  
  // Replace each memory reference with the actual memory content
  for (const { id, memory } of memories) {
    const memoryPlaceholder = `$MEMORY@${id}`;
    updatedPrompt = updatedPrompt.replace(memoryPlaceholder, memory);
  }
  
  return updatedPrompt;
}

/**
 * Execute a single iteration of the agent's loop
 * @param agentId The ID of the agent
 */
async function executeAgentIteration(agentId: string): Promise<void> {
  // Check if the loop is still active
  if (!activeLoops[agentId]?.isRunning) {
    Logger.debug(agentId, `Skipping execution for stopped agent`);
    return;
  }
  
  // If already executing, don't start another iteration
  if (activeLoops[agentId]?.isExecuting) {
    Logger.debug(agentId, `Already executing, skipping this execution`);
    return;
  }
  
  // Mark as executing and update last execution time
  activeLoops[agentId].isExecuting = true;
  activeLoops[agentId].lastExecutionTime = Date.now();
  
  try {
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
    if (systemPrompt.includes('$SCREEN_OCR')) {
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
    
    // Check if we need to inject memories (any agent's memory, not just our own)
    if (systemPrompt.includes('$MEMORY@')) {
      Logger.info(agentId, `Injecting memories into prompt`);
      
      // Inject all memories using our new helper function
      systemPrompt = await injectAllMemoriesIntoPrompt(systemPrompt);
      
      Logger.info(agentId, `All memories injected into prompt`);
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
      
      // Get the agent code
      const agentCode = await getAgentCode(agentId) || '';
      
      // Process other commands
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
  } finally {
    // Mark as no longer executing
    if (activeLoops[agentId]) {
      activeLoops[agentId].isExecuting = false;
      
      // Schedule the next execution
      scheduleNextExecution(agentId);
    }
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
