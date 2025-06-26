// src/utils/transcriptionService.ts
import { Logger } from './logging';

export interface TranscriptionChunk {
  id: number;
  blob: Blob;
  text: string;
}

declare interface MediaRecorderErrorEvent extends Event {
  readonly error: DOMException;
}

export class TranscriptionService {
  private isRunning = false;
  // REMOVED: private mediaRecorder: MediaRecorder | null = null; // We will create a new instance per chunk
  private worker: Worker | null = null;
  private transcript: string = '';
  private audioContext: AudioContext | null = null;
  private onChunkProcessed: ((chunk: TranscriptionChunk) => void) | null = null;
  private chunkCounter = 0;

  // NEW: Store the original stream to create new MediaRecorder instances
  private currentStream: MediaStream | null = null; 

  // NEW: Map to store audio blobs by their chunk ID until transcription is complete
  private pendingChunks = new Map<number, Blob>(); 

  public async start(stream: MediaStream, onChunkProcessed?: (chunk: TranscriptionChunk) => void): Promise<void> {
    if (this.isRunning) {
      Logger.warn('TranscriptionService', 'Service instance is already running.');
      return;
    }
    this.isRunning = true;
    Logger.info('TranscriptionService', `Starting new transcription instance...`);
    
    this.onChunkProcessed = onChunkProcessed || null;
    this.chunkCounter = 0; // Reset counter on start
    this.currentStream = stream; // Store the stream here for repeated use
    this.pendingChunks.clear(); // Ensure map is clean on start

    this.audioContext = new AudioContext({ sampleRate: 16000 });
    this.worker = new Worker(new URL('./transcription.worker.ts', import.meta.url), {
      type: 'module'
    });

    this.worker.onmessage = (event) => {
      // MODIFIED: Expecting 'chunkId' from the worker now
      const { status, text, chunkId } = event.data; 
      console.log('[Whisper]', event.data); // Keep for debugging

      if (status === 'transcription-complete' && text) {
        this.transcript = this.transcript ? `${this.transcript} ${text}` : text;
        Logger.debug('TranscriptionService', `[Chunk] ${text} for ID: ${chunkId}`);

        // MODIFIED: Retrieve the blob using the chunkId sent back by the worker
        const blobForThisChunk = this.pendingChunks.get(chunkId);

        if (this.onChunkProcessed && blobForThisChunk) {
            this.onChunkProcessed({
                id: chunkId, // Use the ID from the worker's message
                blob: blobForThisChunk,
                text: text,
            });
            this.pendingChunks.delete(chunkId); // Clean up the map
        } else if (this.onChunkProcessed) {
            Logger.warn('TranscriptionService', `Blob for chunk ID ${chunkId} not found in pendingChunks.`);
        }
      } else if (status === 'error') {
          // Log worker errors, also clearing the pending chunk if an ID is present
          Logger.error('TranscriptionService', `Worker error (chunkId: ${chunkId}): ${event.data.message}`);
          if (chunkId !== undefined) { // Check if chunkId was sent with error
              this.pendingChunks.delete(chunkId); // Clean up
          }
      }
    };

    this.worker.onerror = (error) => {
      Logger.error('TranscriptionService', `Worker error in instance: ${error.message}`);
    };

    this.transcribeLoop();
  }

  public stop(): void {
    if (!this.isRunning) return;
    
    Logger.info('TranscriptionService', 'Stopping transcription instance...');
    this.isRunning = false;
    // No explicit mediaRecorder.stop() needed here as they are per-chunk and self-stopping
    this.worker?.terminate();
    this.worker = null;
    this.audioContext?.close();
    this.transcript = '';
    this.onChunkProcessed = null;
    this.currentStream = null; // Clear the stream reference
    this.pendingChunks.clear(); // Clear any remaining pending chunks
  }

  public getTranscript(): string {
    return this.transcript;
  }

  private async transcribeLoop(): Promise<void> {
    while (this.isRunning) {
      try {
        // Increment chunkCounter for the *next* chunk to be processed
        const currentChunkId = this.chunkCounter + 1;
        this.chunkCounter = currentChunkId; 

        // MODIFIED: Pass the stored stream to recordChunk
        const audioBlob = await this.recordChunk(this.currentStream!, 15000); 
        if (!this.isRunning || !this.audioContext) break; 

        // Store the captured blob in the map, associated with its ID
        this.pendingChunks.set(currentChunkId, audioBlob);

        const arrayBuffer = await audioBlob.arrayBuffer();
        // Use non-null assertion as audioContext is guaranteed to be initialized here
        const audioBuffer = await this.audioContext!.decodeAudioData(arrayBuffer);
        const rawAudio = audioBuffer.getChannelData(0);

        Logger.info('TranscriptionService', `Loop called. Sending chunk ${currentChunkId} to worker.`);

        // MODIFIED: Send the chunkId along with the raw audio to the worker
        this.worker?.postMessage({ audio: rawAudio, chunkId: currentChunkId }, [rawAudio.buffer]);
      } catch (error) {
        if (this.isRunning) {
          Logger.error('TranscriptionService', `Error in recording loop for chunk ${this.chunkCounter}: ${error}`);
        }
      }
    }
  }

  // MODIFIED: This method now accepts the MediaStream and creates a NEW MediaRecorder instance
  private recordChunk(stream: MediaStream, durationMs: number): Promise<Blob> {
    return new Promise((resolve, reject) => {
      // Ensure we have an active stream with audio tracks
      if (!stream || stream.getAudioTracks().length === 0) {
          return reject(new Error("No active audio stream to record."));
      }

      // Create a NEW MediaRecorder instance for this specific chunk
      const mediaRecorder = new MediaRecorder(stream); 
      const chunks: BlobPart[] = [];

      mediaRecorder.ondataavailable = (e) => {
          if (e.data.size > 0) { // Only push if there's actual data
            chunks.push(e.data);
          }
      };

      mediaRecorder.onstop = () => {
          if (chunks.length > 0) {
              resolve(new Blob(chunks, { type: mediaRecorder.mimeType }));
          } else {
              // If no data was collected, resolve with an empty blob or reject
              Logger.warn('TranscriptionService', 'No data collected for chunk.');
              resolve(new Blob([])); // Resolve with an empty blob instead of rejecting
          }
      };


      mediaRecorder.onerror = (e: Event) => {
          const errorEvent = e as MediaRecorderErrorEvent; // <-- The fix is here
          Logger.error("TranscriptionService", `MediaRecorder error during chunk recording: ${errorEvent.error.name} - ${errorEvent.error.message}`);
          reject(errorEvent.error);
      };

      mediaRecorder.start(); // Start recording
      
      // Stop recording after the specified duration
      setTimeout(() => {
        // Only stop if the recorder is still active
        if (mediaRecorder.state === 'recording' || mediaRecorder.state === 'paused') {
            mediaRecorder.stop();
        }
      }, durationMs);
    });
  }
}
