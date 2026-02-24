import { TranscriptionRouter } from './TranscriptionRouter';
import { AudioStreamType } from '../streamManager';
import { SensorSettings } from '../settings';
import { Logger } from '../logging';
import { TranscriptionStateManager } from './TranscriptionStateManager';

const CLOUD_API_URL = 'https://api.observer-ai.com/v1/audio/transcriptions';

declare interface MediaRecorderErrorEvent extends Event {
  readonly error: DOMException;
}

export class CloudTranscriptionService {
  private isRunning = false;
  private currentStream: MediaStream | null = null;
  private streamType: AudioStreamType = 'microphone';
  private chunkCounter = 0;
  private chunkDurationMs = 15000;
  private recentChunkTexts: string[] = [];
  private maxChunksToKeep = 20;

  public async start(stream: MediaStream, streamType?: AudioStreamType): Promise<void> {
    if (this.isRunning) {
      Logger.warn('CloudTranscriptionService', 'Service already running');
      return;
    }

    this.isRunning = true;
    this.currentStream = stream;
    this.streamType = streamType || 'microphone';
    this.chunkCounter = 0;
    this.recentChunkTexts = [];

    const settings = SensorSettings.getWhisperSettings();
    this.chunkDurationMs = settings.chunkDurationMs;
    this.maxChunksToKeep = settings.maxChunksToKeep;

    Logger.info('CloudTranscriptionService', `Starting cloud transcription for ${this.streamType} with ${this.chunkDurationMs}ms chunks`);

    this.transcribeLoop();
  }

  public stop(): void {
    if (!this.isRunning) return;

    Logger.info('CloudTranscriptionService', 'Stopping cloud transcription service');
    this.isRunning = false;
    this.currentStream = null;
    this.recentChunkTexts = [];

    // Notify state manager that stream stopped
    TranscriptionStateManager.streamStopped(this.streamType);
  }

  public getTranscript(): string {
    return this.recentChunkTexts.join(' ');
  }

  public isReady(): boolean {
    return true; // Cloud service is always ready
  }

  private async transcribeLoop(): Promise<void> {
    while (this.isRunning) {
      try {
        const currentChunkId = ++this.chunkCounter;

        if (!this.currentStream) {
          Logger.error('CloudTranscriptionService', 'No stream available');
          break;
        }

        // Notify state manager: recording started
        TranscriptionStateManager.chunkRecordingStarted(
          this.streamType,
          this.chunkDurationMs,
          this.maxChunksToKeep
        );

        const audioBlob = await this.recordChunk(this.currentStream, this.chunkDurationMs);

        if (!this.isRunning) break;

        Logger.debug('CloudTranscriptionService', `Sending chunk ${currentChunkId} to cloud`);

        // Notify state manager: transcription started
        TranscriptionStateManager.chunkTranscriptionStarted(this.streamType);

        this.transcribeChunkAsync(audioBlob, currentChunkId);

      } catch (error) {
        if (this.isRunning) {
          Logger.error('CloudTranscriptionService', `Error in transcription loop: ${error}`);
        }
      }
    }
  }

  private async transcribeChunkAsync(audioBlob: Blob, chunkId: number): Promise<void> {
    try {
      const formData = new FormData();

      // Determine file extension based on mime type
      const mimeType = audioBlob.type || 'audio/webm';
      const extension = mimeType.includes('webm') ? 'webm' :
                       mimeType.includes('mp4') ? 'mp4' :
                       mimeType.includes('ogg') ? 'ogg' : 'webm';

      formData.append('file', audioBlob, `chunk_${chunkId}.${extension}`);
      formData.append('duration_ms', String(this.chunkDurationMs));

      // Get auth token
      const token = await TranscriptionRouter.getToken();
      const headers: HeadersInit = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const response = await fetch(CLOUD_API_URL, {
        method: 'POST',
        headers,
        body: formData,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Cloud API error (${response.status}): ${errorText}`);
      }

      const result = await response.json();

      if (result?.text && this.isRunning) {
        this.recentChunkTexts.push(result.text);
        this.recentChunkTexts = this.recentChunkTexts.slice(-this.maxChunksToKeep);

        const fullTranscript = this.recentChunkTexts.join(' ');

        // Notify state manager: transcription ended
        TranscriptionStateManager.chunkTranscriptionEnded(
          this.streamType,
          result.text,
          fullTranscript,
          this.recentChunkTexts.length
        );
      }
    } catch (error) {
      if (this.isRunning) {
        Logger.error('CloudTranscriptionService', `Cloud transcription failed for chunk ${chunkId}: ${error}`);
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
          Logger.warn('CloudTranscriptionService', 'No audio data recorded for chunk');
          resolve(new Blob([]));
        }
      };

      mediaRecorder.onerror = (e: Event) => {
        const errorEvent = e as MediaRecorderErrorEvent;
        Logger.error('CloudTranscriptionService', `MediaRecorder error: ${errorEvent.error.name} - ${errorEvent.error.message}`);
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
