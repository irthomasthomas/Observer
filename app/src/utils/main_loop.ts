// src/utils/main_loop.ts
import { getAgent, getAgentCode } from './agent_database';
import { sendPrompt } from './sendApi';
import { Logger } from './logging';
import { preProcess } from './pre-processor';
import { postProcess } from './post-processor';
import { stopScreenCapture } from './screenCapture';

const activeLoops: Record<string, {
  timeoutId: number | null,
  isRunning: boolean,
  isExecuting: boolean,
  lastExecutionTime: number,
  serverHost: string,
  serverPort: string
}> = {};

let serverHost = 'localhost';
let serverPort = '3838';

/**
 * Set the Ollama server connection details
 */
export function setOllamaServerAddress(host: string, port: string): void {
  serverHost = host;
  serverPort = port;
  Logger.info('SERVER', `Ollama server address set to ${host}:${port}`);
}

export function getOllamaServerAddress(): { host: string, port: string } {
  return { host: serverHost, port: serverPort };
}

/**
 * Schedule next execution
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
      throw new Error(`Agent ${agentId} not found`);
    }
    
    Logger.debug(agentId, `Starting agent loop for ${agent.name}`);
    
    // Store loop information
    activeLoops[agentId] = {
      timeoutId: null,
      isRunning: true,
      isExecuting: false,
      lastExecutionTime: 0,
      serverHost,
      serverPort
    };
    
    // Run first iteration immediately
    Logger.debug(agentId, `Running first iteration immediately`);
    await executeAgentIteration(agentId);
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    Logger.error(agentId, `Error starting agent: ${errorMessage}`, error);
    throw error;
  }
}

/**
 * Stop the main execution loop for an agent
 */
export function stopAgentLoop(agentId: string): void {
  const loop = activeLoops[agentId];
  
  if (loop && loop.isRunning) {
    Logger.debug(agentId, `Stopping agent loop`);
    
    // Clear the timeout
    if (loop.timeoutId !== null) {
      window.clearTimeout(loop.timeoutId);
    }
    
    // Stop screen capture when agent is stopped
    stopScreenCapture();
    
    // Update the loop status
    activeLoops[agentId] = {
      ...loop,
      isRunning: false,
      timeoutId: null
    };
    
    Logger.debug(agentId, `Agent loop stopped successfully`);
  } else {
    Logger.warn(agentId, `Attempted to stop agent that wasn't running`);
  }
}

/**
 * Execute a single iteration of the agent's loop
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
    const agentCode = await getAgentCode(agentId) || '';
    
    if (!agent) {
      throw new Error(`Agent ${agentId} not found`);
    }
    
    // 1. Pre-process: Prepare the prompt
    const systemPrompt = await preProcess(agentId, agent.system_prompt);

    Logger.info(agentId, `Prompt`, {
      logType: 'model-prompt',
      content: systemPrompt
    });
    console.log(systemPrompt)

    // 2. Send prompt to API
    Logger.debug(agentId, `Sending prompt to Ollama (${serverHost}:${serverPort}, model: ${agent.model_name})`);

    const response = await sendPrompt(
      serverHost,
      serverPort,
      agent.model_name,
      systemPrompt
    );

    Logger.info(agentId, `Response`, {
      logType: 'model-response',
      content: response
    });

  Logger.debug(agentId, `Response Received: ${response}`);
  Logger.debug(agentId, `About to call postProcess on ${agentId} with agentCode length: ${agentCode.length}`);
  try {
    await postProcess(agentId, response, agentCode);
    Logger.debug(agentId, `postProcess completed successfully`);
  } catch (postProcessError) {
    Logger.error(agentId, `Error in postProcess: ${postProcessError}`, postProcessError);
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
 */
export function isAgentLoopRunning(agentId: string): boolean {
  return activeLoops[agentId]?.isRunning === true;
}

/**
 * Get all currently running agent IDs
 */
export function getRunningAgentIds(): string[] {
  return Object.entries(activeLoops)
    .filter(([_, loop]) => loop.isRunning)
    .map(([agentId, _]) => agentId);
}

/**
 * Execute a single test iteration - this is a simplified version for testing in the UI
 */
export async function executeTestIteration(
  agentId: string,
  systemPrompt: string,
  modelName: string
): Promise<string> {
  try {
    Logger.debug(agentId, `Starting test iteration with model ${modelName}`);
    
    // Pre-process the prompt (even for tests)
    const processedPrompt = await preProcess(agentId, systemPrompt);
    
    // Send the prompt to Ollama and get response
    Logger.info(agentId, `Sending prompt to Ollama (model: ${modelName})`);
    const response = await sendPrompt(
      serverHost,
      serverPort,
      modelName,
      processedPrompt
    );
    stopScreenCapture();
    
    return response;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    Logger.error(agentId, `Error in test iteration: ${errorMessage}`, error);
    throw error;
  }
}
