import { TranscriptionMode } from './types';
import { WhisperTranscriptionService } from './WhisperTranscriptionService';
import { CloudTranscriptionService } from './CloudTranscriptionService';
import { WhisperModelManager } from './WhisperModelManager';
import { SensorSettings } from '../settings';
import { Logger } from '../logging';
import { AudioStreamType } from '../streamManager';

// Token provider type
export type TokenProvider = () => Promise<string | undefined>;

// Common interface for both providers
export interface TranscriptionProvider {
  start(stream: MediaStream, streamType?: AudioStreamType): Promise<void>;
  stop(): void;
  getTranscript(): string;
}

export class TranscriptionRouter {
  private static instance: TranscriptionRouter | null = null;
  private static tokenProvider: TokenProvider | null = null;
  private mode: TranscriptionMode;
  private modeChangeListeners: Array<(mode: TranscriptionMode) => void> = [];

  private constructor() {
    this.mode = SensorSettings.getTranscriptionMode();
    Logger.info('TranscriptionRouter', `Initialized with mode: ${this.mode}`);
  }

  /**
   * Set the token provider function. Call this from App.tsx during initialization.
   */
  public static setTokenProvider(provider: TokenProvider): void {
    TranscriptionRouter.tokenProvider = provider;
    Logger.info('TranscriptionRouter', 'Token provider set');
  }

  /**
   * Get a token using the registered provider.
   */
  public static async getToken(): Promise<string | undefined> {
    if (!TranscriptionRouter.tokenProvider) {
      Logger.warn('TranscriptionRouter', 'No token provider set');
      return undefined;
    }
    return TranscriptionRouter.tokenProvider();
  }

  public static getInstance(): TranscriptionRouter {
    if (!TranscriptionRouter.instance) {
      TranscriptionRouter.instance = new TranscriptionRouter();
    }
    return TranscriptionRouter.instance;
  }

  public getMode(): TranscriptionMode {
    return this.mode;
  }

  public setMode(newMode: TranscriptionMode): void {
    if (this.mode === newMode) return;

    Logger.info('TranscriptionRouter', `Switching mode from ${this.mode} to ${newMode}`);
    this.mode = newMode;
    SensorSettings.setTranscriptionMode(newMode);

    // Notify listeners about mode change
    this.modeChangeListeners.forEach(listener => listener(newMode));
  }

  public onModeChange(listener: (mode: TranscriptionMode) => void): () => void {
    this.modeChangeListeners.push(listener);
    return () => {
      this.modeChangeListeners = this.modeChangeListeners.filter(l => l !== listener);
    };
  }

  /**
   * Factory method to create a transcription provider based on current mode.
   * Used by StreamManager to create provider instances for each audio stream.
   */
  public createProvider(): TranscriptionProvider {
    if (this.mode === 'cloud') {
      Logger.debug('TranscriptionRouter', 'Creating cloud transcription provider');
      return new CloudTranscriptionService();
    } else {
      Logger.debug('TranscriptionRouter', 'Creating local transcription provider');
      return new WhisperTranscriptionService();
    }
  }

  /**
   * Ensures the transcription system is ready.
   * For cloud mode, always ready. For local mode, loads the model if needed.
   */
  public async ensureReady(): Promise<void> {
    if (this.mode === 'local') {
      const modelManager = WhisperModelManager.getInstance();
      if (!modelManager.isReady()) {
        Logger.info('TranscriptionRouter', 'Local model not loaded, loading automatically...');
        await modelManager.loadModel();
      }
    }
    // Cloud mode is always ready
  }

  public isReady(): boolean {
    if (this.mode === 'cloud') {
      return true;
    } else {
      return WhisperModelManager.getInstance().isReady();
    }
  }
}
