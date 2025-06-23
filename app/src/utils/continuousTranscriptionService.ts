// src/utils/continuousTranscriptionService.ts
import { Logger } from './logging';

// This is no longer a singleton. It's a regular class that can be instantiated.
export class ContinuousTranscriptionService {
  private isRunning = false;
  private mediaRecorder: MediaRecorder | null = null;
  private worker: Worker | null = null;
  private transcript: string = '';
  private audioContext: AudioContext | null = null;

  public async start(stream: MediaStream): Promise<void> {
    if (this.isRunning) {
      Logger.warn('TRANSCRIPTION', 'Service instance is already running.');
      return;
    }
    this.isRunning = true;
    Logger.info('TRANSCRIPTION', `Starting new transcription instance...`);

    // Initialize a dedicated AudioContext for this instance
    this.audioContext = new AudioContext({ sampleRate: 16000 });

    this.worker = new Worker(new URL('./transcription.worker.ts', import.meta.url), {
      type: 'module'
    });

    this.worker.onmessage = (event) => {
      const { status, text } = event.data;
      if (status === 'transcription-complete' && text) {
        this.transcript = this.transcript ? `${this.transcript} ${text}` : text;
        Logger.debug('TRANSCRIPTION', `[Chunk] ${text}`);
      }
    };

    this.worker.onerror = (error) => {
      Logger.error('TRANSCRIPTION', `Worker error in instance: ${error.message}`);
    };

    this.mediaRecorder = new MediaRecorder(stream);
    this.transcribeLoop();
  }

  public stop(): void {
    if (!this.isRunning) return;
    
    Logger.info('TRANSCRIPTION', 'Stopping transcription instance...');
    this.isRunning = false;
    this.mediaRecorder?.stop();
    this.mediaRecorder = null;
    this.worker?.terminate();
    this.worker = null;
    this.audioContext?.close();
    this.transcript = '';
  }

  public getTranscript(): string {
    return this.transcript;
  }

  private async transcribeLoop(): Promise<void> {
    while (this.isRunning) {
      try {
        const audioBlob = await this.recordChunk(10000); 
        if (!this.isRunning || !this.audioContext) break; 

        const arrayBuffer = await audioBlob.arrayBuffer();
        const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
        const rawAudio = audioBuffer.getChannelData(0);

        this.worker?.postMessage(rawAudio, [rawAudio.buffer]);
      } catch (error) {
        if (this.isRunning) {
          Logger.error('TRANSCRIPTION', `Error in recording loop: ${error}`);
        }
      }
    }
  }

  private recordChunk(durationMs: number): Promise<Blob> {
    return new Promise((resolve, reject) => {
      if (!this.mediaRecorder) {
        return reject(new Error("MediaRecorder is not initialized."));
      }
      const chunks: BlobPart[] = [];
      this.mediaRecorder.ondataavailable = (e) => chunks.push(e.data);
      this.mediaRecorder.onstop = () => resolve(new Blob(chunks));
      this.mediaRecorder.start();
      setTimeout(() => {
        if (this.mediaRecorder?.state === 'recording') {
            this.mediaRecorder.stop()
        }
      }, durationMs);
    });
  }
}
