// src/utils/handlers/javascript.ts
import * as utils from './utils';
import { Logger } from '../logging';
// Import the agent loop control functions
import { startAgentLoop, stopAgentLoop } from '../main_loop';

/**
 * Execute JavaScript handler for processing agent responses
 */
export async function executeJavaScript(
  response: string,
  agentId: string,
  code: string
): Promise<boolean> {
  try {
    // We'll use a sandboxed approach with a context object
    const context = {
      response,
      agentId,
      // Define utility functions with full flexibility - allow accessing any agent's memory
      getMemory: async (targetId = agentId) => await utils.getMemory(targetId),
      setMemory: async (targetId: string, value?: any) => {
        // If only one parameter is provided, assume it's the value for current agent
        if (value === undefined) {
          return await utils.setMemory(agentId, targetId);
        }
        // Otherwise set memory for specified agent
        return await utils.setMemory(targetId, value);
      },
      appendMemory: async (targetId: string, content?: string, separator = '\n') => {
        // If only one parameter is provided, assume it's content for current agent
        if (content === undefined) {
          return await utils.appendMemory(agentId, targetId, separator);
        }
        // Otherwise append to specified agent's memory
        return await utils.appendMemory(targetId, content, separator);
      },
      notify: utils.notify,
      time: utils.time,
      console: console,

      startAgent: async (targetAgentId?: string) => { // targetAgentId is optional
        const idToStart = targetAgentId === undefined ? agentId : targetAgentId;
        await startAgentLoop(idToStart); 
      },

      stopAgent: async (targetAgentId?: string) => { 
        const idToStop = targetAgentId === undefined ? agentId : targetAgentId; 
        await stopAgentLoop(idToStop); 
      },

      sendSms: async (message: string, number: string) => {
        Logger.debug(agentId, `Agent is attempting to send an SMS to ${number}.`);
        try {
          // Call the core utility function
          await utils.sendSms(message, number);
          Logger.info(agentId, `Successfully sent SMS request for number: ${number}.`);
        } catch (error: any) {
          // Log the specific error for your own debugging
          Logger.error(agentId, `Failed to send SMS: ${error.message}`);
          // And critically, re-throw the error so the user's script can catch it
          throw error;
        }
      },

      sendWhatsapp: async(message: string, number: string) => {
        Logger.info(agentId, `Agent is attempting to send a Whatsapp to ${number}.`);
        try{
          await utils.sendWhatsapp(message, number);
          Logger.info(agentId, `Successfully send Whatsapp request for number: ${number}.`);
        } catch (error: any){
          Logger.error(agentId, `Failed to send Whatsapp: ${error.message}`);
          throw error;
        }
      },

      sendEmail: async (message: string, emailAddress: string) => {
        Logger.info(agentId, `Agent is attempting to send an email to ${emailAddress}.`);
        try {
          // Now calls the corrected utility function with the right argument order
          await utils.sendEmail(message, emailAddress);
          Logger.info(agentId, `Successfully sent email request for address: ${emailAddress}.`);
        } catch (error: any) {
          Logger.error(agentId, `Failed to send email: ${error.message}`);
          throw error;
        }
      },

      startClip: utils.startClip,
      stopClip: utils.stopClip,
      markClip: utils.markClip,

    };

    // Create a wrapper function that sets up the context
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

    // Use Function constructor with context binding
    const handler = new Function(...Object.keys(context), wrappedCode);

    // Execute with bound context values
    return await handler(...Object.values(context));
  } catch (error) {
    Logger.error(agentId, `Error executing JavaScript: ${error}`);
    return false;
  }
}
