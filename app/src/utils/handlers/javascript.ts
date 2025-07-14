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
      
      startClip: utils.startClip,
      stopClip: utils.stopClip,
      markClip: utils.markClip,
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
