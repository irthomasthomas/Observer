import { AudioStreamType } from '../streamManager';
import { Logger } from '@utils/logging';

export interface TranscriptionState {
  recordingStartedAt: number | null;
  chunkDurationMs: number;
  isTranscribing: boolean;
  fullTranscript: string;
  chunkCount: number;
  maxChunks: number;
}

type StateListener = (state: TranscriptionState) => void;

const DEFAULT_STATE: TranscriptionState = {
  recordingStartedAt: null,
  chunkDurationMs: 0,
  isTranscribing: false,
  fullTranscript: '',
  chunkCount: 0,
  maxChunks: 0,
};

/**
 * Singleton that holds transcription state for all audio stream types.
 * Survives component mounts/unmounts - UI can query current state on mount.
 */
class TranscriptionStateManagerClass {
  private static instance: TranscriptionStateManagerClass;
  private state = new Map<AudioStreamType, TranscriptionState>();
  private listeners = new Map<AudioStreamType, Set<StateListener>>();

  public static getInstance(): TranscriptionStateManagerClass {
    if (!TranscriptionStateManagerClass.instance) {
      TranscriptionStateManagerClass.instance = new TranscriptionStateManagerClass();
    }
    return TranscriptionStateManagerClass.instance;
  }

  // --- Called by transcription services ---

  public chunkRecordingStarted(
    type: AudioStreamType,
    chunkDurationMs: number,
    maxChunks: number
  ): void {
    const current = this.getState(type);
    this.state.set(type, {
      ...current,
      recordingStartedAt: Date.now(),
      chunkDurationMs,
      maxChunks,
      // Don't touch isTranscribing - let the transcription lifecycle manage it
    });
    this.notify(type);
  }

  public chunkTranscriptionStarted(type: AudioStreamType): void {
    const current = this.getState(type);
    Logger.info("TranscriptionRouter", `Started Chunk Transcription`);
    this.state.set(type, {
      ...current,
      isTranscribing: true,
    });
    this.notify(type);
  }

  public chunkTranscriptionEnded(
    type: AudioStreamType,
    _text: string,
    fullTranscript: string,
    chunkCount: number
  ): void {
    const current = this.getState(type);
    Logger.info("TranscriptionRouter", `Ended Chunk ${chunkCount} Transcription`);
    this.state.set(type, {
      ...current,
      isTranscribing: false,
      fullTranscript,
      chunkCount,
    });
    this.notify(type);
  }

  public streamStopped(type: AudioStreamType): void {
    this.state.delete(type);
    this.notify(type);
  }

  // --- Called by UI components ---

  public getState(type: AudioStreamType): TranscriptionState {
    return this.state.get(type) ?? { ...DEFAULT_STATE };
  }

  public subscribe(type: AudioStreamType, callback: StateListener): () => void {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }
    this.listeners.get(type)!.add(callback);

    // Return unsubscribe function
    return () => {
      this.listeners.get(type)?.delete(callback);
    };
  }

  // --- Internal ---

  private notify(type: AudioStreamType): void {
    const state = this.getState(type);
    this.listeners.get(type)?.forEach(cb => cb(state));
  }
}

export const TranscriptionStateManager = TranscriptionStateManagerClass.getInstance();
