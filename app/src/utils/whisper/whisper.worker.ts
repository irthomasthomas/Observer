import { WhisperModelConfig } from './types';

const TASK = 'automatic-speech-recognition';

class WhisperPipelineFactory {
  static task = TASK;
  static model: string | null = null;
  static config: WhisperModelConfig | null = null;
  static instance: any = null;
  static transformersModule: any = null;

  static configure(config: WhisperModelConfig) {
    this.model = config.modelId;
    this.config = config;
    this.instance = null;
  }

  static async loadTransformers() {
    if (!this.transformersModule) {
      // Dynamic import - only loads when actually needed!
      this.transformersModule = await import('@huggingface/transformers');
      this.transformersModule.env.allowLocalModels = false;
    }
    return this.transformersModule;
  }

  static async getInstance(progress_callback?: (data: any) => void) {
    if (this.instance === null && this.model && this.config) {
      try {
        // Load transformers library dynamically
        const { pipeline } = await this.loadTransformers();

        const pipelineOptions: any = {
          progress_callback,
          device: 'wasm',
          dtype: this.config.quantized ? 'q8' : undefined
        };

        // For medium models, use no_attentions revision to avoid memory issues
        if (this.model.includes('whisper-medium')) {
          pipelineOptions.revision = 'no_attentions';
        }

        this.instance = await pipeline(this.task, this.model, pipelineOptions);
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
    this.config = null;
  }
}

self.onmessage = async (event) => {
  const { type, data } = event.data;

  try {
    switch (type) {
      case 'configure':
        const config = data as WhisperModelConfig;
        WhisperPipelineFactory.configure(config);
        
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
        const currentConfig = WhisperPipelineFactory.config;
        
        if (!instance || !currentConfig) {
          throw new Error('Pipeline not initialized');
        }

        // Build transcription options - only for multilingual models
        const isEnglishOnlyModel = currentConfig.modelId.endsWith('.en');
        const transcribeOptions: any = {};
        
        if (!isEnglishOnlyModel) {
          // Only add parameters for multilingual models
          if (currentConfig.task) {
            transcribeOptions.task = currentConfig.task;
          }
          
          if (currentConfig.language && currentConfig.language !== 'auto') {
            transcribeOptions.language = currentConfig.language;
          }
          
          // Set default chunking for different model types
          const isDistilWhisper = currentConfig.modelId.startsWith('distil-whisper/');
          transcribeOptions.chunk_length_s = isDistilWhisper ? 20 : 30;
          transcribeOptions.stride_length_s = isDistilWhisper ? 3 : 5;
        }

        const output = Object.keys(transcribeOptions).length > 0 
          ? await instance(audio, transcribeOptions)
          : await instance(audio);
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