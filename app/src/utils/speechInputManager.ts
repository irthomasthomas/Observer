// src/utils/SpeechInputManager.ts
import { Logger } from './logging';

const BrowserSpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

let continuousRecognizer: SpeechRecognition | null = null;
let isRecognizerActive = false; // Tracks if recognizer.start() was successful and not errored/ended
let activeAgentRefCount = 0; // How many agents are currently needing continuous mic

// Buffers
let currentLoopTranscriptParts: string[] = []; // Accumulates speech since last main harvest
let historicalLoopTranscripts: string[] = []; // Stores full text of previous loops
let fullTranscriptSinceStart: string = "";   // Concatenation of all speech since recognizer started

const MAX_HISTORICAL_LOOPS = 10; // How many past loops of speech to store

/**
 * Starts or ensures the continuous speech recognition is active.
 * Manages a single shared SpeechRecognition instance.
 */
export async function ensureContinuousRecognitionActive(agentId: string): Promise<void> {
    if (!BrowserSpeechRecognition) {
        const msg = "Speech Recognition API not supported in this browser.";
        Logger.error(agentId, `SpeechInputManager: ${msg}`);
        throw new Error(`[${msg}]`);
    }

    activeAgentRefCount++;
    Logger.debug(agentId, `SpeechInputManager: Ref count increased to ${activeAgentRefCount}.`);

    // If already active and an instance exists, nothing more to do.
    if (continuousRecognizer && isRecognizerActive) {
        Logger.debug(agentId, "SpeechInputManager: Continuous recognition already active and instance exists.");
        return;
    }

    // Create a new instance if one doesn't exist or if it critically errored (was nulled)
    if (!continuousRecognizer) {
        Logger.info(agentId, "SpeechInputManager: Initializing new continuous recognition instance.");
        currentLoopTranscriptParts = [];
        // Resetting historical and full transcript only when truly starting from null.
        // This means if an error just made isRecognizerActive=false but continuousRecognizer instance
        // was kept, these buffers would persist through a restart attempt.
        historicalLoopTranscripts = [];
        fullTranscriptSinceStart = "";

        try {
            continuousRecognizer = new BrowserSpeechRecognition();
        } catch (e: any) {
            isRecognizerActive = false; // Should already be false
            activeAgentRefCount--; // Decrement as instantiation failed
            Logger.error(agentId, `SpeechInputManager: CRITICAL - Failed to instantiate BrowserSpeechRecognition: ${e.message}`, e);
            throw new Error(`[SpeechInputManager: CRITICAL - Failed to instantiate BrowserSpeechRecognition: ${e.message}]`);
        }
    }

    // At this point, continuousRecognizer *must* be an instance if we didn't throw above.
    // The following block handles starting it if it's not currently active.
    if (!isRecognizerActive) {
        // This assertion tells TypeScript we're sure continuousRecognizer is not null here,
        // because if it was null, the block above would have created it or thrown an error.
        // This is one way to handle TS18047 if control flow isn't obvious enough for TSC.
        // However, ideally the flow is structured so TS infers it. Let's try without '!' first.

        // If continuousRecognizer is somehow still null here, it's a logic flaw.
        if (!continuousRecognizer) {
            const msg = "SpeechInputManager: Critical logic error - recognizer is null when expected.";
            Logger.error(agentId, msg);
            activeAgentRefCount--; // Clean up ref count
            throw new Error(`[${msg}]`);
        }

        // Use a local const for the instance we are configuring/starting.
        // This can sometimes help TypeScript with flow analysis within this block.
        const recognizerToStart = continuousRecognizer;

        Logger.debug(agentId, "SpeechInputManager: Configuring and attempting to start recognizer instance.");

        recognizerToStart.continuous = true;
        recognizerToStart.interimResults = false;
        recognizerToStart.lang = 'en-US'; // Consider making this configurable

        recognizerToStart.onresult = (event: SpeechRecognitionEvent) => {
            let newFinalTranscript = "";
            for (let i = event.resultIndex; i < event.results.length; ++i) {
                if (event.results[i].isFinal) {
                    newFinalTranscript += event.results[i][0].transcript.trim() + " ";
                }
            }

            if (newFinalTranscript.trim()) {
                const segment = newFinalTranscript.trim();
                Logger.debug(agentId, `SpeechInputManager: Received segment: "${segment}"`);
                currentLoopTranscriptParts.push(segment);
                fullTranscriptSinceStart += segment + " ";
            }
        };

        recognizerToStart.onerror = (event: SpeechRecognitionErrorEvent) => {
            isRecognizerActive = false; // Mark as inactive
            Logger.error(agentId, `SpeechInputManager: Error: ${event.error}`, event.message);
            if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
                Logger.warn(agentId, "SpeechInputManager: Permission/service error. Nullifying recognizer to prevent retries.");
                if (continuousRecognizer) { // Check it still exists before calling abort
                    try { continuousRecognizer.abort(); } catch (e) { /* ignore */ }
                }
                continuousRecognizer = null; // Prevent further automatic restarts for this session
            }
            // Other errors (network, no-speech if continuous) might allow restart on next ensure call
        };

        recognizerToStart.onend = () => {
            isRecognizerActive = false; // Mark as inactive
            Logger.info(agentId, "SpeechInputManager: Recognition ended.");
            // If activeAgentRefCount > 0, the next ensureContinuousRecognitionActive call
            // will attempt to restart it if continuousRecognizer instance still exists and is not null.
        };

        try {
            Logger.debug(agentId, "SpeechInputManager: Calling start() on recognizer instance.");
            recognizerToStart.start();
            isRecognizerActive = true; // Set active only after start() call succeeds
            Logger.info(agentId, "SpeechInputManager: Continuous recognition started successfully.");
        } catch (e: any) {
            isRecognizerActive = false; // Ensure it's marked inactive if start fails
            // Don't decrement activeAgentRefCount here, the request to have it active still stands
            // The pre-processor will just get an error/empty for this cycle.
            Logger.error(agentId, `SpeechInputManager: Failed to start recognizer - ${e.message}`, e);
            // Re-throw so the calling function (e.g., pre-processor handler) knows it failed.
            throw new Error(`[SpeechInputManager: Failed to start - ${e.message}]`);
        }
    }
}

/**
 * Decrements the reference count and stops the recognizer if no agents need it.
 */
export function C_stopContinuousMicrophoneInputIfNeeded(agentId: string): void {
    if (activeAgentRefCount > 0) {
        activeAgentRefCount--;
    }
    Logger.debug(agentId, `SpeechInputManager: Ref count decreased to ${activeAgentRefCount}.`);

    if (activeAgentRefCount <= 0) {
        if (continuousRecognizer) {
            Logger.info(agentId, "SpeechInputManager: Stopping continuous recognition as no agents need it.");
            try {
                // isRecognizerActive will be set to false by the onend handler
                if (isRecognizerActive) { // Only call stop if we believe it's active
                   continuousRecognizer.stop();
                }
            } catch(e: any) {
                Logger.warn(agentId, `SpeechInputManager: Error stopping recognizer: ${e.message}`);
                isRecognizerActive = false; // Ensure it's marked as inactive
            }
        }
        // Reset state fully when no one is using it
        continuousRecognizer = null;
        isRecognizerActive = false;
        activeAgentRefCount = 0; // Ensure it's definitely 0
        currentLoopTranscriptParts = [];
        historicalLoopTranscripts = [];
        fullTranscriptSinceStart = "";
        Logger.info(agentId, "SpeechInputManager: Resources fully reset.");
    }
}

/**
 * Harvests speech accumulated since the last call to this function.
 * This also archives the harvested speech for historical access.
 */
export function C_harvestSpeechSinceLastLoop(agentId: string): string {
    // Attempt to ensure active if agents are supposed to be using it but it's not marked active
    if (!isRecognizerActive && activeAgentRefCount > 0) {
        Logger.warn(agentId, "SpeechInputManager: Recognizer inactive during harvest. Attempting to ensure it's active.");
        // This call will attempt to start/restart it.
        // We don't await it here because harvest should be quick.
        // If it fails to restart, subsequent calls will also try or it will remain inactive.
        ensureContinuousRecognitionActive(agentId).catch(err => {
            Logger.error(agentId, `SpeechInputManager: Background attempt to ensure active failed: ${err.message}`);
        });
    }

    if (currentLoopTranscriptParts.length === 0) {
        return "";
    }

    const harvestedText = currentLoopTranscriptParts.join(" ").trim();
    Logger.info(agentId, `SpeechInputManager: Harvested for current loop: "${harvestedText}"`);

    if (harvestedText) {
        historicalLoopTranscripts.unshift(harvestedText);
        if (historicalLoopTranscripts.length > MAX_HISTORICAL_LOOPS) {
            historicalLoopTranscripts.pop();
        }
    }

    currentLoopTranscriptParts = [];
    return harvestedText;
}

/**
 * Gets the speech from N loops ago.
 * N=1 means the most recent fully harvested loop's text.
 */
export function C_getHistoricalLoopSpeech(agentId: string, loopsAgo: number): string {
    if (!isRecognizerActive && activeAgentRefCount > 0) {
        Logger.warn(agentId, "SpeechInputManager: Recognizer inactive during historical fetch. Attempting to ensure active.");
        ensureContinuousRecognitionActive(agentId).catch(err => {
            Logger.error(agentId, `SpeechInputManager: Background attempt to ensure active failed: ${err.message}`);
        });
    }

    if (loopsAgo <= 0 || loopsAgo > historicalLoopTranscripts.length) {
        Logger.warn(agentId, `SpeechInputManager: Invalid historical loop index: ${loopsAgo}. Available: ${historicalLoopTranscripts.length}`);
        return "";
    }
    const text = historicalLoopTranscripts[loopsAgo - 1]; // 1-indexed from user
    Logger.info(agentId, `SpeechInputManager: Retrieved speech from ${loopsAgo} loop(s) ago: "${text || ''}"`);
    return text || "";
}

/**
 * Gets all speech transcribed since the continuous recognizer was first started in this session.
 */
export function C_getFullTranscript(agentId: string): string {
    if (!isRecognizerActive && activeAgentRefCount > 0) {
        Logger.warn(agentId, "SpeechInputManager: Recognizer inactive during full transcript fetch. Attempting to ensure active.");
        ensureContinuousRecognitionActive(agentId).catch(err => {
            Logger.error(agentId, `SpeechInputManager: Background attempt to ensure active failed: ${err.message}`);
        });
    }
    Logger.info(agentId, `SpeechInputManager: Retrieved full transcript (approx): "${fullTranscriptSinceStart.trim()}"`);
    return fullTranscriptSinceStart.trim();
}
