import { CompleteAgent, getAgent } from './agent_database';
import { 
  startScreenCapture, 
  stopScreenCapture, 
  captureFrameAndOCR, 
  injectOCRTextIntoPrompt 
} from './screenCapture';
import { sendPromptToOllama } from './ollamaApi'; // Add this import


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
}


/**
 * Start the main execution loop for an agent
 * @param agentId The ID of the agent to start
 * @param serverHost Ollama server host
 * @param serverPort Ollama server port
 */
export async function startAgentLoop(agentId: string): Promise<void> {
  // Check if already running
  if (activeLoops[agentId]?.isRunning) {
    console.log(`Agent ${agentId} is already running`);
    return;
  }

  try {
    // Get the agent from the database
    const agent = await getAgent(agentId);
    
    if (!agent) {
      throw new Error(`Agent ${agentId} not found`);
    }
    
    console.log(`Starting agent loop for ${agent.name} (${agentId})`);
    
    // Initialize screen capture if needed
    if (agent.system_prompt.includes('SCREEN_OCR')) {
      console.log(`Agent ${agentId} requires screen access for OCR`);
      const stream = await startScreenCapture();
      
      if (!stream) {
        throw new Error('Failed to start screen capture');
      }
      
      console.log(`Screen capture started for agent ${agentId}`);
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
    
    // Store the loop information
    activeLoops[agentId] = loopInfo;
    
    // Run first iteration immediately
    await executeAgentIteration(agentId);
    
  } catch (error) {
    console.error(`Error starting agent ${agentId}:`, error);
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
    console.log(`Stopping agent loop for ${agentId}`);
    
    // Clear the interval
    window.clearInterval(loop.intervalId);
    
    // Stop screen capture
    stopScreenCapture();
    
    // Update the loop status
    activeLoops[agentId] = {
      ...loop,
      isRunning: false
    };
    
    console.log(`Agent loop for ${agentId} stopped`);
  }
}

/**
 * Execute a single iteration of the agent's loop
 * @param agentId The ID of the agent
 * @param serverHost Ollama server host
 * @param serverPort Ollama server port
 */

async function executeAgentIteration(agentId: string): Promise<void> {
  try {
    // Check if the loop is still active
    if (!activeLoops[agentId]?.isRunning) {
      console.log(`Skipping execution for stopped agent ${agentId}`);
      return;
    }
    
    console.log(`Executing iteration for agent ${agentId}`);
    
    // Get the latest agent data
    const agent = await getAgent(agentId);
    
    if (!agent) {
      throw new Error(`Agent ${agentId} not found`);
    }
    
    // Get the system prompt
    let systemPrompt = agent.system_prompt;
    
    // Check if we need to inject OCR
    if (systemPrompt.includes('SCREEN_OCR')) {
      console.log(`Performing OCR for agent ${agentId}`);
      
      // Capture the screen and perform OCR
      const ocrResult = await captureFrameAndOCR();
      
      if (ocrResult.success && ocrResult.text) {
        // Inject the OCR text into the prompt
        systemPrompt = injectOCRTextIntoPrompt(systemPrompt, ocrResult.text);
        console.log(`OCR injected into prompt for agent ${agentId}`);
      } else {
        console.error(`OCR failed for agent ${agentId}:`, ocrResult.error);
      }
    }
    
    // Log the system prompt
    console.log(`System prompt for agent ${agentId}:`, systemPrompt);
    
    // Send the prompt to Ollama and get response
    try {
      console.log(`Sending prompt to Ollama (${serverHost}:${serverPort}, model: ${agent.model_name})`);
      
      const response = await sendPromptToOllama(
        serverHost,
        serverPort,
        agent.model_name,
        systemPrompt
      );
      
      console.log(`Response from Ollama for agent ${agentId}:`, response);
      
      // Here you would process the response
      // For example, save it to a log or trigger actions based on it
      
    } catch (error) {
      console.error(`Error calling Ollama for agent ${agentId}:`, error);
    }
    
  } catch (error) {
    console.error(`Error in agent iteration ${agentId}:`, error);
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
