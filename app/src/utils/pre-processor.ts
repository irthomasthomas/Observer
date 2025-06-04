// src/utils/pre-processor.ts

import { Logger } from './logging'; // CORRECTED PATH
import { getAgentMemory } from './agent_database'; // CORRECTED PATH
import { captureFrameAndOCR, startScreenCapture, captureScreenImage } from './screenCapture'; // CORRECTED PATH

import {
    ensureRecognitionStarted,
    getCurrentTranscript,
} from './speechInputManager'; // CORRECTED PATH

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
        const stream = await startScreenCapture();
        if (!stream) throw new Error('Failed to start screen capture');
        const ocrResult = await captureFrameAndOCR();
        if (ocrResult.success && ocrResult.text) {
          Logger.debug(agentId, `OCR successful, text injected into prompt`);
          return { replacementText: ocrResult.text };
        }
        Logger.error(agentId, `OCR failed: ${ocrResult.error || 'Unknown error'}`);
        return { replacementText: '[Error performing OCR]' };
      } catch (error) {
        Logger.error(agentId, `Error with screen capture for OCR: ${error instanceof Error ? error.message : String(error)}`);
        return { replacementText: '[Error with screen capture]' };
      }
    }
  },
  
  // Memory processor
  'MEMORY': {
    regex: /\$MEMORY@([a-zA-Z0-9_]+)/g,
    handler: async (_agentId: string, _prompt: string, match: RegExpExecArray) => {
      try {
        const referencedAgentId = match[1];
        const memory = await getAgentMemory(referencedAgentId);
        return { replacementText: memory };
      } catch (error) {
        Logger.error(_agentId, `Error with memory retrieval: ${error instanceof Error ? error.message : String(error)}`);
        return { replacementText: `[Error with memory retrieval]` };
      }
    }
  },

  'SCREEN_64': {
    regex: /\$SCREEN_64/g,
    handler: async (agentId: string) => {
      try {
        Logger.debug(agentId, `Capturing screen for image processing`);
        const stream = await startScreenCapture();
        if (!stream) throw new Error('Failed to start screen capture');
        const base64Image = await captureScreenImage();
        if (base64Image) {
          // Basic check for data URI prefix, then the base64 part
          const parts = base64Image.split(',');
          const b64data = parts.length > 1 ? parts[1] : parts[0];
          if (!/^[A-Za-z0-9+/=]+$/.test(b64data) || b64data.length % 4 !== 0) { // Added length % 4 check
            Logger.error(agentId, `Invalid base64 image data`);
            return { replacementText: '[Error: Invalid image data]' };
          }
          Logger.debug(agentId, `Base64 image captured (length: ${base64Image.length})`);
          return { replacementText: '', images: [base64Image] };
        }
        Logger.error(agentId, `Screen capture for image failed`);
        return { replacementText: '[Error capturing screen]' };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        Logger.error(agentId, `Error capturing screen: ${errorMessage}`);
        return { replacementText: '[Error with screen capture]' };
      }
    }
  },

  'CLIPBOARD_TEXT': {
    regex: /\$CLIPBOARD_TEXT/g,
    handler: async (agentId: string) => {
      try {
        if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.readText === 'function') {
          const clipboardText = await navigator.clipboard.readText();
          Logger.debug(agentId, `Retrieved clipboard text: "${clipboardText}"`);
          return { replacementText: clipboardText };
        }
        Logger.warn(agentId, `navigator.clipboard.readText is not available for CLIPBOARD_TEXT.`);
        return { replacementText: '[Error: Clipboard API not available or permission denied]' };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        Logger.error(agentId, `Error retrieving clipboard text: ${errorMessage}`);
        if (errorMessage.includes('NotAllowedError') || errorMessage.includes('Must be handling a user gesture') || errorMessage.includes('Read permission denied')) {
            return { replacementText: '[Error: Clipboard access denied or requires user interaction]' };
        }
        return { replacementText: `[Error retrieving clipboard text: ${errorMessage}]` };
      }
    }
  },

  '$MICROPHONE': {
    regex: /\$MICROPHONE/g,
    handler: async (agentId: string) => { // handler is async, but getCurrentTranscript is sync
      try {
        // ensureRecognitionStarted would have been called in preProcess before this handler
        const speechText = getCurrentTranscript(agentId); // Simple synchronous call
        Logger.debug(agentId, `Retrieved current transcript for $MICROPHONE: "${speechText}"`);
        return { replacementText: speechText };
      } catch (error: any) {
        Logger.error(agentId, `Error in $MICROPHONE handler: ${error.message}`);
        return { replacementText: `[Error processing speech: ${error.message}]` };
      }
    }
  },

};

export async function preProcess(agentId: string, systemPrompt: string): Promise<PreProcessorResult> {
  let modifiedPrompt = systemPrompt;
  const result: PreProcessorResult = {
    modifiedPrompt,
    images: []
  };
  
  try {
    Logger.debug(agentId, 'Starting prompt pre-processing');

    if (/\$MICROPHONE/.test(systemPrompt)) {
        Logger.debug(agentId, '$MICROPHONE placeholder detected, ensuring recognition is started.');
        try {
            await ensureRecognitionStarted(agentId);
        } catch (speechError: any) {
            Logger.error(agentId, `Failed to ensure speech recognition active in preProcess: ${speechError.message}`);
            modifiedPrompt = modifiedPrompt.replace(/\$MICROPHONE/g, `[Speech input unavailable: ${speechError.message}]`);
        }
    }

    for (const [key, processor] of Object.entries(processors)) {
      if (key === '$MICROPHONE' && modifiedPrompt.includes('[Speech input unavailable:')) {
          continue;
      }

      processor.regex.lastIndex = 0; 
      let match;
      
      // Need to re-construct the string in a way that doesn't invalidate ongoing regex exec
      let currentSearchIndex = 0;
      let tempPrompt = "";

      while ((match = processor.regex.exec(modifiedPrompt)) !== null) {
        const placeholder = match[0];
        const matchIndex = match.index;

        // Append the part of the string before the current match
        tempPrompt += modifiedPrompt.substring(currentSearchIndex, matchIndex);
        
        Logger.debug(agentId, `Processing placeholder: ${placeholder} (at index ${matchIndex} using ${key})`);
        const processorResult = await processor.handler(agentId, modifiedPrompt, match);
        
        let replacement = placeholder; // Default to keeping the placeholder if no replacementText
        if (processorResult.replacementText !== undefined) {
          replacement = processorResult.replacementText;
        }
        tempPrompt += replacement;

        currentSearchIndex = matchIndex + placeholder.length;
        processor.regex.lastIndex = currentSearchIndex; // Ensure regex continues after this placeholder

        if (processorResult.images && processorResult.images.length > 0) {
          result.images = [...(result.images || []), ...processorResult.images];
        }
        
        // Safety break for empty placeholder matches to prevent infinite loops
        // if somehow regex.lastIndex isn't advanced by the above.
        if (matchIndex === processor.regex.lastIndex && placeholder.length === 0) {
            processor.regex.lastIndex++;
        }
        if (processor.regex.lastIndex > modifiedPrompt.length) { // Boundary check
            break;
        }

      }
      // Append any remaining part of the string
      tempPrompt += modifiedPrompt.substring(currentSearchIndex);
      modifiedPrompt = tempPrompt;
    }
    result.modifiedPrompt = modifiedPrompt;
    Logger.debug(agentId, 'Completed prompt pre-processing. Final prompt:', result.modifiedPrompt);
    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    Logger.error(agentId, `Error in pre-processing: ${errorMessage}`);
    return { modifiedPrompt: systemPrompt, images: [] };
  }
}
