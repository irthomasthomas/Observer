// src/utils/main_loop.ts

import { getAgent, getAgentCode } from './agent_database';
import { sendPrompt } from './sendApi';
import { Logger } from './logging';
import { preProcess } from './pre-processor';
import { postProcess } from './post-processor';
import { stopRecognitionAndClear } from './speechInputManager';
import { StreamManager } from './streamManager'; // Import the new manager

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

    // --- STREAM MANAGEMENT ---
    // Tell the StreamManager which streams this agent requires based on its prompt
    if (agent.system_prompt.includes('$SCREEN_64')) {
        await StreamManager.requestStream('screen', agentId);
    }
    // Assuming a future variable like $CAMERA_64 will be used for camera
    if (agent.system_prompt.includes('$CAMERA')) {
        await StreamManager.requestStream('camera', agentId);
    }
    if (agent.system_prompt.includes('$SYSTEM_AUDIO')) {
      await StreamManager.requestStream('audio', agentId);
    }
    // -------------------------

    activeLoops[agentId] = { intervalId: null, isRunning: true, serverHost, serverPort };
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
    Logger.error(agentId, `Failed to start agent loop: ${error instanceof Error ? error.message : String(error)}`);
    // On startup failure, ensure we release any streams that might have been requested
    StreamManager.releaseStream('screen', agentId);
    StreamManager.releaseStream('camera', agentId);
    // Dispatch "stopped" so UI can recover
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

    // --- STREAM MANAGEMENT ---
    // Tell the StreamManager this agent no longer needs these streams.
    // The manager will handle stopping the hardware if it's the last user.
    StreamManager.releaseStream('screen', agentId);
    StreamManager.releaseStream('camera', agentId);
    StreamManager.releaseStream('audio', agentId);

    // -------------------------

    // We no longer call stopScreenCapture() or stopCameraCapture() directly from here.
    stopRecognitionAndClear(agentId); // for microphone

    activeLoops[agentId] = { ...loop, isRunning: false, intervalId: null };
    window.dispatchEvent(
      new CustomEvent(AGENT_STATUS_CHANGED_EVENT, {
        detail: { agentId, status: 'stopped' },
      })
    );
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
    // Since this is a one-off test, we don't use the StreamManager and just stop the capture.
    // This assumes the pre-processor for tests might call startScreenCapture directly.
    // If test logic changes, this might need updating.
    // stopScreenCapture(); // Note: This might need re-evaluation based on test flow.

    return response;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    Logger.error(agentId, `Error in test iteration: ${errorMessage}`, error);
    throw error;
  }
}
