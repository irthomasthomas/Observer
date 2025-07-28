// src/utils/handlers/javascript.ts

import * as utils from './utils';
import { Logger } from '../logging';
import { startAgentLoop, stopAgentLoop } from '../main_loop';
import type { TokenProvider } from '../main_loop'; 

/**
 * Execute JavaScript handler for processing agent responses
 */
export async function executeJavaScript(
  response: string,
  agentId: string,
  code: string,
  getToken?: TokenProvider 
): Promise<boolean> {
  try {
    const context = {
      response,
      agentId,
      getMemory: async (targetId = agentId) => await utils.getMemory(targetId),
      setMemory: async (targetId: string, value?: any) => {
        if (value === undefined) {
          return await utils.setMemory(agentId, targetId);
        }
        return await utils.setMemory(targetId, value);
      },
      appendMemory: async (targetId: string, content?: string, separator = '\n') => {
        if (content === undefined) {
          return await utils.appendMemory(agentId, targetId, separator);
        }
        return await utils.appendMemory(targetId, content, separator);
      },
      notify: utils.notify,
      time: utils.time,
      console: console,
      startAgent: async (targetAgentId?: string) => {
        const idToStart = targetAgentId === undefined ? agentId : targetAgentId;
        await startAgentLoop(idToStart); 
      },
      stopAgent: async (targetAgentId?: string) => { 
        const idToStop = targetAgentId === undefined ? agentId : targetAgentId; 
        await stopAgentLoop(idToStop); 
      },

      // --- UPDATED FUNCTIONS ---

      sendSms: async (message: string, number: string) => {
        Logger.debug(agentId, `Agent is attempting to send an SMS to ${number}.`);
        if (!getToken) throw new Error("Authentication context not available for sendSms.");
        
        const token = await getToken();
        if (!token) throw new Error("Failed to retrieve authentication token for SMS.");

        await utils.sendSms(message, number, token);
        Logger.info(agentId, `Successfully sent SMS request for number: ${number}.`);
        // Enhanced logging: Log tool success with details
        Logger.info(agentId, `SMS sent to ${number}`, { 
          logType: 'tool-success', 
          content: { tool: 'sendSms', params: { message: message.slice(0,100), number }, success: true }
        });
      },

      sendWhatsapp: async(message: string, number: string) => {
        Logger.info(agentId, `Agent is attempting to send a Whatsapp to ${number}.`);
        if (!getToken) throw new Error("Authentication context not available for sendWhatsapp.");

        const token = await getToken();
        if (!token) throw new Error("Failed to retrieve authentication token for WhatsApp.");

        await utils.sendWhatsapp(message, number, token);
        Logger.info(agentId, `Successfully sent Whatsapp request for number: ${number}.`);
        // Enhanced logging: Log tool success with details
        Logger.info(agentId, `WhatsApp sent to ${number}`, { 
          logType: 'tool-success', 
          content: { tool: 'sendWhatsapp', params: { message: message.slice(0,100), number }, success: true }
        });
      },

      sendEmail: async (message: string, emailAddress: string) => {
        Logger.info(agentId, `Agent is attempting to send an email to ${emailAddress}.`);
        if (!getToken) throw new Error("Authentication context not available for sendEmail.");
        
        const token = await getToken();
        if (!token) throw new Error("Failed to retrieve authentication token for Email.");

        await utils.sendEmail(message, emailAddress, token);
        Logger.info(agentId, `Successfully sent email request for address: ${emailAddress}.`);
        // Enhanced logging: Log tool success with details
        Logger.info(agentId, `Email sent to ${emailAddress}`, { 
          logType: 'tool-success', 
          content: { tool: 'sendEmail', params: { message: message.slice(0,100), emailAddress }, success: true }
        });
      },

      sendPushover: async (message: string, userKey: string, title?: string) => {
        Logger.info(agentId, `Agent is attempting to send a Pushover notification.`);
        if (!getToken) {
            throw new Error("Authentication context not available for sendPushover.");
        }

        const token = await getToken();
        if (!token) {
            throw new Error("Failed to retrieve authentication token for Pushover.");
        }

        await utils.sendPushover(message, userKey, token, title);
        
        Logger.info(agentId, `Successfully sent Pushover notification request.`);
        // Enhanced logging: Log tool success with details
        Logger.info(agentId, `Pushover notification sent`, { 
          logType: 'tool-success', 
          content: { tool: 'sendPushover', params: { message: message.slice(0,100), title }, success: true }
        });
      },

      sendDiscordBot: async (message: string, webhookUrl: string) => {
        Logger.info(agentId, `Agent is attempting to send a Discord notification via webhook.`);
        if (!getToken) {
            throw new Error("Authentication context not available for sendDiscordBot.");
        }

        const token = await getToken();
        if (!token) {
            throw new Error("Failed to retrieve authentication token for sendDiscordBot.");
        }

        await utils.sendDiscordBot(message, webhookUrl, token);
        
        Logger.info(agentId, `Successfully sent Discord notification request.`);
        // Enhanced logging: Log tool success with details
        Logger.info(agentId, `Discord notification sent`, { 
          logType: 'tool-success', 
          content: { tool: 'sendDiscordBot', params: { message: message.slice(0,100) }, success: true }
        });
      },

      sendGotify: async (message: string, serverUrl: string, appToken: string, title?: string, priority?: number) => {
        Logger.info(agentId, `Agent is attempting to send a Gotify notification.`);
        
        await utils.sendGotify(message, serverUrl, appToken, title, priority);
        
        Logger.info(agentId, `Successfully sent Gotify notification request.`);
        // Enhanced logging: Log tool success with details
        Logger.info(agentId, `Gotify notification sent`, { 
          logType: 'tool-success', 
          content: { tool: 'sendGotify', params: { message: message.slice(0,100), title, priority }, success: true }
        });
      },
      
      startClip: utils.startClip,
      stopClip: utils.stopClip,
      markClip: utils.markClip,

      ask: async (question: string, title = 'Confirmation'): Promise<boolean> => {
        const appUrl = "http://localhost:3838";
 
        if (!appUrl) throw new Error("Could not determine the local app server address.");

        Logger.info(agentId, `Agent is asking user: "${question}"`);
        const response = await utils.ask(appUrl, title, question);
        Logger.info(agentId, `User responded with: ${response}`);
        // Enhanced logging: Log tool success with details
        Logger.info(agentId, `User dialog: ${response ? 'confirmed' : 'cancelled'}`, { 
          logType: 'tool-success', 
          content: { tool: 'ask', params: { question: question.slice(0,100), title }, result: response }
        });
        return response;
      },

      message: async (message: string, title = 'Agent Message'): Promise<void> => {
        const appUrl = "http://localhost:3838";

        if (!appUrl) throw new Error("Could not determine the local app server address.");

        Logger.info(agentId, `Agent is showing user a message: "${message}"`);
        await utils.message(appUrl, title, message);
        Logger.info(agentId, `User acknowledged message.`);
        // Enhanced logging: Log tool success with details
        Logger.info(agentId, `User message shown`, { 
          logType: 'tool-success', 
          content: { tool: 'message', params: { message: message.slice(0,100), title }, success: true }
        });
      },

      system_notify: async (body: string, title = 'Observer AI'): Promise<void> => {
        const appUrl = "http://localhost:3838";

        if (!appUrl) throw new Error("Could not determine the local app server address.");

        Logger.info(agentId, `Agent is sending a system notification: "${body}"`);
        await utils.system_notify(appUrl, title, body);
        Logger.info(agentId, `System notification sent.`);
        // Enhanced logging: Log tool success with details
        Logger.info(agentId, `System notification sent`, { 
          logType: 'tool-success', 
          content: { tool: 'system_notify', params: { body: body.slice(0,100), title }, success: true }
        });
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
    Logger.error(agentId, `Error executing JavaScript: ${error}`);
    // Enhanced logging: Log tool errors
    Logger.error(agentId, `JavaScript execution failed`, { 
      logType: 'tool-error', 
      content: { error: error instanceof Error ? error.message : String(error), success: false }
    });
    return false;
  }
}
