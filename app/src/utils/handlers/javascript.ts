// src/utils/handlers/javascript.ts

import * as utils from './utils';
import { Logger } from '../logging';
import { startAgentLoop, stopAgentLoop } from '../main_loop';
import type { TokenProvider } from '../main_loop';

// Helper function to extract error messages properly
function extractErrorMessage(error: any): string {
  if (typeof error === 'string') return error;
  if (error instanceof Error) return error.message;
  if (error?.message) return error.message;
  if (error?.toString && typeof error.toString === 'function') return error.toString();
  return String(error);
} 

/**
 * Execute JavaScript handler for processing agent responses
 */
export async function executeJavaScript(
  response: string,
  agentId: string,
  code: string,
  iterationId: string, // <-- New parameter
  getToken?: TokenProvider 
): Promise<boolean> {
  try {
    const context = {
      response,
      agentId,
      getMemory: async (targetId = agentId) => {
        try {
          const result = await utils.getMemory(targetId);
          Logger.info(agentId, `Memory retrieved for ${targetId}`, {
            logType: 'tool-success',
            iterationId,
            content: { tool: 'getMemory', params: { targetId }, result: result.slice(0, 100) + (result.length > 100 ? '...' : '') }
          });
          return result;
        } catch (error) {
          Logger.error(agentId, `Failed to get memory for ${targetId}`, {
            logType: 'tool-error',
            iterationId,
            content: { tool: 'getMemory', params: { targetId }, error: extractErrorMessage(error) }
          });
          throw error;
        }
      },
      setMemory: async (targetId: string, value?: any) => {
        try {
          let result;
          if (value === undefined) {
            result = await utils.setMemory(agentId, targetId);
            Logger.info(agentId, `Memory set for ${agentId}`, {
              logType: 'tool-success',
              iterationId,
              content: { tool: 'setMemory', params: { targetId: agentId, value: String(targetId).slice(0, 100) } }
            });
          } else {
            result = await utils.setMemory(targetId, value);
            Logger.info(agentId, `Memory set for ${targetId}`, {
              logType: 'tool-success',
              iterationId,
              content: { tool: 'setMemory', params: { targetId, value: String(value).slice(0, 100) } }
            });
          }
          return result;
        } catch (error) {
          Logger.error(agentId, `Failed to set memory`, {
            logType: 'tool-error',
            iterationId,
            content: { tool: 'setMemory', params: { targetId, value: String(value || targetId).slice(0, 100) }, error: extractErrorMessage(error) }
          });
          throw error;
        }
      },
      appendMemory: async (targetId: string, content?: string, separator = '\n') => {
        try {
          let result;
          if (content === undefined) {
            result = await utils.appendMemory(agentId, targetId, separator);
            Logger.info(agentId, `Memory appended for ${agentId}`, {
              logType: 'tool-success',
              iterationId,
              content: { tool: 'appendMemory', params: { targetId: agentId, content: targetId.slice(0, 100), separator } }
            });
          } else {
            result = await utils.appendMemory(targetId, content, separator);
            Logger.info(agentId, `Memory appended for ${targetId}`, {
              logType: 'tool-success',
              iterationId,
              content: { tool: 'appendMemory', params: { targetId, content: content.slice(0, 100), separator } }
            });
          }
          return result;
        } catch (error) {
          Logger.error(agentId, `Failed to append memory`, {
            logType: 'tool-error',
            iterationId,
            content: { tool: 'appendMemory', params: { targetId, content: String(content || targetId).slice(0, 100), separator }, error: extractErrorMessage(error) }
          });
          throw error;
        }
      },
      notify: (title: string, message: string) => {
        try {
          utils.notify(title, message);
          Logger.info(agentId, `Notification sent: ${title}`, {
            logType: 'tool-success',
            iterationId,
            content: { tool: 'notify', params: { title, message: message.slice(0, 100) } }
          });
        } catch (error) {
          Logger.error(agentId, `Failed to send notification`, {
            logType: 'tool-error',
            iterationId,
            content: { tool: 'notify', params: { title, message: message.slice(0, 100) }, error: extractErrorMessage(error) }
          });
          throw error;
        }
      },
      time: () => {
        try {
          const result = utils.time();
          Logger.info(agentId, `Current time retrieved: ${result}`, {
            logType: 'tool-success',
            iterationId,
            content: { tool: 'time', params: {}, result }
          });
          return result;
        } catch (error) {
          Logger.error(agentId, `Failed to get current time`, {
            logType: 'tool-error',
            iterationId,
            content: { tool: 'time', params: {}, error: extractErrorMessage(error) }
          });
          throw error;
        }
      },
      console: console,
      startAgent: async (targetAgentId?: string) => {
        try {
          const idToStart = targetAgentId === undefined ? agentId : targetAgentId;
          await startAgentLoop(idToStart, getToken);
          Logger.info(agentId, `Agent started: ${idToStart}`, {
            logType: 'tool-success',
            iterationId,
            content: { tool: 'startAgent', params: { targetAgentId: idToStart } }
          });
        } catch (error) {
          Logger.error(agentId, `Failed to start agent`, {
            logType: 'tool-error',
            iterationId,
            content: { tool: 'startAgent', params: { targetAgentId }, error: extractErrorMessage(error) }
          });
          throw error;
        }
      },
      stopAgent: async (targetAgentId?: string) => {
        try {
          const idToStop = targetAgentId === undefined ? agentId : targetAgentId;
          await stopAgentLoop(idToStop);
          Logger.info(agentId, `Agent stopped: ${idToStop}`, {
            logType: 'tool-success',
            iterationId,
            content: { tool: 'stopAgent', params: { targetAgentId: idToStop } }
          });
        } catch (error) {
          Logger.error(agentId, `Failed to stop agent`, {
            logType: 'tool-error',
            iterationId,
            content: { tool: 'stopAgent', params: { targetAgentId }, error: extractErrorMessage(error) }
          });
          throw error;
        }
      },

      // --- UPDATED FUNCTIONS ---

      sendSms: async (message: string, number: string) => {
        try {
          if (!getToken) throw new Error("Authentication context not available for sendSms.");
          
          const token = await getToken();
          if (!token) throw new Error("Failed to retrieve authentication token for SMS.");

          await utils.sendSms(message, number, token);
          Logger.info(agentId, `SMS sent to ${number}`, { 
            logType: 'tool-success', 
            iterationId,
            content: { tool: 'sendSms', params: { message: message.slice(0,100), number }, success: true }
          });
        } catch (error) {
          Logger.error(agentId, `Failed to send SMS to ${number}`, {
            logType: 'tool-error',
            iterationId,
            content: { tool: 'sendSms', params: { message: message.slice(0,100), number }, error: extractErrorMessage(error) }
          });
          throw error;
        }
      },

      sendWhatsapp: async(message: string, number: string) => {
        try {
          if (!getToken) throw new Error("Authentication context not available for sendWhatsapp.");

          const token = await getToken();
          if (!token) throw new Error("Failed to retrieve authentication token for WhatsApp.");

          await utils.sendWhatsapp(message, number, token);
          Logger.info(agentId, `WhatsApp sent to ${number}`, { 
            logType: 'tool-success', 
            iterationId,
            content: { tool: 'sendWhatsapp', params: { message: message.slice(0,100), number }, success: true }
          });
        } catch (error) {
          Logger.error(agentId, `Failed to send WhatsApp to ${number}`, {
            logType: 'tool-error',
            iterationId,
            content: { tool: 'sendWhatsapp', params: { message: message.slice(0,100), number }, error: extractErrorMessage(error) }
          });
          throw error;
        }
      },

      sendEmail: async (message: string, emailAddress: string) => {
        try {
          if (!getToken) throw new Error("Authentication context not available for sendEmail.");
          
          const token = await getToken();
          if (!token) throw new Error("Failed to retrieve authentication token for Email.");

          await utils.sendEmail(message, emailAddress, token);
          Logger.info(agentId, `Email sent to ${emailAddress}`, { 
            logType: 'tool-success', 
            iterationId,
            content: { tool: 'sendEmail', params: { message: message.slice(0,100), emailAddress }, success: true }
          });
        } catch (error) {
          Logger.error(agentId, `Failed to send email to ${emailAddress}`, {
            logType: 'tool-error',
            iterationId,
            content: { tool: 'sendEmail', params: { message: message.slice(0,100), emailAddress }, error: extractErrorMessage(error) }
          });
          throw error;
        }
      },

      sendPushover: async (message: string, userKey: string, title?: string) => {
        try {
          if (!getToken) {
              throw new Error("Authentication context not available for sendPushover.");
          }

          const token = await getToken();
          if (!token) {
              throw new Error("Failed to retrieve authentication token for Pushover.");
          }

          await utils.sendPushover(message, userKey, token, title);
          Logger.info(agentId, `Pushover notification sent`, { 
            logType: 'tool-success', 
            iterationId,
            content: { tool: 'sendPushover', params: { message: message.slice(0,100), title }, success: true }
          });
        } catch (error) {
          Logger.error(agentId, `Failed to send Pushover notification`, {
            logType: 'tool-error',
            iterationId,
            content: { tool: 'sendPushover', params: { message: message.slice(0,100), title }, error: extractErrorMessage(error) }
          });
          throw error;
        }
      },

      sendDiscordBot: async (message: string, webhookUrl: string) => {
        try {
          if (!getToken) {
              throw new Error("Authentication context not available for sendDiscordBot.");
          }

          const token = await getToken();
          if (!token) {
              throw new Error("Failed to retrieve authentication token for sendDiscordBot.");
          }

          await utils.sendDiscordBot(message, webhookUrl, token);
          Logger.info(agentId, `Discord notification sent`, { 
            logType: 'tool-success', 
            iterationId,
            content: { tool: 'sendDiscordBot', params: { message: message.slice(0,100) }, success: true }
          });
        } catch (error) {
          Logger.error(agentId, `Failed to send Discord notification`, {
            logType: 'tool-error',
            iterationId,
            content: { tool: 'sendDiscordBot', params: { message: message.slice(0,100) }, error: extractErrorMessage(error) }
          });
          throw error;
        }
      },

      sendGotify: async (message: string, serverUrl: string, appToken: string, title?: string, priority?: number) => {
        try {
          await utils.sendGotify(message, serverUrl, appToken, title, priority);
          Logger.info(agentId, `Gotify notification sent`, { 
            logType: 'tool-success', 
            iterationId,
            content: { tool: 'sendGotify', params: { message: message.slice(0,100), title, priority }, success: true }
          });
        } catch (error) {
          Logger.error(agentId, `Failed to send Gotify notification`, {
            logType: 'tool-error',
            iterationId,
            content: { tool: 'sendGotify', params: { message: message.slice(0,100), title, priority }, error: extractErrorMessage(error) }
          });
          throw error;
        }
      },
      
      startClip: async () => {
        try {
          await utils.startClip();
          Logger.info(agentId, `Clip recording started`, {
            logType: 'tool-success',
            iterationId,
            content: { tool: 'startClip', params: {} }
          });
        } catch (error) {
          Logger.error(agentId, `Failed to start clip recording`, {
            logType: 'tool-error',
            iterationId,
            content: { tool: 'startClip', params: {}, error: extractErrorMessage(error) }
          });
          throw error;
        }
      },
      stopClip: async () => {
        try {
          await utils.stopClip();
          Logger.info(agentId, `Clip recording stopped`, {
            logType: 'tool-success',
            iterationId,
            content: { tool: 'stopClip', params: {} }
          });
        } catch (error) {
          Logger.error(agentId, `Failed to stop clip recording`, {
            logType: 'tool-error',
            iterationId,
            content: { tool: 'stopClip', params: {}, error: extractErrorMessage(error) }
          });
          throw error;
        }
      },
      markClip: (label: string) => {
        try {
          utils.markClip(label);
          Logger.info(agentId, `Clip marked: ${label}`, {
            logType: 'tool-success',
            iterationId,
            content: { tool: 'markClip', params: { label } }
          });
        } catch (error) {
          Logger.error(agentId, `Failed to mark clip`, {
            logType: 'tool-error',
            iterationId,
            content: { tool: 'markClip', params: { label }, error: extractErrorMessage(error) }
          });
          throw error;
        }
      },

      ask: async (question: string, title = 'Confirmation'): Promise<boolean> => {
        try {
          const appUrl = "http://localhost:3838";
   
          if (!appUrl) throw new Error("Could not determine the local app server address.");

          const response = await utils.ask(appUrl, title, question);
          Logger.info(agentId, `User responded with: ${response}`,
          {
            logType: 'tool-success', 
            iterationId,
            content: { tool: 'ask', params: { question: question.slice(0,100), title }, result: response }
          });
          return response;
        } catch (error) {
          Logger.error(agentId, `Failed to ask user question`, {
            logType: 'tool-error',
            iterationId,
            content: { tool: 'ask', params: { question: question.slice(0,100), title }, error: extractErrorMessage(error) }
          });
          throw error;
        }
      },

      message: async (message: string, title = 'Agent Message'): Promise<void> => {
        try {
          const appUrl = "http://localhost:3838";

          if (!appUrl) throw new Error("Could not determine the local app server address.");

          await utils.message(appUrl, title, message);
          Logger.info(agentId, `User message shown`, { 
            logType: 'tool-success', 
            iterationId,
            content: { tool: 'message', params: { message: message.slice(0,100), title }, success: true }
          });
        } catch (error) {
          Logger.error(agentId, `Failed to show user message`, {
            logType: 'tool-error',
            iterationId,
            content: { tool: 'message', params: { message: message.slice(0,100), title }, error: extractErrorMessage(error) }
          });
          throw error;
        }
      },

      system_notify: async (body: string, title = 'Observer AI'): Promise<void> => {
        try {
          const appUrl = "http://localhost:3838";

          if (!appUrl) throw new Error("Could not determine the local app server address.");

          await utils.system_notify(appUrl, title, body);
          Logger.info(agentId, `System notification sent`, { 
            logType: 'tool-success', 
            iterationId,
            content: { tool: 'system_notify', params: { body: body.slice(0,100), title }, success: true }
          });
        } catch (error) {
          Logger.error(agentId, `Failed to send system notification`, {
            logType: 'tool-error',
            iterationId,
            content: { tool: 'system_notify', params: { body: body.slice(0,100), title }, error: extractErrorMessage(error) }
          });
          throw error;
        }
      },

      translucent: async (body: string): Promise<void> => {
        try {
          const appUrl = "http://localhost:3838";

          if (!appUrl) throw new Error("Could not determine the local app server address.");

          await utils.translucent(appUrl, body);
          Logger.info(agentId, `Translucent message sent`, { 
            logType: 'tool-success', 
            iterationId,
            content: { tool: 'translucent', params: { body: body.slice(0,100)}, success: true }
          });
        } catch (error) {
          Logger.error(agentId, `Failed to send translucent message`, {
            logType: 'tool-error',
            iterationId,
            content: { tool: 'system_notify', params: { body: body.slice(0,100)}, error: extractErrorMessage(error) }
          });
          throw error;
        }
      },


    };

    const wrappedCode = `
      (async function() {
        try {
          ${code}
          return true;
        } catch (e) {
          console.error('Error in handler:', e);
          return false;
        }
      })()
    `;

    const handler = new Function(...Object.keys(context), wrappedCode);
    return await handler(...Object.values(context));

  } catch (error) {
    Logger.error(agentId, `Error executing JavaScript: ${error}`,
    {
      logType: 'tool-error', 
      iterationId,
      content: { error: extractErrorMessage(error), success: false }
    });
    return false;
  }
}
