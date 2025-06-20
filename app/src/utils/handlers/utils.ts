// src/utils/handlers/utils.ts
import { Logger } from '../logging';
import { getAgentMemory as fetchAgentMemory, updateAgentMemory as saveAgentMemory } from '../agent_database';
import { recordingManager } from '../recordingManager'; 



/**
 * Utility functions for handlers
 */

/**
 * Get the current time in a readable format
 */
export function time(): string {
  return new Date().toLocaleTimeString([], {
    hour: 'numeric', 
    minute: '2-digit',
    hour12: true
  }).toLowerCase();
}

/**
 * Get agent's memory value
 */
export async function getMemory(agentId: string): Promise<string> {
  return await fetchAgentMemory(agentId);
}

/**
 * Set agent's memory value
 */
export async function setMemory(agentId: string, memory: any): Promise<void> {
  await saveAgentMemory(agentId, memory);
  
  // Log the memory update
  Logger.info(agentId, `Memory Updated`, {
    logType: 'memory-update',
    content: memory
  });
}

/**
 * Append to agent's memory value
 * @param agentId The agent's ID
 * @param content Content to append to memory
 * @param separator Optional separator between existing memory and new content (default: '\n')
 */
export async function appendMemory(agentId: string, content: string, separator: string = '\n'): Promise<void> {
  try {
    // Get current memory
    const currentMemory = await fetchAgentMemory(agentId);
    
    // If current memory exists and isn't empty, append with separator
    // Otherwise just set the content directly
    const newMemory = currentMemory ? `${currentMemory}${separator}${content}` : content;
    
    // Save updated memory
    await saveAgentMemory(agentId, newMemory);
    
    Logger.debug('MEMORY', `Appended to agent ${agentId} memory`);
    
    // Log the memory append
    Logger.info(agentId, `Memory Appended`, {
      logType: 'memory-update',
      content: newMemory,
      update: {
        appended: content,
        separator: separator
      }
    });
  } catch (error) {
    Logger.error('MEMORY', `Error appending to memory: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}


/**
 * Send a notification
 */
export function notify(title: string, message: string): void {
  try {
    // Check if notifications are supported
    if (!("Notification" in window)) {
      Logger.error('NOTIFICATION', 'Browser does not support notifications');
      return;
    }
    
    // Check permission status
    if (Notification.permission === "granted") {
      // Create and show notification
      new Notification(title, { body: message });
    } else if (Notification.permission !== "denied") {
      // Request permission
      Notification.requestPermission().then(permission => {
        if (permission === "granted") {
          new Notification(title, { body: message });
        }
      });
    }
  } catch (error) {
    Logger.error('NOTIFICATION', `Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}


/**
 * Sends an SMS message by calling the backend API.
 * This is the core utility function.
 */
export async function sendSms(message: string, number: string): Promise<void> {

  const API_HOST = "https://api.observer-ai.com";

  const authCode = localStorage.getItem("observer_auth_code");

  if (!authCode) {
    throw new Error("Authentication error: Not signed in or auth code is missing.");
  }

  try {
    const response = await fetch(`${API_HOST}/tools/send-sms`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Observer-Auth-Code': authCode,
      },
      // The backend expects 'to_number', so we map it here.
      body: JSON.stringify({
        to_number: number,
        message: message,
      }),
    });

    // If the response is not OK (e.g., 4xx or 5xx), throw an error.
    if (!response.ok) {
      const errorData = await response.json();
      // Use the 'detail' message from the FastAPI error response.
      const errorMessage = errorData.detail || 'Failed to send SMS due to a server error.';
      throw new Error(errorMessage);
    }

    // If successful, the function just completes.
  } catch (error) {
    // Re-throw the error to be caught by the calling context.
    // This allows the user's try/catch in their agent code to work.
    throw error;
  }
}


/**
 * Sends a WhatsApp notification using a pre-approved template.
 * @param message The content to be injected into the template's variable.
 * @param number The destination phone number in E.164 format (e.g., "+181429367").
 */
export async function sendWhatsapp(message: string, number:string): Promise<void> {
  const API_HOST = "https://api.observer-ai.com";
  const authCode = localStorage.getItem("observer_auth_code");

  if (!authCode) {
    throw new Error("Authentication error: Not signed in or auth code is missing.");
  }

  try {
    // Call the new backend endpoint
    const response = await fetch(`${API_HOST}/tools/send-whatsapp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Observer-Auth-Code': authCode,
      },
      // The body now matches our new WhatsAppRequest Pydantic model
      body: JSON.stringify({
        to_number: number,
        message: message, // This will become variable {{1}} in the template
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      const errorMessage = errorData.detail || 'Failed to send WhatsApp message due to a server error.';
      throw new Error(errorMessage);
    }

  } catch (error) {
    // Re-throw for the agent's try/catch block
    throw error;
  }
}
/**
 * Sends an email by calling the backend API.
 * This is the core utility function.
 * @param message The plain text content of the email.
 * @param emailAddress The recipient's email address.
 */
export async function sendEmail(message: string, emailAddress: string): Promise<void> { // <-- ARGUMENTS SWAPPED HERE

  const API_HOST = "https://api.observer-ai.com";
  const authCode = localStorage.getItem("observer_auth_code");

  if (!authCode) {
    throw new Error("Authentication error: Not signed in or auth code is missing.");
  }

  try {
    const response = await fetch(`${API_HOST}/tools/send-email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Observer-Auth-Code': authCode,
      },
      // The body now correctly maps to the backend's Pydantic model.
      body: JSON.stringify({
        to_email: emailAddress, // <-- CORRECT
        message: message,       // <-- CORRECT
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      const errorMessage = errorData.detail || 'Failed to send email due to a server error.';
      throw new Error(errorMessage);
    }

  } catch (error) {
    throw error;
  }
}

/**
 * Starts a new global clip session.
 * This transitions from creating disposable, loop-by-loop buffer recordings
 * to a single, continuous recording that spans multiple loops. It automatically
 * includes the most recent buffer as the beginning of the clip.
 * 
 * @returns {boolean} Returns `true` if the clip session successfully started, `false` if it was already in a clipping state.
 */
export async function startClip(): Promise<void> {
  try {
    // This function is now synchronous and simply delegates to the state machine.
    await recordingManager.startClip();
  } catch (error) {
    Logger.error('recordingManager', `Error starting clip session: ${error}`);
  }
}

/**
 * Stops the currently active global clip session, saves the complete recording
 * to the database, and returns to the default "buffering" mode.
 * Does nothing if no clip session is active.
 */
export async function stopClip(): Promise<void> {
  try {
    // This delegates to the async stopClip method on the manager, which handles saving.
    await recordingManager.stopClip();
  } catch (error) {
    Logger.error('recordingManager', `Error stopping clip session: ${error}`);
  }
}


/**
 * Marks a specific point in time with a label.
 * If a recording is in progress (or buffering), this marker will be attached to the final video clip.
 * The marker is created with an absolute timestamp, making it useful even if no recording is active.
 *
 * @param {string} label - A descriptive label for the event you are marking. e.g., "User opened settings".
 */
export function markClip(label: string): void {
  try {
    if (!label || typeof label !== 'string') {
      Logger.warn('markClip', 'A valid string label must be provided.');
      return;
    }
    // Delegate directly to the recording manager's new method.
    recordingManager.addMarker(label);
  } catch (error) {
    Logger.error('markClip', `Error creating marker: ${error}`);
  }
}
