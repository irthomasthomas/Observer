import { TranscriptionChunk } from './types';
import { TranscriptionRouter } from './TranscriptionRouter';
import { SensorSettings } from '../settings';
import { Logger } from '../logging';

const CLOUD_API_URL = 'https://api.observer-ai.com/v1/audio/transcriptions';

declare interface MediaRecorderErrorEvent extends Event {
  readonly error: DOMException;
}

export class CloudTranscriptionService {
  private isRunning = false;
  private currentStream: MediaStream | null = null;
  private onChunkProcessed: ((chunk: TranscriptionChunk) => void) | null = null;
  private chunkCounter = 0;
  private chunkDurationMs = 15000;
  private recentChunkTexts: string[] = [];
  private maxChunksToKeep = 20;

  private pendingChunks = new Map<number, Blob>();

  public async start(stream: MediaStream, onChunkProcessed?: (chunk: TranscriptionChunk) => void): Promise<void> {
    if (this.isRunning) {
      Logger.warn('CloudTranscriptionService', 'Service already running');
      return;
    }

    this.isRunning = true;
    this.currentStream = stream;
    this.onChunkProcessed = onChunkProcessed || null;
    this.chunkCounter = 0;
    this.recentChunkTexts = [];
    this.pendingChunks.clear();

    const settings = SensorSettings.getWhisperSettings();
    this.chunkDurationMs = settings.chunkDurationMs;
    this.maxChunksToKeep = settings.maxChunksToKeep;

    Logger.info('CloudTranscriptionService', `Starting cloud transcription with ${this.chunkDurationMs}ms chunks`);

    this.transcribeLoop();
  }

  public stop(): void {
    if (!this.isRunning) return;

    Logger.info('CloudTranscriptionService', 'Stopping cloud transcription service');
    this.isRunning = false;
    this.currentStream = null;
    this.onChunkProcessed = null;
    this.recentChunkTexts = [];
    this.pendingChunks.clear();
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

        const audioBlob = await this.recordChunk(this.currentStream, this.chunkDurationMs);

        if (!this.isRunning) break;

        this.pendingChunks.set(currentChunkId, audioBlob);

        Logger.debug('CloudTranscriptionService', `Sending chunk ${currentChunkId} to cloud`);

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

        Logger.debug('CloudTranscriptionService', `Chunk ${chunkId}: "${result.text}"`);

        const storedBlob = this.pendingChunks.get(chunkId);

        if (this.onChunkProcessed && storedBlob) {
          this.onChunkProcessed({
            id: chunkId,
            blob: storedBlob,
            text: result.text
          });
        }

        this.pendingChunks.delete(chunkId);
      }
    } catch (error) {
      if (this.isRunning) {
        Logger.error('CloudTranscriptionService', `Cloud transcription failed for chunk ${chunkId}: ${error}`);
        this.pendingChunks.delete(chunkId);
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
