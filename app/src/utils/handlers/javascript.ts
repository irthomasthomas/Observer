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
      },

      sendWhatsapp: async(message: string, number: string) => {
        Logger.info(agentId, `Agent is attempting to send a Whatsapp to ${number}.`);
        if (!getToken) throw new Error("Authentication context not available for sendWhatsapp.");

        const token = await getToken();
        if (!token) throw new Error("Failed to retrieve authentication token for WhatsApp.");

        await utils.sendWhatsapp(message, number, token);
        Logger.info(agentId, `Successfully sent Whatsapp request for number: ${number}.`);
      },

      sendEmail: async (message: string, emailAddress: string) => {
        Logger.info(agentId, `Agent is attempting to send an email to ${emailAddress}.`);
        if (!getToken) throw new Error("Authentication context not available for sendEmail.");
        
        const token = await getToken();
        if (!token) throw new Error("Failed to retrieve authentication token for Email.");

        await utils.sendEmail(message, emailAddress, token);
        Logger.info(agentId, `Successfully sent email request for address: ${emailAddress}.`);
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
      },

      sendGotify: async (message: string, serverUrl: string, appToken: string, title?: string, priority?: number) => {
        Logger.info(agentId, `Agent is attempting to send a Gotify notification.`);
        
        await utils.sendGotify(message, serverUrl, appToken, title, priority);
        
        Logger.info(agentId, `Successfully sent Gotify notification request.`);
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
        return response;
      },

      message: async (message: string, title = 'Agent Message'): Promise<void> => {
        const appUrl = "http://localhost:3838";

        if (!appUrl) throw new Error("Could not determine the local app server address.");

        Logger.info(agentId, `Agent is showing user a message: "${message}"`);
        await utils.message(appUrl, title, message);
        Logger.info(agentId, `User acknowledged message.`);
      },

      system_notify: async (body: string, title = 'Observer AI'): Promise<void> => {
        const appUrl = "http://localhost:3838";

        if (!appUrl) throw new Error("Could not determine the local app server address.");

        Logger.info(agentId, `Agent is sending a system notification: "${body}"`);
        await utils.system_notify(appUrl, title, body);
        Logger.info(agentId, `System notification sent.`);
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
    return false;
  }
}
