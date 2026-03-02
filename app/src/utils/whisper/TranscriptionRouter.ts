import { TranscriptionMode } from './types';
import { WhisperTranscriptionService } from './WhisperTranscriptionService';
import { CloudTranscriptionService } from './CloudTranscriptionService';
import { SelfHostedTranscriptionService } from './SelfHostedTranscriptionService';
import { UnifiedTranscriptionService } from './UnifiedTranscriptionService';
import { WhisperModelManager } from './WhisperModelManager';
import { SensorSettings } from '../settings';
import { Logger } from '../logging';
import { AudioStreamType } from '../streamManager';
import { TranscriptionSubscriber } from './TranscriptionSubscriber';

// Token provider type
export type TokenProvider = () => Promise<string | undefined>;

// Common interface for both providers
export interface TranscriptionProvider {
  start(stream: MediaStream, streamType?: AudioStreamType): Promise<void>;
  stop(): void;

  // Subscriber management - services push transcribed text to all subscribers
  addSubscriber(subscriber: TranscriptionSubscriber): void;
  removeSubscriber(subscriber: TranscriptionSubscriber): void;
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
   *
   * Returns UnifiedTranscriptionService which uses direct PCM input from the
   * unified audio pipeline (all audio is resampled to 16kHz in Rust/native layer).
   */
  public createProvider(): TranscriptionProvider {
    Logger.info('TranscriptionRouter', `Creating unified transcription provider (mode: ${this.mode})`);
    return new UnifiedTranscriptionService(this.mode);
  }

  /**
   * Create a unified transcription service directly (for PCM pipeline consumers).
   * Use this when you have direct PCM input instead of MediaStream.
   */
  public createUnifiedProvider(): UnifiedTranscriptionService {
    Logger.info('TranscriptionRouter', `Creating unified transcription provider (mode: ${this.mode})`);
    return new UnifiedTranscriptionService(this.mode);
  }

  /**
   * @deprecated Legacy providers are deprecated. Use createProvider() which returns UnifiedTranscriptionService.
   *
   * Create a legacy MediaStream-based provider (for backward compatibility only).
   * These services use MediaRecorder which has encoding/decoding overhead.
   */
  public createLegacyProvider(): TranscriptionProvider {
    Logger.warn('TranscriptionRouter', `Creating LEGACY transcription provider (mode: ${this.mode}) - consider migrating to unified pipeline`);
    switch (this.mode) {
      case 'cloud':
        return new CloudTranscriptionService();
      case 'self-hosted':
        return new SelfHostedTranscriptionService();
      case 'local':
        return new WhisperTranscriptionService();
    }
  }

  /**
   * Ensures the transcription system is ready.
   * For cloud mode, always ready. For local mode, loads the model if needed.
   * For self-hosted mode, checks URL is configured.
   */
  public async ensureReady(): Promise<void> {
    switch (this.mode) {
      case 'cloud':
        // Cloud mode is always ready
        break;
      case 'self-hosted':
        const url = SensorSettings.getSelfHostedWhisperUrl();
        if (!url || url.trim().length === 0) {
          throw new Error('Self-hosted Whisper URL is not configured');
        }
        break;
      case 'local':
        const modelManager = WhisperModelManager.getInstance();
        if (!modelManager.isReady()) {
          Logger.info('TranscriptionRouter', 'Local model not loaded, loading automatically...');
          await modelManager.loadModel();
        }
        break;
    }
  }

  public isReady(): boolean {
    switch (this.mode) {
      case 'cloud':
        return true;
      case 'self-hosted':
        const url = SensorSettings.getSelfHostedWhisperUrl();
        return !!url && url.trim().length > 0;
      case 'local':
        return WhisperModelManager.getInstance().isReady();
    }
  }
}
