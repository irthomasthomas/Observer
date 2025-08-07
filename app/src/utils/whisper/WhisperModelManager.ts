import { 
  WhisperModelState, 
  ProgressItem, 
  PendingTranscription,
  WhisperModelConfig
} from './types';
import { SensorSettings } from '../settings';
import { Logger } from '../logging';

export class WhisperModelManager {
  private static instance: WhisperModelManager | null = null;
  private worker: Worker | null = null;
  private state: WhisperModelState = {
    status: 'unloaded',
    config: null,
    progress: [],
    error: null
  };
  private currentConfig: WhisperModelConfig | null = null;
  private stateChangeListeners: Array<(state: WhisperModelState) => void> = [];
  private pendingTranscriptions = new Map<number, PendingTranscription>();

  private constructor() {}

  public static getInstance(): WhisperModelManager {
    if (!WhisperModelManager.instance) {
      WhisperModelManager.instance = new WhisperModelManager();
    }
    return WhisperModelManager.instance;
  }

  public getState(): WhisperModelState {
    return { ...this.state };
  }

  public onStateChange(listener: (state: WhisperModelState) => void): () => void {
    this.stateChangeListeners.push(listener);
    return () => {
      this.stateChangeListeners = this.stateChangeListeners.filter(l => l !== listener);
    };
  }

  private setState(updates: Partial<WhisperModelState>): void {
    this.state = { ...this.state, ...updates };
    this.stateChangeListeners.forEach(listener => listener(this.getState()));
  }

  public async loadModel(): Promise<void> {
    if (this.state.status === 'loading' || this.state.status === 'loaded') {
      Logger.warn('WhisperModelManager', 'Model already loading or loaded');
      return;
    }

    try {
      const settings = SensorSettings.getWhisperSettings();
      const config: WhisperModelConfig = {
        modelId: settings.modelId,
        task: settings.task,
        language: settings.language,
        quantized: settings.quantized
      };

      this.currentConfig = config;

      // Create legacy config object for backward compatibility with state
      const legacyConfig: any = {
        modelSize: this.extractModelSize(config.modelId),
        language: config.language || 'auto',
        quantized: config.quantized,
        modelId: config.modelId
      };

      this.setState({
        status: 'loading',
        config: legacyConfig,
        progress: [],
        error: null
      });

      Logger.info('WhisperModelManager', `Loading model: ${config.modelId} (${config.task || 'default'}, language: ${config.language || 'auto'})`);

      this.worker = new Worker(new URL('./whisper.worker.ts', import.meta.url), {
        type: 'module'
      });

      this.worker.onmessage = this.handleWorkerMessage.bind(this);
      this.worker.onerror = this.handleWorkerError.bind(this);

      this.worker.postMessage({
        type: 'configure',
        data: config
      });

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      Logger.error('WhisperModelManager', `Failed to load model: ${errorMessage}`);
      this.setState({
        status: 'error',
        error: errorMessage
      });
      throw error;
    }
  }

  public unloadModel(): void {
    if (this.state.status === 'unloaded') {
      Logger.warn('WhisperModelManager', 'Model already unloaded');
      return;
    }

    Logger.info('WhisperModelManager', 'Unloading model');

    this.pendingTranscriptions.forEach(({ reject }) => {
      reject(new Error('Model unloaded'));
    });
    this.pendingTranscriptions.clear();

    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }

    this.currentConfig = null;

    this.setState({
      status: 'unloaded',
      config: null,
      progress: [],
      error: null
    });
  }

  public async transcribe(audioBuffer: ArrayBuffer, chunkId: number): Promise<{ text: string }> {
    if (this.state.status !== 'loaded' || !this.worker) {
      throw new Error('Model not loaded. Please load model first.');
    }

    return new Promise((resolve, reject) => {
      this.pendingTranscriptions.set(chunkId, {
        resolve,
        reject,
        timestamp: Date.now()
      });

      const timeout = setTimeout(() => {
        if (this.pendingTranscriptions.has(chunkId)) {
          this.pendingTranscriptions.delete(chunkId);
          reject(new Error(`Transcription timeout for chunk ${chunkId}`));
        }
      }, 80000);

      const audioContext = new AudioContext({ sampleRate: 16000 });
      audioContext.decodeAudioData(audioBuffer.slice(0))
        .then(decodedAudio => {
          const rawAudio = decodedAudio.getChannelData(0);
          
          if (this.worker) {
            this.worker.postMessage({
              type: 'transcribe',
              data: { audio: rawAudio, chunkId }
            }, [rawAudio.buffer]);
          } else {
            clearTimeout(timeout);
            this.pendingTranscriptions.delete(chunkId);
            reject(new Error('Worker not available'));
          }
        })
        .catch(error => {
          clearTimeout(timeout);
          this.pendingTranscriptions.delete(chunkId);
          reject(new Error(`Audio processing error: ${error.message}`));
        });
    });
  }

  private handleWorkerMessage(event: MessageEvent): void {
    const { type, data } = event.data;

    switch (type) {
      case 'progress':
        this.handleProgressMessage(data);
        break;

      case 'ready':
        Logger.info('WhisperModelManager', 'Model loaded successfully');
        this.setState({
          status: 'loaded',
          progress: []
        });
        break;

      case 'transcription-complete':
        this.handleTranscriptionComplete(data);
        break;

      case 'error':
        this.handleWorkerErrorMessage(data);
        break;

      default:
        Logger.warn('WhisperModelManager', `Unknown worker message type: ${type}`);
    }
  }

  private handleProgressMessage(progress: ProgressItem): void {
    this.setState({
      progress: this.updateProgressItems(this.state.progress, progress)
    });
  }

  private updateProgressItems(currentProgress: ProgressItem[], newProgress: ProgressItem): ProgressItem[] {
    const existingIndex = currentProgress.findIndex(item => item.file === newProgress.file);
    
    if (existingIndex !== -1) {
      const updated = [...currentProgress];
      updated[existingIndex] = newProgress;
      return updated;
    } else {
      return [...currentProgress, newProgress];
    }
  }

  private handleTranscriptionComplete(data: { text: string; chunkId: number }): void {
    const { text, chunkId } = data;
    
    if (this.pendingTranscriptions.has(chunkId)) {
      const { resolve } = this.pendingTranscriptions.get(chunkId)!;
      this.pendingTranscriptions.delete(chunkId);
      resolve({ text });
    } else {
      Logger.warn('WhisperModelManager', `Received transcription for unknown chunk: ${chunkId}`);
    }
  }

  private handleWorkerErrorMessage(data: { message: string; chunkId?: number }): void {
    const { message, chunkId } = data;
    
    if (chunkId && this.pendingTranscriptions.has(chunkId)) {
      const { reject } = this.pendingTranscriptions.get(chunkId)!;
      this.pendingTranscriptions.delete(chunkId);
      reject(new Error(message));
    } else {
      Logger.error('WhisperModelManager', `Worker error: ${message}`);
      this.setState({
        status: 'error',
        error: message
      });
    }
  }

  private handleWorkerError(error: ErrorEvent): void {
    const errorMessage = `Worker error: ${error.message}`;
    Logger.error('WhisperModelManager', errorMessage);
    
    this.pendingTranscriptions.forEach(({ reject }) => {
      reject(new Error(errorMessage));
    });
    this.pendingTranscriptions.clear();

    this.setState({
      status: 'error',
      error: errorMessage
    });
  }

  public isReady(): boolean {
    return this.state.status === 'loaded';
  }

  public isLoading(): boolean {
    return this.state.status === 'loading';
  }

  public hasError(): boolean {
    return this.state.status === 'error';
  }

  public getError(): string | null {
    return this.state.error;
  }

  public getCurrentConfig(): WhisperModelConfig | null {
    return this.currentConfig;
  }

  private extractModelSize(modelId: string): string {
    const match = modelId.match(/whisper-([^.]+)/);
    return match ? match[1] : 'unknown';
  }
}
