// src/utils/transcription.worker.ts

import { pipeline, env, PipelineType } from '@huggingface/transformers';

env.allowLocalModels = false;

const TASK: PipelineType = 'automatic-speech-recognition';
const MODEL = 'Xenova/whisper-tiny';

class PipelineSingleton {
    private static instance: any = null;

    static async getInstance() { // Keep progress_callback parameter
        if (this.instance === null) {
            this.instance = await pipeline(TASK, MODEL, { 
                progress_callback: (data: any) => {
                    self.postMessage(data);
                }, dtype: 'q8', device: 'wasm'
            });
        }
        return this.instance;
    }
}

// Listen for messages from the main thread
self.onmessage = async (event) => {
    // MODIFIED: event.data is now an object containing audio and chunkId
    const { audio, chunkId } = event.data as { audio: Float32Array; chunkId: number };

    try {
        const transcriber = await PipelineSingleton.getInstance();

        const output = await transcriber(audio)
        const newText = (output.text as string).trim();

        if (newText) {
            self.postMessage({
                status: 'transcription-complete',
                text: newText,
                chunkId: chunkId, // MODIFIED: Echo back the chunkId
            });
        }
    } catch (error) {
        self.postMessage({
            status: 'error',
            message: `Error during transcription: ${error}`,
            chunkId: chunkId, // MODIFIED: Echo back chunkId even on error (for better debugging)
        });
    }
};
