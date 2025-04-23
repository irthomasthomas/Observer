// src/utils/main_loop.ts
import { getAgent, getAgentCode, updateAgentStatus } from './agent_database';
import { sendPrompt } from './sendApi';
import { Logger } from './logging';
import { preProcess } from './pre-processor';
import { postProcess } from './post-processor';
import { stopScreenCapture } from './screenCapture';

const activeLoops: Record<string, {
  intervalId: number | null,
  isRunning: boolean,
  serverHost: string,
  serverPort: string
}> = {};


export const AGENT_STATUS_CHANGED_EVENT = 'agentStatusChanged';

let serverHost = 'localhost';
let serverPort = '3838';

export function setOllamaServerAddress(host: string, port: string): void {
  serverHost = host;
  serverPort = port;
  Logger.info('SERVER', `Ollama server address set to ${host}:${port}`);
}

export function getOllamaServerAddress(): { host: string; port: string } {
  return { host: serverHost, port: serverPort };
}

export async function startAgentLoop(agentId: string): Promise<void> {
  if (activeLoops[agentId]?.isRunning) {
    Logger.warn(agentId, `Agent is already running`);
    return;
  }

  try {
    const agent = await getAgent(agentId);
    if (!agent) throw new Error(`Agent ${agentId} not found`);

    activeLoops[agentId] = { intervalId: null, isRunning: true, serverHost, serverPort };
    await updateAgentStatus(agentId, 'running');
    window.dispatchEvent(
      new CustomEvent(AGENT_STATUS_CHANGED_EVENT, {
        detail: { agentId, status: 'running' },
      })
    );

    // first iteration immediately
    await executeAgentIteration(agentId);

    // then schedule
    const intervalMs = agent.loop_interval_seconds * 1000;
    activeLoops[agentId].intervalId = window.setInterval(async () => {
      if (activeLoops[agentId]?.isRunning) {
        try {
          await executeAgentIteration(agentId);
        } catch (e) {
          Logger.error(agentId, `Error in interval: ${e}`, e);
        }
      }
    }, intervalMs);
  } catch (error) {
    // on failure, dispatch “stopped” so UI can recover
    window.dispatchEvent(
      new CustomEvent(AGENT_STATUS_CHANGED_EVENT, {
        detail: { agentId, status: 'stopped' },
      })
    );
    // clean up and re-throw…
    throw error;
  }
}

export async function stopAgentLoop(agentId: string): Promise<void> {
  const loop = activeLoops[agentId];
  if (loop?.isRunning) {
    if (loop.intervalId !== null) window.clearInterval(loop.intervalId);
    await updateAgentStatus(agentId, 'stopped');
    window.dispatchEvent(
      new CustomEvent(AGENT_STATUS_CHANGED_EVENT, {
        detail: { agentId, status: 'stopped' },
      })
    );
    stopScreenCapture();
    activeLoops[agentId] = { ...loop, isRunning: false, intervalId: null };
  } else {
    Logger.warn(agentId, `Attempted to stop agent that wasn't running`);
  }
}

/**
 * Execute a single iteration of the agent's loop
 */
export async function executeAgentIteration(agentId: string): Promise<void> {
  // Check if the loop is still active
  if (!activeLoops[agentId]?.isRunning) {
    Logger.debug(agentId, `Skipping execution for stopped agent`);
    return;
  }
  
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
    console.log(systemPrompt);

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
