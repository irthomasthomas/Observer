import { AudioStreamType } from '../streamManager';
import { SensorSettings } from '../settings';
import { Logger } from '../logging';
import { TranscriptionStateManager } from './TranscriptionStateManager';
import { TranscriptionSubscriber } from './TranscriptionSubscriber';

declare interface MediaRecorderErrorEvent extends Event {
  readonly error: DOMException;
}

/**
 * @deprecated Use UnifiedTranscriptionService instead.
 *
 * This service uses MediaRecorder to capture audio as WebM, which requires
 * encoding/decoding overhead. The unified pipeline (UnifiedTranscriptionService)
 * creates WAV directly from PCM samples, eliminating encoding steps.
 *
 * To enable the unified pipeline:
 *   localStorage.setItem('unified_pcm_pipeline', 'true')
 *
 * This service will be removed in a future version.
 *
 * ---
 *
 * REST client for OpenAI-compatible whisper servers (chunked approach).
 * Compatible with faster-whisper, whisper.cpp, speaches, etc.
 */
export class SelfHostedTranscriptionService {
  private isRunning = false;
  private currentStream: MediaStream | null = null;
  private streamType: AudioStreamType = 'microphone';
  private chunkCounter = 0;
  private chunkDurationMs = 5000;

  // Subscriber management - services push to all subscribers
  private subscribers = new Set<TranscriptionSubscriber>();

  public async start(stream: MediaStream, streamType?: AudioStreamType): Promise<void> {
    if (this.isRunning) {
      Logger.warn('SelfHostedTranscriptionService', 'Service already running');
      return;
    }

    const baseUrl = SensorSettings.getSelfHostedWhisperUrl();
    if (!baseUrl || baseUrl.trim().length === 0) {
      throw new Error('Self-hosted Whisper URL is not configured');
    }

    this.isRunning = true;
    this.currentStream = stream;
    this.streamType = streamType || 'microphone';
    this.chunkCounter = 0;

    const settings = SensorSettings.getWhisperSettings();
    this.chunkDurationMs = settings.chunkDurationMs;

    Logger.info('SelfHostedTranscriptionService', `Starting self-hosted transcription for ${this.streamType} with ${this.chunkDurationMs}ms chunks to ${baseUrl}`);

    this.transcribeLoop();
  }

  public stop(): void {
    if (!this.isRunning) return;

    Logger.info('SelfHostedTranscriptionService', 'Stopping self-hosted transcription service');
    this.isRunning = false;
    this.currentStream = null;

    // Notify state manager that stream stopped
    TranscriptionStateManager.streamStopped(this.streamType);
  }

  public isReady(): boolean {
    const url = SensorSettings.getSelfHostedWhisperUrl();
    return !!url && url.trim().length > 0;
  }

  // --- Subscriber Management ---

  public addSubscriber(subscriber: TranscriptionSubscriber): void {
    this.subscribers.add(subscriber);
    Logger.debug('SelfHostedTranscriptionService', `Added subscriber ${subscriber.id}, total: ${this.subscribers.size}`);
  }

  public removeSubscriber(subscriber: TranscriptionSubscriber): void {
    this.subscribers.delete(subscriber);
    Logger.debug('SelfHostedTranscriptionService', `Removed subscriber ${subscriber.id}, total: ${this.subscribers.size}`);
  }

  /**
   * Push transcribed text to all registered subscribers
   */
  private pushToSubscribers(text: string): void {
    for (const subscriber of this.subscribers) {
      subscriber.appendText(text);
    }
  }

  private async transcribeLoop(): Promise<void> {
    while (this.isRunning) {
      try {
        const currentChunkId = ++this.chunkCounter;

        if (!this.currentStream) {
          Logger.error('SelfHostedTranscriptionService', 'No stream available');
          break;
        }

        // Notify state manager: recording started (UI state only)
        TranscriptionStateManager.chunkRecordingStarted(
          this.streamType,
          this.chunkDurationMs
        );

        const audioBlob = await this.recordChunk(this.currentStream, this.chunkDurationMs);

        if (!this.isRunning) break;

        Logger.debug('SelfHostedTranscriptionService', `Sending chunk ${currentChunkId} to self-hosted server`);

        // Notify state manager: transcription started
        TranscriptionStateManager.chunkTranscriptionStarted(this.streamType);

        this.transcribeChunkAsync(audioBlob, currentChunkId);

      } catch (error) {
        if (this.isRunning) {
          Logger.error('SelfHostedTranscriptionService', `Error in transcription loop: ${error}`);
        }
      }
    }
  }

  private async transcribeChunkAsync(audioBlob: Blob, chunkId: number): Promise<void> {
    try {
      const baseUrl = SensorSettings.getSelfHostedWhisperUrl();

      const formData = new FormData();

      // Determine file extension based on mime type
      const mimeType = audioBlob.type || 'audio/webm';
      const extension = mimeType.includes('webm') ? 'webm' :
                       mimeType.includes('mp4') ? 'mp4' :
                       mimeType.includes('ogg') ? 'ogg' : 'webm';

      formData.append('file', audioBlob, `chunk_${chunkId}.${extension}`);
      formData.append('model', 'whisper-1');

      // Ensure URL doesn't have trailing slash
      const normalizedUrl = baseUrl.replace(/\/+$/, '');
      const response = await fetch(`${normalizedUrl}/v1/audio/transcriptions`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Self-hosted API error (${response.status}): ${errorText}`);
      }

      const result = await response.json();

      if (result?.text && this.isRunning) {
        // Push to all registered subscribers (agent-specific accumulators)
        this.pushToSubscribers(result.text);

        // Notify state manager for UI updates (maintains its own rolling window)
        TranscriptionStateManager.chunkTranscriptionEnded(
          this.streamType,
          result.text,
          chunkId
        );
      }
    } catch (error) {
      if (this.isRunning) {
        Logger.error('SelfHostedTranscriptionService', `Self-hosted transcription failed for chunk ${chunkId}: ${error}`);
      }
    }
  }

  private recordChunk(stream: MediaStream, durationMs: number): Promise<Blob> {
    return new Promise((resolve, reject) => {
      if (!stream || stream.getAudioTracks().length === 0) {
        return reject(new Error('No active audio stream to record'));
      }

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
        } else {
          Logger.warn('SelfHostedTranscriptionService', 'No audio data recorded for chunk');
          resolve(new Blob([]));
        }
      };

      mediaRecorder.onerror = (e: Event) => {
        const errorEvent = e as MediaRecorderErrorEvent;
        Logger.error('SelfHostedTranscriptionService', `MediaRecorder error: ${errorEvent.error.name} - ${errorEvent.error.message}`);
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
