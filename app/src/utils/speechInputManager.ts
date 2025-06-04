// src/utils/SpeechInputManager.ts
import { Logger } from './logging';

const BrowserSpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

let recognizer: SpeechRecognition | null = null;
let isRecognizerActive = false;

// This will store the fully finalized transcript parts
let finalizedTranscript = "";
// This will store the current, potentially updating, interim part of an utterance
let currentUtteranceInterim = "";

let explicitlyStopped = false;

export async function ensureRecognitionStarted(agentId: string): Promise<void> {
    if (!BrowserSpeechRecognition) {
        const msg = "Speech Recognition API not supported.";
        Logger.error(agentId, `SpeechInputManager: ${msg}`);
        throw new Error(`[${msg}]`);
    }

    if (isRecognizerActive && recognizer) {
        Logger.debug(agentId, "SpeechInputManager: Recognition already active.");
        return;
    }

    explicitlyStopped = false;
    // Do NOT reset finalizedTranscript here. Reset current interim part.
    currentUtteranceInterim = "";

    if (!recognizer) {
        Logger.info(agentId, "SpeechInputManager: Initializing new recognizer instance.");
        try {
            recognizer = new BrowserSpeechRecognition();
        } catch (e: any) { // Keeping 'any' here for simplicity if specific error types from constructor are unknown/varied
            recognizer = null;
            isRecognizerActive = false;
            Logger.error(agentId, `SpeechInputManager: CRITICAL - Failed to instantiate: ${e instanceof Error ? e.message : String(e)}`, e);
            throw new Error(`[SpeechInputManager: CRITICAL - Failed to instantiate: ${e instanceof Error ? e.message : String(e)}]`);
        }
    }

    if (!recognizer) {
        const msg = "SpeechInputManager: Critical logic error - recognizer is null after instantiation attempt.";
        Logger.error(agentId, msg);
        throw new Error(`[${msg}]`);
    }

    Logger.debug(agentId, "SpeechInputManager: Configuring and starting/restarting instance.");
    recognizer.continuous = true;
    recognizer.interimResults = true; // <<< KEY CHANGE: Enable interim results
    recognizer.lang = 'en-US';

    recognizer.onresult = (event: SpeechRecognitionEvent) => {
        let latestInterimForThisEvent = ""; // Holds the latest interim from *this specific event*

        for (let i = event.resultIndex; i < event.results.length; ++i) {
            const transcriptPart = event.results[i][0].transcript;
            if (event.results[i].isFinal) {
                const trimmedFinal = transcriptPart.trim();
                if (trimmedFinal) {
                    finalizedTranscript += (finalizedTranscript ? " " : "") + trimmedFinal; // Append with a space if not empty
                    Logger.debug(agentId, `SpeechInputManager: Received final part: "${trimmedFinal}"`);
                }
                currentUtteranceInterim = ""; // Current utterance is now final, clear interim
            } else {
                latestInterimForThisEvent += transcriptPart; // Accumulate all interim parts in this event
            }
        }

        // Update currentUtteranceInterim only if there was new interim content in this event
        if (latestInterimForThisEvent.trim()) {
            currentUtteranceInterim = latestInterimForThisEvent.trim();
            // Logger.debug(agentId, `SpeechInputManager: Updated interim: "${currentUtteranceInterim}"`); // Can be noisy
        }
    };

    recognizer.onerror = (event: SpeechRecognitionErrorEvent) => {
        isRecognizerActive = false;
        Logger.error(agentId, `SpeechInputManager: Error: ${event.error}`, event.message);
        if (['not-allowed', 'service-not-allowed'].includes(event.error)) {
            Logger.warn(agentId, "SpeechInputManager: Unrecoverable error. Nullifying recognizer.");
            if (recognizer) { try { recognizer.abort(); } catch (e) { /* ignore */ } }
            recognizer = null;
            explicitlyStopped = true;
        }
        // Do not clear currentUtteranceInterim here; onend might attempt to finalize it.
    };

    recognizer.onend = () => {
        const previouslyActive = isRecognizerActive;
        isRecognizerActive = false;
        Logger.info(agentId, `SpeechInputManager: Recognition ended. Was active: ${previouslyActive}. Explicitly: ${explicitlyStopped}.`);

        // If recognition ended unexpectedly and there's a lingering interim part,
        // consider it final. This handles cases like silent timeouts.
        if (currentUtteranceInterim.trim() && !explicitlyStopped) {
            Logger.debug(agentId, `SpeechInputManager: Finalizing lingering interim on unexpected end: "${currentUtteranceInterim}"`);
            finalizedTranscript += (finalizedTranscript ? " " : "") + currentUtteranceInterim.trim();
            currentUtteranceInterim = "";
        }

        if (previouslyActive && !explicitlyStopped && recognizer) {
            Logger.info(agentId, "SpeechInputManager: Attempting to restart recognition.");
            try {
                recognizer.start();
                isRecognizerActive = true;
                Logger.info(agentId, "SpeechInputManager: Restarted successfully.");
            } catch (e: any) { // Keeping 'any' for simplicity
                Logger.error(agentId, `SpeechInputManager: Failed to restart after onend: ${e instanceof Error ? e.message : String(e)}`, e);
            }
        }
    };

    try {
        recognizer.start();
        isRecognizerActive = true;
        Logger.info(agentId, "SpeechInputManager: Started successfully.");
    } catch (e: any) { // Keeping 'any' for simplicity
        isRecognizerActive = false;
        const errorMessage = e instanceof Error ? e.message : String(e);
        Logger.error(agentId, `SpeechInputManager: Failed to start: ${errorMessage}`, e);
        if (e instanceof Error && e.name === 'InvalidStateError' && recognizer) {
            Logger.warn(agentId, "SpeechInputManager: Start failed with InvalidStateError, assuming already active.");
            isRecognizerActive = true;
        } else {
            if (recognizer) { try { recognizer.abort(); } catch (abortErr) { /* ignore */ } }
            recognizer = null;
            throw new Error(`[SpeechInputManager: Failed to start: ${errorMessage}]`);
        }
    }
}

export function stopRecognitionAndClear(agentId: string): void {
    explicitlyStopped = true;
    if (recognizer) {
        Logger.info(agentId, "SpeechInputManager: Explicitly stopping recognition.");
        // Before stopping, if there's a lingering interim transcript, finalize it.
        if (currentUtteranceInterim.trim()) {
            Logger.debug(agentId, `SpeechInputManager: Finalizing lingering interim on stop: "${currentUtteranceInterim}"`);
            finalizedTranscript += (finalizedTranscript ? " " : "") + currentUtteranceInterim.trim();
        }

        recognizer.onend = null; // Prevent auto-restart
        if (isRecognizerActive || (recognizer as any).readyState === 1) { // readyState 1 is 'listening'
            try {
                recognizer.stop();
            } catch (e) { // FIXED: Type check for error
                const stopErrorMessage = e instanceof Error ? e.message : String(e);
                Logger.warn(agentId, `Error during recognizer.stop(): ${stopErrorMessage}`);
            }
        }
        recognizer = null;
    }
    isRecognizerActive = false;
    finalizedTranscript = "";       // CLEAR THE FINALIZED TRANSCRIPT
    currentUtteranceInterim = "";   // CLEAR THE INTERIM TRANSCRIPT
    Logger.info(agentId, "SpeechInputManager: Recognition stopped and transcript cleared.");
}

/**
 * The "get function" for $MICROPHONE.
 * Returns the combination of finalized speech and the current interim utterance.
 */
export function getCurrentTranscript(agentId: string): string { // FIXED: agentId is now used
    let combined = finalizedTranscript;
    if (currentUtteranceInterim.trim()) {
        combined += (combined ? " " : "") + currentUtteranceInterim.trim();
    }
    // Using agentId for logging, uncomment if needed for detailed debugging
    Logger.debug(agentId, `SpeechInputManager: Returning current transcript (length: ${combined.trim().length}): "${combined.trim().substring(0,100)}${combined.trim().length > 100 ? '...' : ''}"`);
    return combined.trim();
}
