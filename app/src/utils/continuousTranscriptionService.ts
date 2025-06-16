// src/utils/continuousTranscriptionService.ts

import { Logger } from './logging';

class Service {
  private static instance: Service;
  private isRunning = false;
  private mediaRecorder: MediaRecorder | null = null;
  private worker: Worker | null = null;
  private transcript: string = '';

  // The main thread now needs an AudioContext to decode audio.
  // We create it once and reuse it for efficiency.
  private audioContext: AudioContext | null = null;

  public static getInstance(): Service {
    if (!Service.instance) {
      Service.instance = new Service();
    }
    return Service.instance;
  }

  public async start(stream: MediaStream): Promise<void> {
    if (this.isRunning) {
      Logger.warn('TRANSCRIPTION', 'Transcription service is already running.');
      return;
    }
    this.isRunning = true;
    Logger.info('TRANSCRIPTION', 'Starting worker-based transcription service...');

    // Initialize AudioContext
    if (!this.audioContext) {
      this.audioContext = new AudioContext({ sampleRate: 16000 });
    }

    this.worker = new Worker(new URL('./transcription.worker.ts', import.meta.url), {
        type: 'module'
    });

    this.worker.onmessage = (event) => {
        const { status, text, message, file } = event.data;

        // The worker can send back model loading progress
        if (status === 'progress' || status === 'ready' || status === 'initiate') {
            const logMessage = `Model ${status}: ${file || ''}`;
            Logger.info('TRANSCRIPTION_WORKER', logMessage);
            return;
        }

        if (status === 'transcription-complete') {
            if (this.transcript.length > 0) {
                this.transcript += ' ';
            }
            this.transcript += text;

            Logger.debug('TRANSCRIPTION', `[Chunk] ${text}`);
            Logger.debug('TRANSCRIPTION', `[Full] "${this.transcript}"`);
        } else if (status === 'error') {
            Logger.error('TRANSCRIPTION_WORKER', `Worker error: ${message}`);
        }
    };

    this.worker.onerror = (error) => {
        Logger.error('TRANSCRIPTION', `Unhandled worker error: ${error.message}`);
    };

    this.mediaRecorder = new MediaRecorder(stream);
    this.transcribeLoop();
  }

  public stop(): void {
    if (!this.isRunning) return;
    
    Logger.info('TRANSCRIPTION', 'Stopping transcription service...');
    this.isRunning = false;
    this.mediaRecorder?.stop();
    this.mediaRecorder = null;
    this.worker?.terminate();
    this.worker = null;
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

        // DECODING NOW HAPPENS ON THE MAIN THREAD
        const arrayBuffer = await audioBlob.arrayBuffer();
        const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
        const rawAudio = audioBuffer.getChannelData(0);

        // Send the raw audio data to the worker.
        // The second argument is a "Transferable Object". This transfers ownership
        // of the underlying ArrayBuffer to the worker instead of copying it,
        // which is much more efficient.
        this.worker?.postMessage(rawAudio, [rawAudio.buffer]);

      } catch (error) {
        Logger.error('TRANSCRIPTION', `Error in recording/decoding loop: ${error}`);
        await new Promise(resolve => setTimeout(resolve, 1000));
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

export const ContinuousTranscriptionService = Service.getInstance();
