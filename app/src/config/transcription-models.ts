// src/config/transcription-models.ts

/**
 * Defines the structure for a transcription model and lists all models available in the app.
 * This is the "single source of truth" for what models the user can choose from.
 */
export interface TranscriptionModel {
  id: string;          // The unique ID used by Transformers.js (e.g., "Xenova/whisper-tiny.en")
  name: string;        // A user-friendly name for the UI (e.g., "Whisper Tiny (English)")
  size: string;        // A display string for the model's size (e.g., "78 MB")
  language: 'English' | 'Multilingual';
  description: string;
}

export const AVAILABLE_MODELS: TranscriptionModel[] = [
  {
    id: 'Xenova/whisper-tiny.en',
    name: 'Whisper-Tiny (EN)',
    description: 'Fastest – English-only',
    size: '27 MB',
    language: 'English'
  },
  {
    id: 'Xenova/whisper-tiny',
    name: 'Whisper-Tiny',
    description: 'Fastest – multilingual',
    size: '52 MB',
    language: 'Multilingual'
  },
  {
    id: 'Xenova/whisper-base',
    name: 'Whisper-Base',
    description: 'Balanced speed / accuracy',
    size: '74 MB',
    language: 'Multilingual'
  },
  {
    id: 'Xenova/whisper-small.en',
    name: 'Whisper-Small (EN)',
    description: 'Higher accuracy – English-only',
    size: '244 MB',
    language: 'English'
  }
];
