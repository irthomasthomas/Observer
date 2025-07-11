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
