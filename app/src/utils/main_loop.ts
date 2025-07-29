// src/utils/main_loop.ts

import { getAgent, getAgentCode } from './agent_database';
import { sendPrompt, UnauthorizedError } from './sendApi';
import { Logger } from './logging';
import { preProcess } from './pre-processor';
import { postProcess } from './post-processor';
import { StreamManager, PseudoStreamType } from './streamManager'; // Import the new manager
import { recordingManager } from './recordingManager';
import { IterationStore } from './IterationStore';

export type TokenProvider = () => Promise<string | undefined>;

const activeLoops: Record<string, {
  intervalId: number | null,
  isRunning: boolean,
  serverHost: string,
  serverPort: string,
  getToken?: TokenProvider;
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

export async function startAgentLoop(agentId: string, getToken?: TokenProvider): Promise<void> {
  if (activeLoops[agentId]?.isRunning) {
    Logger.warn(agentId, `Agent is already running`);
    return;
  }
  
  const isFirstAgent = getRunningAgentIds().length === 0;


  try {
    const agent = await getAgent(agentId);
    if (!agent) throw new Error(`Agent ${agentId} not found`);

    const streamRequirementsMap = {
      '$SCREEN_64': 'screenVideo', '$SCREEN_OCR': 'screenVideo', '$CAMERA': 'camera', '$SCREEN_AUDIO': 'screenAudio',
      '$MICROPHONE': 'microphone', '$ALL_AUDIO': 'allAudio'
    };
    
    const requiredStreams = Object.entries(streamRequirementsMap)
      .filter(([placeholder, _]) => agent.system_prompt.includes(placeholder))
      .map(([_, streamType]) => streamType as PseudoStreamType);
    
    if (requiredStreams.length > 0) {
      // A single, transactional call to the StreamManager.
      await StreamManager.requestStreamsForAgent(agentId, requiredStreams);
    }
    
    if (isFirstAgent) {
      recordingManager.initialize();
    }

    // Generate sessionId and start new session
    const sessionId = `session_${new Date().toISOString()}_${Math.random().toString(36).substring(2, 9)}`;
    IterationStore.startSession(agentId, sessionId);

    activeLoops[agentId] = { 
        intervalId: null, 
        isRunning: true, 
        serverHost, 
        serverPort,
        getToken 
    };
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

    let displayError = error;
    // Check for the specific Safari screen sharing error
    if (error instanceof Error && error.message.includes('getDisplayMedia must be called from a user gesture handler')) {
        const safariErrorMessage = "Safari is bad at screen sharing and can't start automatically, click on the Observer App Icon on the top left to enter the Sensor Permissions Menu and ask for screen sharing manually. Also note: Safari won't capture System Audio, use chrome, firefox or edge for the best experience.";
        displayError = new Error(safariErrorMessage);
    }

    Logger.error(agentId, `Failed to start agent loop: ${displayError instanceof Error ? displayError.message : String(displayError)}`, error);
    // On startup failure, ensure we release any streams that might have been requested
    StreamManager.releaseStreamsForAgent(agentId);
    // Dispatch "stopped" so UI can recover
    window.dispatchEvent(
      new CustomEvent(AGENT_STATUS_CHANGED_EVENT, {
        detail: { agentId, status: 'stopped' },
      })
    );
    // clean up and re-throw…
    throw displayError;
  }
}

export async function stopAgentLoop(agentId: string): Promise<void> {
  const loop = activeLoops[agentId];
  if (loop?.isRunning) {
    if (loop.intervalId !== null) window.clearInterval(loop.intervalId);

    // --- STREAM MANAGEMENT ---
    // Tell the StreamManager this agent no longer needs these streams.
    // The manager will handle stopping the hardware if it's the last user.
    Logger.debug(agentId, "Releasing all potential streams for stopping agent.");

    StreamManager.releaseStreamsForAgent(agentId);

    // End the current session and save to IndexedDB
    await IterationStore.endSession(agentId);

    // -------------------------

    activeLoops[agentId] = { ...loop, isRunning: false, intervalId: null };
    
    if (getRunningAgentIds().length === 0) {
      // This was the last running agent, so shut down the recorder.
      recordingManager.forceStop();
    }

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
  const loopData = activeLoops[agentId];
  if (!loopData?.isRunning) {
    // This log is outside an iteration, so no ID is needed.
    Logger.debug(agentId, `Skipping execution for stopped agent`);
    return;
  }

  // --- ITERATION START ---
  const iterationId = `iter_${new Date().toISOString()}_${Math.random().toString(36).substring(2, 9)}`;

  try {
    const agent = await getAgent(agentId);
    const agentCode = await getAgentCode(agentId) || '';
    if (!agent) throw new Error(`Agent ${agentId} not found`);

    Logger.info(agentId, `Iteration started`, { 
      logType: 'iteration-start', 
      iterationId,
      content: { model: agent.model_name, interval: agent.loop_interval_seconds }
    });

    const systemPrompt = await preProcess(agentId, agent.system_prompt, iterationId);
    Logger.info(agentId, `Prompt`, { logType: 'model-prompt', iterationId, content: systemPrompt });

    let token: string | undefined;
    if (loopData.getToken) {
        try {
          Logger.debug(agentId, 'Requesting fresh API token...', { iterationId });
          token = await loopData.getToken();
        } catch (error) {
          Logger.warn(agentId, `Could not retrieve auth token: ${error}. Continuing without it.`, { iterationId });
        }
    }

    Logger.debug(agentId, `Sending prompt to Ollama (${serverHost}:${serverPort}, model: ${agent.model_name})`, { iterationId });
    const response = await sendPrompt(serverHost, serverPort, agent.model_name, systemPrompt, token);
    Logger.info(agentId, `Response`, { logType: 'model-response', iterationId, content: response });

    try {
      await postProcess(agentId, response, agentCode, iterationId, loopData.getToken);
      Logger.debug(agentId, `postProcess completed successfully`, { iterationId });
    } catch (postProcessError) {
      Logger.error(agentId, `Error in postProcess: ${postProcessError}`, { iterationId, error: postProcessError });
    } finally {
      if (isAgentLoopRunning(agentId)) {
        recordingManager.handleEndOfLoop();
      }
      Logger.info(agentId, `Iteration completed`, { 
        logType: 'iteration-end', 
        iterationId,
        content: { success: true }
      });
    }

  } catch (error) {
    Logger.error(agentId, `Iteration failed`, { 
      logType: 'iteration-end', 
      iterationId,
      content: { success: false, error: error instanceof Error ? error.message : String(error) }
    });
    
    if (error instanceof UnauthorizedError) {
    // 1. Log a clear, specific warning for debugging
      Logger.warn(agentId, 'Agent stopped due to quota limit (401 Unauthorized).');
      stopAgentLoop(agentId);
      window.dispatchEvent(new CustomEvent('quotaExceeded', {detail: { agentId: agentId }}));
    } else {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      Logger.error(agentId, `Error in agent iteration: ${errorMessage}`, error);
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
  modelName: string,
  getToken?: TokenProvider
): Promise<string> {
  try {
    Logger.debug(agentId, `Starting test iteration with model ${modelName}`);

    // Pre-process the prompt (even for tests)
    const processedPrompt = await preProcess(agentId, systemPrompt);

    let token: string | undefined;
    // Check if the getToken function was provided before trying to call it.
    if (getToken) {
        Logger.debug(agentId, 'Requesting fresh API token for test run...');
        token = await getToken();
    }

    // Send the prompt to Ollama and get response
    Logger.info(agentId, `Sending prompt to Ollama (model: ${modelName})`);
    const response = await sendPrompt(
      serverHost,
      serverPort,
      modelName,
      processedPrompt,
      token
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
