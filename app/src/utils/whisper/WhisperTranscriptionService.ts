import { WhisperModelManager } from './WhisperModelManager';
import { AudioStreamType } from '../streamManager';
import { SensorSettings } from '../settings';
import { Logger } from '../logging';
import { TranscriptionStateManager } from './TranscriptionStateManager';
import { TranscriptionSubscriber } from './TranscriptionSubscriber';

declare interface MediaRecorderErrorEvent extends Event {
  readonly error: DOMException;
}

export class WhisperTranscriptionService {
  private isRunning = false;
  private currentStream: MediaStream | null = null;
  private streamType: AudioStreamType = 'microphone';
  private chunkCounter = 0;
  private chunkDurationMs = 15000;

  // Subscriber management - services push to all subscribers
  private subscribers = new Set<TranscriptionSubscriber>();

  // Cleanup function for interim result listener
  private unsubscribeInterimResults: (() => void) | null = null;

  public async start(stream: MediaStream, streamType?: AudioStreamType): Promise<void> {
    if (this.isRunning) {
      Logger.warn('WhisperTranscriptionService', 'Service already running');
      return;
    }

    const modelManager = WhisperModelManager.getInstance();
    if (!modelManager.isReady()) {
      Logger.info('WhisperTranscriptionService', 'Model not loaded, loading automatically...');
      await modelManager.loadModel();
    }

    this.isRunning = true;
    this.currentStream = stream;
    this.streamType = streamType || 'microphone';
    this.chunkCounter = 0;

    const settings = SensorSettings.getWhisperSettings();
    this.chunkDurationMs = settings.chunkDurationMs;

    // Subscribe to interim results from the model manager
    this.unsubscribeInterimResults = modelManager.onInterimResult((text, _chunkId) => {
      if (this.isRunning) {
        this.setInterimToSubscribers(text);
        TranscriptionStateManager.setInterimText(this.streamType, text);
      }
    });

    Logger.info('WhisperTranscriptionService', `Starting transcription for ${this.streamType} with ${this.chunkDurationMs}ms chunks`);

    this.transcribeLoop();
  }

  public stop(): void {
    if (!this.isRunning) return;

    Logger.info('WhisperTranscriptionService', 'Stopping transcription service');
    this.isRunning = false;
    this.currentStream = null;

    // Unsubscribe from interim results
    if (this.unsubscribeInterimResults) {
      this.unsubscribeInterimResults();
      this.unsubscribeInterimResults = null;
    }

    // Note: We don't clear subscribers here - they are managed by StreamManager
    // and may persist across service restarts

    // Notify state manager that stream stopped
    TranscriptionStateManager.streamStopped(this.streamType);
  }

  // --- Subscriber Management ---

  public addSubscriber(subscriber: TranscriptionSubscriber): void {
    this.subscribers.add(subscriber);
    Logger.debug('WhisperTranscriptionService', `Added subscriber ${subscriber.id}, total: ${this.subscribers.size}`);
  }

  public removeSubscriber(subscriber: TranscriptionSubscriber): void {
    this.subscribers.delete(subscriber);
    Logger.debug('WhisperTranscriptionService', `Removed subscriber ${subscriber.id}, total: ${this.subscribers.size}`);
  }

  /**
   * Set interim text on all registered subscribers (replaces previous interim)
   */
  private setInterimToSubscribers(text: string): void {
    for (const subscriber of this.subscribers) {
      subscriber.setInterimText(text);
    }
  }

  /**
   * Commit final text to all registered subscribers (clears interim, adds to committed)
   */
  private commitToSubscribers(text: string): void {
    for (const subscriber of this.subscribers) {
      subscriber.commitText(text);
    }
  }

  private async transcribeLoop(): Promise<void> {
    while (this.isRunning) {
      try {
        const currentChunkId = ++this.chunkCounter;

        if (!this.currentStream) {
          Logger.error('WhisperTranscriptionService', 'No stream available');
          break;
        }

        // Notify state manager: recording started (UI state only)
        TranscriptionStateManager.chunkRecordingStarted(
          this.streamType,
          this.chunkDurationMs
        );

        const audioBlob = await this.recordChunk(this.currentStream, this.chunkDurationMs);

        if (!this.isRunning) break;

        Logger.debug('WhisperTranscriptionService', `Processing chunk ${currentChunkId}`);

        // Notify state manager: transcription started
        TranscriptionStateManager.chunkTranscriptionStarted(this.streamType);

        // Send to worker without awaiting - decoupled!
        this.transcribeChunkAsync(audioBlob, currentChunkId);

      } catch (error) {
        if (this.isRunning) {
          Logger.error('WhisperTranscriptionService', `Error in transcription loop: ${error}`);
        }
      }
    }
  }

  private async transcribeChunkAsync(audioBlob: Blob, chunkId: number): Promise<void> {
    try {
      const result = await WhisperModelManager.getInstance()
        .transcribe(await audioBlob.arrayBuffer(), chunkId);

      if (result?.text && this.isRunning) {
        // Commit final text to all registered subscribers (clears interim, adds to committed)
        this.commitToSubscribers(result.text);

        // Notify state manager for UI updates (maintains its own rolling window)
        TranscriptionStateManager.chunkTranscriptionEnded(
          this.streamType,
          result.text,
          chunkId
        );
      }
    } catch (transcriptionError) {
      if (this.isRunning) {
        Logger.error('WhisperTranscriptionService', `Transcription failed for chunk ${chunkId}: ${transcriptionError}`);
      }
    }
  }

  private recordChunk(stream: MediaStream, durationMs: number): Promise<Blob> {
    return new Promise((resolve, reject) => {
      if (!stream || stream.getAudioTracks().length === 0) {
        return reject(new Error('No active audio stream to record'));
      }

      // Create a NEW MediaRecorder instance for each chunk
      const mediaRecorder = new MediaRecorder(stream);
      const chunks: BlobPart[] = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunks.push(e.data);
        }
      };

      mediaRecorder.onstop = () => {
        if (chunks.length > 0) {
          resolve(new Blob(chunks, { type: mediaRecorder.mimeType }));
          Logger.debug('WhisperTranscriptionService', `resolved new chunk and now on queue: ${chunks.length}`);
        } else {
          Logger.warn('WhisperTranscriptionService', 'No audio data recorded for chunk');
          resolve(new Blob([]));
        }
      };

      mediaRecorder.onerror = (e: Event) => {
        const errorEvent = e as MediaRecorderErrorEvent;
        Logger.error('WhisperTranscriptionService', `MediaRecorder error: ${errorEvent.error.name} - ${errorEvent.error.message}`);
        reject(errorEvent.error);
      };

      mediaRecorder.start();

      setTimeout(() => {
        if (mediaRecorder.state === 'recording' || mediaRecorder.state === 'paused') {
          mediaRecorder.stop();
        }
      }, durationMs);
    });
  }
}
