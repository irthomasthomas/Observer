// src/utils/continuousTranscriptionService.ts

// Import PipelineType for correct typing
import { pipeline, env, PipelineType } from '@xenova/transformers';
import { Logger } from './logging';

// Skip local model check for this browser-based approach
env.allowLocalModels = false;

class Service {
  private static instance: Service;

  private isRunning = false;
  private mediaRecorder: MediaRecorder | null = null;
  
  // Type the pipeline property correctly
  private pipeline: any | null = null;
  
  // The transcript is now just a simple string.
  private transcript: string = '';

  // FIX #1: Use the specific 'PipelineType' instead of 'string'
  private static task: PipelineType = 'automatic-speech-recognition';
  private static model = 'Xenova/whisper-tiny.en';

  // Singleton pattern
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
    Logger.info('TRANSCRIPTION', 'Starting simple continuous transcription service...');

    if (!this.pipeline) {
      Logger.info('TRANSCRIPTION', 'Loading Whisper model...');
      // FIX #2: Add 'await' to get the resolved value of the promise
      this.pipeline = await pipeline(Service.task, Service.model);
      Logger.info('TRANSCRIPTION', 'Whisper model loaded.');
    }

    this.mediaRecorder = new MediaRecorder(stream);
    this.transcribeLoop(); // Start the loop
  }

  public stop(): void {
    if (!this.isRunning) return;
    
    Logger.info('TRANSCRIPTION', 'Stopping continuous transcription service...');
    this.isRunning = false;
    this.mediaRecorder?.stop();
    this.mediaRecorder = null;
    // Reset the transcript string.
    this.transcript = '';
  }

  /**
   * Returns the full, concatenated transcript string.
   */
  public getTranscript(): string {
    return this.transcript;
  }

  /**
   * The main loop that records and transcribes in simple, sequential chunks.
   */
  private async transcribeLoop(): Promise<void> {
    while (this.isRunning) {
      try {
        // Record a 10-second chunk.
        const audioBlob = await this.recordChunk(10000); 
        if (!this.isRunning) break; 

        const arrayBuffer = await audioBlob.arrayBuffer();
        const audioContext = new AudioContext({ sampleRate: 16000 });
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
        const rawAudio = audioBuffer.getChannelData(0);

        // Transcribe to get the plain text.
        const output = await this.pipeline(rawAudio);
        const newText = (output.text as string).trim();

        if (newText) {
          if (this.transcript.length > 0) {
            this.transcript += ' ';
          }
          this.transcript += newText;
        }
        
        Logger.debug('TRANSCRIPTION', `[Chunk] ${newText}`);
        Logger.debug('TRANSCRIPTION', `[Full] "${this.transcript}"`);

      } catch (error) {
        Logger.error('TRANSCRIPTION', `Error in transcription loop: ${error}`);
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
  }

  /**
   * Records a chunk of audio for a specified duration.
   */
  private recordChunk(durationMs: number): Promise<Blob> {
    return new Promise((resolve) => {
      if (!this.mediaRecorder) return;
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

// Export the singleton instance
export const ContinuousTranscriptionService = Service.getInstance();
