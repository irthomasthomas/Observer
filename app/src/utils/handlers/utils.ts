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
}

/**
 * Append to agent's memory value
 */
export async function appendMemory(agentId: string, content: string, separator: string = '\n'): Promise<void> {
  const currentMemory = await fetchAgentMemory(agentId);
  const newMemory = currentMemory ? `${currentMemory}${separator}${content}` : content;
  await saveAgentMemory(agentId, newMemory);
}

/**
 * Sends a notification
 */
export function notify(title: string, message: string): void {
  if (!("Notification" in window)) {
    console.error('Browser does not support notifications');
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
      try {
        const errorData = await response.json();
        const errorMessage = typeof errorData.detail === 'string' 
          ? errorData.detail 
          : `Failed to send SMS: ${response.status} ${response.statusText}`;
        throw new Error(errorMessage);
      } catch (parseError) {
        // If JSON parsing fails, use the HTTP status
        throw new Error(`Failed to send SMS: ${response.status} ${response.statusText}`);
      }
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
      try {
        const errorData = await response.json();
        const errorMessage = typeof errorData.detail === 'string' 
          ? errorData.detail 
          : `Failed to send WhatsApp message: ${response.status} ${response.statusText}`;
        throw new Error(errorMessage);
      } catch (parseError) {
        // If JSON parsing fails, use the HTTP status
        throw new Error(`Failed to send WhatsApp message: ${response.status} ${response.statusText}`);
      }
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
      try {
        const errorData = await response.json();
        const errorMessage = typeof errorData.detail === 'string' 
          ? errorData.detail 
          : `Failed to send email: ${response.status} ${response.statusText}`;
        throw new Error(errorMessage);
      } catch (parseError) {
        // If JSON parsing fails, use the HTTP status
        throw new Error(`Failed to send email: ${response.status} ${response.statusText}`);
      }
    }
  } catch (error) {
    throw error;
  }
}

/**
 * Starts a new global clip session.
 */
export async function startClip(): Promise<void> {
  await recordingManager.startClip();
}

/**
 * Stops the currently active global clip session.
 */
export async function stopClip(): Promise<void> {
  await recordingManager.stopClip();
}

/**
 * Marks a specific point in time with a label.
 */
export function markClip(label: string): void {
  if (!label || typeof label !== 'string') {
    console.warn('A valid string label must be provided.');
    return;
  }
  recordingManager.addMarker(label);
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
      try {
        const errorData = await response.json();
        const errorMessage = typeof errorData.detail === 'string' 
          ? errorData.detail 
          : `Failed to send Pushover notification: ${response.status} ${response.statusText}`;
        throw new Error(errorMessage);
      } catch (parseError) {
        // If JSON parsing fails, use the HTTP status
        throw new Error(`Failed to send Pushover notification: ${response.status} ${response.statusText}`);
      }
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
      try {
        const errorData = await response.json();
        const errorMessage = typeof errorData.detail === 'string' 
          ? errorData.detail 
          : `Failed to send Discord notification: ${response.status} ${response.statusText}`;
        throw new Error(errorMessage);
      } catch (parseError) {
        // If JSON parsing fails, use the HTTP status
        throw new Error(`Failed to send Discord notification: ${response.status} ${response.statusText}`);
      }
    }
  } catch (error) {
    // Rethrow the error so the agent's execution log can see it
    throw error;
  }
}

/**
 * Sends a notification directly to a user's self-hosted Gotify server.
 * This function does NOT use the Observer AI backend API.
 * @param message The main content of the notification.
 * @param serverUrl The base URL of the user's Gotify server (e.g., "https://gotify.example.com").
 * @param appToken The Gotify application token for authentication.
 * @param title An optional title for the notification.
 * @param priority An optional priority for the notification (numeric).
 */
export async function sendGotify(message: string, serverUrl: string, appToken: string, title?: string, priority?: number): Promise<void> {
  // 1. Input Validation
  if (!serverUrl || !appToken) {
    throw new Error("Gotify server URL and application token are required.");
  }

  // Ensure the URL is clean and doesn't have a trailing slash for consistency
  const cleanServerUrl = serverUrl.endsWith('/') ? serverUrl.slice(0, -1) : serverUrl;
  
  // Construct the full API endpoint URL
  const endpoint = `${cleanServerUrl}/message?token=${appToken}`;

  // 2. Construct the Payload
  const payload: { message: string; title?: string; priority?: number } = {
    message: message,
  };

  if (title) {
    payload.title = title;
  }
  if (priority) {
    payload.priority = priority;
  }

  // 3. Perform the fetch request directly to the user's Gotify server
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  // 4. Handle Response
  if (!response.ok) {
    // Try to get a more specific error from Gotify's response body
    const errorData = await response.json().catch(() => null); // Gracefully handle non-JSON responses
    const errorMessage = errorData?.error_description || `Request failed with status: ${response.status}`;
    throw new Error(`Failed to send Gotify notification: ${errorMessage}`);
  }
}

/**
 * Shows a native "ask" dialog and waits for the user's boolean response.
 * @param appUrl The base URL of the local Tauri server (e.g., "http://127.0.0.1:3838").
 * @param title The title of the dialog window.
 * @param question The main text/question in the dialog.
 * @returns A promise that resolves to `true` if the user clicks "Yes", and `false` otherwise.
 */
export async function ask(appUrl: string, title: string, question: string): Promise<boolean> {
  const response = await fetch(`${appUrl}/ask`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, question }),
  });

  if (!response.ok) {
    throw new Error(`Server responded with status: ${response.status}`);
  }

  const data = await response.json();
  return data.answer;
}

/**
 * Shows a native message dialog that the user must acknowledge.
 * @param appUrl The base URL of the local Tauri server.
 * @param title The title of the dialog window.
 * @param message The message to display.
 */
export async function message(appUrl: string, title: string, message: string): Promise<void> {
  const response = await fetch(`${appUrl}/message`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, message }),
  });

  if (!response.ok) {
    throw new Error(`Server responded with status: ${response.status}`);
  }
}

/**
 * Sends a non-blocking native system notification.
 * This is different from the browser-based `notify` function.
 * @param appUrl The base URL of the local Tauri server.
 * @param title The title of the notification.
 * @param body The main content of the notification.
 */
export async function system_notify(appUrl: string, title: string, body: string): Promise<void> {
  const response = await fetch(`${appUrl}/notification`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, body }),
  });

  if (!response.ok) {
    throw new Error(`Server responded with status: ${response.status}`);
  }
}
