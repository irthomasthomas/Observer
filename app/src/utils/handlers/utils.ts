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
  
  Logger.info(agentId, `Memory Updated`, {
    logType: 'memory-update',
    content: memory
  });
}

/**
 * Append to agent's memory value
 */
export async function appendMemory(agentId: string, content: string, separator: string = '\n'): Promise<void> {
  try {
    const currentMemory = await fetchAgentMemory(agentId);
    const newMemory = currentMemory ? `${currentMemory}${separator}${content}` : content;
    await saveAgentMemory(agentId, newMemory);
    
    Logger.debug('MEMORY', `Appended to agent ${agentId} memory`);
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
    if (!("Notification" in window)) {
      Logger.error('NOTIFICATION', 'Browser does not support notifications');
      return;
    }
    
    if (Notification.permission === "granted") {
      new Notification(title, { body: message });
    } else if (Notification.permission !== "denied") {
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
export async function sendSms(message: string, number: string, authToken: string): Promise<void> {
  const API_HOST = "https://api.observer-ai.com";

  if (!authToken) {
    throw new Error("Authentication error: Auth token is missing.");
  }

  try {
    const response = await fetch(`${API_HOST}/tools/send-sms`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`, 
      },
      body: JSON.stringify({
        to_number: number,
        message: message,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      const errorMessage = errorData.detail || 'Failed to send SMS due to a server error.';
      throw new Error(errorMessage);
    }
  } catch (error) {
    throw error;
  }
}

/**
 * Sends a WhatsApp notification using a pre-approved template.
 */
export async function sendWhatsapp(message: string, number:string, authToken: string): Promise<void> {
  const API_HOST = "https://api.observer-ai.com";

  if (!authToken) {
    throw new Error("Authentication error: Auth token is missing.");
  }

  try {
    const response = await fetch(`${API_HOST}/tools/send-whatsapp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`, 
      },
      body: JSON.stringify({
        to_number: number,
        message: message,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      const errorMessage = errorData.detail || 'Failed to send WhatsApp message due to a server error.';
      throw new Error(errorMessage);
    }
  } catch (error) {
    throw error;
  }
}

/**
 * Sends an email by calling the backend API.
 */
export async function sendEmail(message: string, emailAddress: string, authToken: string): Promise<void> {
  const API_HOST = "https://api.observer-ai.com";

  if (!authToken) {
    throw new Error("Authentication error: Auth token is missing.");
  }

  try {
    const response = await fetch(`${API_HOST}/tools/send-email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`, 
      },
      body: JSON.stringify({
        to_email: emailAddress,
        message: message,
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
 */
export async function startClip(): Promise<void> {
  try {
    await recordingManager.startClip();
  } catch (error) {
    Logger.error('recordingManager', `Error starting clip session: ${error}`);
  }
}

/**
 * Stops the currently active global clip session.
 */
export async function stopClip(): Promise<void> {
  try {
    await recordingManager.stopClip();
  } catch (error) {
    Logger.error('recordingManager', `Error stopping clip session: ${error}`);
  }
}

/**
 * Marks a specific point in time with a label.
 */
export function markClip(label: string): void {
  try {
    if (!label || typeof label !== 'string') {
      Logger.warn('markClip', 'A valid string label must be provided.');
      return;
    }
    recordingManager.addMarker(label);
  } catch (error) {
    Logger.error('markClip', `Error creating marker: ${error}`);
  }
}

/**
 * Sends a Pushover notification by calling the backend API.
 * @param message The main content of the notification.
 * @param userKey The user's individual Pushover Key.
 * @param authToken The authentication token for the Observer AI API.
 * @param title An optional title for the notification.
 */
export async function sendPushover(message: string, userKey: string, authToken: string, title?: string): Promise<void> {
  const API_HOST = "https://api.observer-ai.com";

  if (!authToken) {
    throw new Error("Authentication error: Auth token is missing.");
  }

  if (!userKey) {
    throw new Error("Pushover user key is missing.");
  }

  try {
    const response = await fetch(`${API_HOST}/tools/send-pushover`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`, 
      },
      body: JSON.stringify({
        user_key: userKey, // Note: snake_case to match the Pydantic model on the backend
        message: message,
        title: title // This will be included if provided, otherwise ignored by the backend
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      const errorMessage = errorData.detail || 'Failed to send Pushover notification due to a server error.';
      throw new Error(errorMessage);
    }
  } catch (error) {
    // Rethrow the error so the agent's execution log can catch it
    throw error;
  }
}

/**
 * Sends a Discord notification via a user-provided webhook by calling the backend API.
 * @param message The main content of the notification.
 * @param webhookUrl The user's unique Discord Webhook URL.
 * @param authToken The authentication token for the Observer AI API.
 */
export async function sendDiscordBot(message: string, webhookUrl: string, authToken: string): Promise<void> {
  const API_HOST = "https://api.observer-ai.com";

  if (!authToken) {
    throw new Error("Authentication error: Auth token is missing.");
  }
  if (!webhookUrl) {
    throw new Error("Discord webhook URL is missing.");
  }

  const DISCORD_MESSAGE_LIMIT = 1900;

  let messageToSend = message;

  // Check if the message is too long
  if (message.length > DISCORD_MESSAGE_LIMIT) {
      // Log a warning in the Observer AI logs so the developer knows this happened
      Logger.warn('utils', `Discord message was too long (${message.length} chars) and has been automatically truncated.`);
      
      // Truncate the message and add a clear indicator that it was shortened
      messageToSend = message.substring(0, DISCORD_MESSAGE_LIMIT) + "... (msg trunc)";
  }

  try {
    const response = await fetch(`${API_HOST}/tools/send-discordbot`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`, 
      },
      body: JSON.stringify({
        message: messageToSend,
        webhook_url: webhookUrl, // snake_case to match the Pydantic model
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      const errorMessage = errorData.detail || 'Failed to send Discord notification due to a server error.';
      throw new Error(errorMessage);
    }
  } catch (error) {
    // Rethrow the error so the agent's execution log can see it
    throw error;
  }
}
