import { TranscriptionChunk } from './types';
import { WhisperModelManager } from './WhisperModelManager';
import { SensorSettings } from '../settings';
import { Logger } from '../logging';

declare interface MediaRecorderErrorEvent extends Event {
  readonly error: DOMException;
}

export class WhisperTranscriptionService {
  private isRunning = false;
  private currentStream: MediaStream | null = null;
  private onChunkProcessed: ((chunk: TranscriptionChunk) => void) | null = null;
  private chunkCounter = 0;
  private chunkDurationMs = 15000;
  private recentChunkTexts: string[] = [];
  private readonly MAX_CHUNKS_TO_KEEP = 20;
  
  // NEW: Map to store audio blobs by their chunk ID until transcription is complete
  private pendingChunks = new Map<number, Blob>();

  public async start(stream: MediaStream, onChunkProcessed?: (chunk: TranscriptionChunk) => void): Promise<void> {
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
    this.onChunkProcessed = onChunkProcessed || null;
    this.chunkCounter = 0;
    this.recentChunkTexts = [];
    this.pendingChunks.clear();
    
    const settings = SensorSettings.getWhisperSettings();
    this.chunkDurationMs = settings.chunkDurationMs;

    Logger.info('WhisperTranscriptionService', `Starting transcription with ${this.chunkDurationMs}ms chunks`);
    
    this.transcribeLoop();
  }

  public stop(): void {
    if (!this.isRunning) return;

    Logger.info('WhisperTranscriptionService', 'Stopping transcription service');
    this.isRunning = false;
    this.currentStream = null;
    this.onChunkProcessed = null;
    this.recentChunkTexts = [];
    this.pendingChunks.clear();
  }

  public getTranscript(): string {
    return this.recentChunkTexts.join(' ');
  }

  private async transcribeLoop(): Promise<void> {
    while (this.isRunning) {
      try {
        const currentChunkId = ++this.chunkCounter;
        
        if (!this.currentStream) {
          Logger.error('WhisperTranscriptionService', 'No stream available');
          break;
        }

        const audioBlob = await this.recordChunk(this.currentStream, this.chunkDurationMs);
        
        if (!this.isRunning) break;

        // Store the blob with its ID for later retrieval
        this.pendingChunks.set(currentChunkId, audioBlob);

        Logger.debug('WhisperTranscriptionService', `Processing chunk ${currentChunkId}`);

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
        this.recentChunkTexts.push(result.text);
        this.recentChunkTexts = this.recentChunkTexts.slice(-this.MAX_CHUNKS_TO_KEEP);

        Logger.debug('WhisperTranscriptionService', `Chunk ${chunkId}: "${result.text}"`);

        // Retrieve the stored blob
        const storedBlob = this.pendingChunks.get(chunkId);
        
        if (this.onChunkProcessed && storedBlob) {
          this.onChunkProcessed({
            id: chunkId,
            blob: storedBlob,
            text: result.text
          });
        }
        
        // Clean up the stored blob
        this.pendingChunks.delete(chunkId);
      }
    } catch (transcriptionError) {
      if (this.isRunning) {
        Logger.error('WhisperTranscriptionService', `Transcription failed for chunk ${chunkId}: ${transcriptionError}`);
        // Clean up on error too
        this.pendingChunks.delete(chunkId);
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