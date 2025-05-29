// src/utils/processors/pre-processor.ts

import { Logger } from './logging';
import { getAgentMemory } from './agent_database';
import { captureFrameAndOCR, startScreenCapture, captureScreenImage } from './screenCapture';
import {
    ensureContinuousRecognitionActive,
    C_harvestSpeechSinceLastLoop,
    C_getHistoricalLoopSpeech,
    C_getFullTranscript
} from './speechInputManager';

// Define the result structure
export interface PreProcessorResult {
  modifiedPrompt: string;  // The text prompt with placeholders removed
  images?: string[];       // Base64 encoded images for the API
}

// Map of processor functions
type ProcessorFunction = (agentId: string, prompt: string, match: RegExpExecArray) => Promise<{
  replacementText?: string;
  images?: string[];
}>;

// Simple map of placeholder patterns to handler functions
const processors: Record<string, { regex: RegExp, handler: ProcessorFunction }> = {
  // Screen OCR processor
  'SCREEN_OCR': {
    regex: /\$SCREEN_OCR/g,
    handler: async (agentId: string) => {
      try {
        Logger.debug(agentId, `Initializing screen capture for OCR`);
        
        // Ensure screen capture is initialized
        const stream = await startScreenCapture();
        if (!stream) {
          throw new Error('Failed to start screen capture');
        }
        
        // Capture screen and perform OCR
        const ocrResult = await captureFrameAndOCR();
        
        if (ocrResult.success && ocrResult.text) {
          Logger.debug(agentId, `OCR successful, text injected into prompt`);
          
          return { replacementText: ocrResult.text };
        } else {
          Logger.error(agentId, `OCR failed: ${ocrResult.error || 'Unknown error'}`);
          return { replacementText: '[Error performing OCR]' };
        }
      } catch (error) {
        return { replacementText: '[Error with screen capture]' };
      }
    }
  },
  
  // Memory processor
  'MEMORY': {
    regex: /\$MEMORY@([a-zA-Z0-9_]+)/g,
    handler: async (_agentId: string, _prompt: string, match: RegExpExecArray) => {
      try {
        // Implementation of memory processor...
        const referencedAgentId = match[1];
        const memory = await getAgentMemory(referencedAgentId);
        
        return { replacementText: memory };
      } catch (error) {
        return { replacementText: `[Error with memory retrieval]` };
      }
    }
  },

  'SCREEN_64': {
    regex: /\$SCREEN_64/g,
    handler: async (agentId: string) => {
      try {
        Logger.debug(agentId, `Capturing screen for image processing`);
        
        // Ensure screen capture is initialized
        const stream = await startScreenCapture();
        if (!stream) {
          throw new Error('Failed to start screen capture');
        }
        
        // Capture screen as image
        const base64Image = await captureScreenImage();

        // Validate the base64 image before using it
        if (base64Image) {
          // Simple validation to check if it's a valid base64 string
          if (!/^[A-Za-z0-9+/=]+$/.test(base64Image)) {
            Logger.error(agentId, `Invalid base64 image data`);
            return { replacementText: '[Error: Invalid image data]' };
          }
          
          // Log first few characters to debug
          Logger.debug(agentId, `Base64 image starts with: ${base64Image.substring(0, 20)}...`);
          
          // Proceed with using the image
          return { 
            replacementText: '', 
            images: [base64Image]
          };
        } else {
          Logger.error(agentId, `Screen capture failed`);
          return { replacementText: '[Error capturing screen]' };
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        Logger.error(agentId, `Error capturing screen: ${errorMessage}`);
        return { replacementText: '[Error with screen capture]' };
      }
    }
  },

  // NEW: Clipboard Text processor
  'CLIPBOARD_TEXT': {
    regex: /\$CLIPBOARD_TEXT/g,
    handler: async (agentId: string) => {
      try {
        if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.readText === 'function') {
          // Clipboard API requires user permission, which is usually granted
          // if the page is focused or the call is triggered by a user gesture.
          // It also requires a secure context (HTTPS).
          const clipboardText = await navigator.clipboard.readText();
          Logger.debug(agentId, `Retrieved clipboard text: "${clipboardText}"`);
          return { replacementText: clipboardText };
        } else {
          Logger.warn(agentId, `navigator.clipboard.readText is not available for CLIPBOARD_TEXT.`);
          return { replacementText: '[Error: Clipboard API not available or permission denied]' };
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        Logger.error(agentId, `Error retrieving clipboard text: ${errorMessage}`);
        // Specific check for NotAllowedError which often means permission denied or document not focused
        if (errorMessage.includes('NotAllowedError') || errorMessage.includes('Must be handling a user gesture')) {
            return { replacementText: '[Error: Clipboard access denied or requires user interaction]' };
        }
        return { replacementText: `[Error retrieving clipboard text: ${errorMessage}]` };
      }
    }
  },

    '$SPEECH_SINCE_LAST_LOOP': {
    regex: /\$SPEECH_SINCE_LAST_LOOP/g,
    handler: async (agentId: string) => {
      try {
        await ensureContinuousRecognitionActive(agentId);
        const text = C_harvestSpeechSinceLastLoop(agentId);
        return { replacementText: text };
      } catch (error: any) {
        Logger.error(agentId, `Error in $SPEECH_SINCE_LAST_LOOP: ${error.message}`);
        return { replacementText: `[Error: ${error.message}]` };
      }
    }
  },

  '$MICROPHONE_LOOP_N': { // Placeholder for $MICROPHONE_LOOP_1, $MICROPHONE_LOOP_2 etc.
    regex: /\$MICROPHONE_LOOP_(\d+)/g, // Captures the number N
    handler: async (agentId: string, _prompt: string, match: RegExpExecArray) => {
      try {
        const loopNumber = parseInt(match[1], 10);
        if (isNaN(loopNumber) || loopNumber <= 0) {
          return { replacementText: "[Invalid loop number for $MICROPHONE_LOOP_N]" };
        }
        await ensureContinuousRecognitionActive(agentId);
        const text = C_getHistoricalLoopSpeech(agentId, loopNumber);
        return { replacementText: text };
      } catch (error: any) {
        Logger.error(agentId, `Error in $MICROPHONE_LOOP_N: ${error.message}`);
        return { replacementText: `[Error: ${error.message}]` };
      }
    }
  },

  '$MICROPHONE_ALL': {
    regex: /\$MICROPHONE_ALL/g,
    handler: async (agentId: string) => {
      try {
        await ensureContinuousRecognitionActive(agentId);
        const text = C_getFullTranscript(agentId);
        return { replacementText: text };
      } catch (error: any) {
        Logger.error(agentId, `Error in $MICROPHONE_ALL: ${error.message}`);
        return { replacementText: `[Error: ${error.message}]` };
      }
    }
  },


};

/**
 * Main pre-processing function that applies all prompt modifications
 * @param agentId ID of the agent
 * @param systemPrompt Original system prompt
 * @returns Modified system prompt with any additional data
 */
export async function preProcess(agentId: string, systemPrompt: string): Promise<PreProcessorResult> {
  let modifiedPrompt = systemPrompt;
  const result: PreProcessorResult = {
    modifiedPrompt,
    images: []
  };
  
  try {
    Logger.debug(agentId, 'Starting prompt pre-processing');
    
    // Process each type of placeholder
    for (const [_, processor] of Object.entries(processors)) {
      // Reset regex to start from beginning
      processor.regex.lastIndex = 0;
      
      // Find all matches for this processor
      let match;
      while ((match = processor.regex.exec(modifiedPrompt)) !== null) {
        const placeholder = match[0];
        const processorResult = await processor.handler(agentId, modifiedPrompt, match);
        
        // Replace text if provided
        if (processorResult.replacementText !== undefined) {
          modifiedPrompt = modifiedPrompt.replace(placeholder, processorResult.replacementText);
          // Reset regex since we modified the string
          processor.regex.lastIndex = 0;
        }
        
        // Collect images if provided
        if (processorResult.images && processorResult.images.length > 0) {
          result.images = [...(result.images || []), ...processorResult.images];
        }
        Logger.debug(agentId, `Finished Pre-Processing with prompt:`, result);
      }
    }
    
    result.modifiedPrompt = modifiedPrompt;
    Logger.debug(agentId, 'Completed prompt pre-processing');
    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    Logger.error(agentId, `Error in pre-processing: ${errorMessage}`);
    return { modifiedPrompt: systemPrompt };
  }
}
