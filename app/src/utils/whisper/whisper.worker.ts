import { pipeline, env, PipelineType } from '@huggingface/transformers';
import { ModelSize, LanguageType } from './types';

env.allowLocalModels = false;

const TASK: PipelineType = 'automatic-speech-recognition';

class WhisperPipelineFactory {
  static task: PipelineType = TASK;
  static model: string | null = null;
  static language: LanguageType | null = null;
  static quantized: boolean = true;
  static instance: any = null;

  static configure(modelSize: ModelSize, language: LanguageType, quantized: boolean) {
    const modelId = language === 'en' 
      ? `Xenova/whisper-${modelSize}.en`
      : `Xenova/whisper-${modelSize}`;

    this.model = modelId;
    this.language = language;
    this.quantized = quantized;
    this.instance = null;
  }

  static async getInstance(progress_callback?: (data: any) => void) {
    if (this.instance === null && this.model) {
      try {
        this.instance = await pipeline(this.task, this.model, {
          progress_callback,
          device: 'wasm',
          dtype: this.quantized ? 'q8' : undefined
        });
        return this.instance;
      } catch (error) {
        this.instance = null;
        throw error;
      }
    }
    return this.instance;
  }

  static reset() {
    this.instance = null;
    this.model = null;
    this.language = null;
  }
}

self.onmessage = async (event) => {
  const { type, data } = event.data;

  try {
    switch (type) {
      case 'configure':
        const { modelSize, language, quantized } = data;
        WhisperPipelineFactory.configure(modelSize, language, quantized);
        
        await WhisperPipelineFactory.getInstance((progress) => {
          self.postMessage({
            type: 'progress',
            data: progress
          });
        });

        self.postMessage({ type: 'ready' });
        break;

      case 'transcribe':
        const { audio, chunkId } = data;
        
        const instance = await WhisperPipelineFactory.getInstance();
        if (!instance) {
          throw new Error('Pipeline not initialized');
        }

        const output = await instance(audio);
        const newText = (output.text as string).trim();

        if (newText) {
          self.postMessage({
            type: 'transcription-complete',
            data: {
              text: newText,
              chunkId
            }
          });
        } else {
          self.postMessage({
            type: 'error',
            data: {
              message: 'No text transcribed',
              chunkId
            }
          });
        }
        break;

      default:
        throw new Error(`Unknown message type: ${type}`);
    }
  } catch (error) {
    self.postMessage({
      type: 'error',
      data: {
        message: `Error: ${error}`,
        chunkId: data?.chunkId
      }
    });
  }
};