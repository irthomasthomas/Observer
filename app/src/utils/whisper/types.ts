export type ModelSize = 'tiny' | 'base' | 'small' | 'medium';
export type LanguageType = 'en' | 'multilingual';
export type ModelState = 'unloaded' | 'loading' | 'loaded' | 'error';

export interface WhisperSettings {
  modelSize: ModelSize;
  language: LanguageType;
  quantized: boolean;
  chunkDurationMs: number;
}

export interface ModelConfig {
  modelSize: ModelSize;
  language: LanguageType;
  quantized: boolean;
  modelId: string;
}

export interface ProgressItem {
  file: string;
  progress: number;
  loaded: number;
  total: number;
  status: 'progress' | 'done';
  name?: string;
}

export interface WhisperModelState {
  status: ModelState;
  config: ModelConfig | null;
  progress: ProgressItem[];
  error: string | null;
}

export interface TranscriptionChunk {
  id: number;
  blob: Blob;
  text: string;
}

export interface WorkerMessage {
  type: 'configure' | 'transcribe' | 'progress' | 'ready' | 'error' | 'transcription-complete';
  data?: any;
}

export interface WorkerConfigureMessage extends WorkerMessage {
  type: 'configure';
  data: {
    modelSize: ModelSize;
    language: LanguageType;
    quantized: boolean;
  };
}

export interface WorkerTranscribeMessage extends WorkerMessage {
  type: 'transcribe';
  data: {
    audio: Float32Array;
    chunkId: number;
  };
}

export interface WorkerProgressMessage extends WorkerMessage {
  type: 'progress';
  data: ProgressItem;
}

export interface WorkerReadyMessage extends WorkerMessage {
  type: 'ready';
}

export interface WorkerErrorMessage extends WorkerMessage {
  type: 'error';
  data: {
    message: string;
    chunkId?: number;
  };
}

export interface WorkerTranscriptionCompleteMessage extends WorkerMessage {
  type: 'transcription-complete';
  data: {
    text: string;
    chunkId: number;
  };
}

export type PendingTranscription = {
  resolve: (result: { text: string }) => void;
  reject: (error: Error) => void;
  timestamp: number;
};