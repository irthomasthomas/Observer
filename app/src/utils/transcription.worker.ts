// src/utils/transcription.worker.ts

import { pipeline, env, PipelineType } from '@huggingface/transformers';

env.allowLocalModels = false;

const TASK: PipelineType = 'automatic-speech-recognition';
const MODEL = 'Xenova/whisper-tiny';

class PipelineSingleton {
    private static instance: any = null;

    static async getInstance() {
        if (this.instance === null) {
            // Important: Pass a progress callback to the main thread
            // so the UI can show that the model is loading.
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
    // The data is now the raw audio Float32Array
    const rawAudio = event.data as Float32Array;

    try {
        const transcriber = await PipelineSingleton.getInstance();

        // No more decoding needed! Just run the pipeline.
        const output = await transcriber(rawAudio);
        const newText = (output.text as string).trim();

        if (newText) {
            self.postMessage({
                status: 'transcription-complete',
                text: newText,
            });
        }
    } catch (error) {
        self.postMessage({
            status: 'error',
            message: `Error during transcription: ${error}`,
        });
    }
};
