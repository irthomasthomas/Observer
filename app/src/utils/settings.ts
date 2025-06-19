// src/utils/settings.ts
import { AVAILABLE_MODELS } from "../config/transcription-models";

export type ModelStatus = 'not_downloaded' | 'downloading' | 'downloaded' | 'error';

class SettingsManager {
    // --- PRIVATE CONSTANTS FOR LOCALSTORAGE KEYS ---

    // OCR
    private readonly OCR_CONFIDENCE_KEY = 'observer-ai:settings:ocrConfidenceThreshold';
    private readonly OCR_WORKER_PATH_KEY = 'observer-ai:settings:ocrWorkerPath';
    private readonly OCR_LANG_PATH_KEY = 'observer-ai:settings:ocrLangPath';
    private readonly OCR_CORE_PATH_KEY = 'observer-ai:settings:ocrCorePath';
    private readonly OCR_LANGUAGE_KEY = 'observer-ai:settings:ocrLanguage';
    
    // Speech Recognition
    private readonly SPEECH_RECOGNITION_LANG_KEY = 'observer-ai:settings:speechRecognitionLanguage';

    // Transcription Models
    private readonly TRANSCRIPTION_CHUNK_KEY = 'observer-ai:settings:transcriptionChunkDuration';
    private readonly TRANSCRIPTION_CACHE_KEY = 'observer-ai:settings:transcriptionLocalCache';
    private readonly TRANSCRIPTION_ACTIVE_MODEL_ID_KEY = 'observer-ai:settings:transcriptionActiveModelId';
    private readonly TRANSCRIPTION_MODEL_STATUSES_KEY = 'observer-ai:settings:transcriptionModelStatuses';

    // --- SENSIBLE DEFAULTS ---
    private readonly DEFAULTS = {
        // OCR
        ocrConfidenceThreshold: 50,
        ocrWorkerPath: 'https://unpkg.com/tesseract.js@6.0.0/dist/worker.min.js',
        ocrLangPath: 'https://tessdata.projectnaptha.com/4.0.0',
        ocrCorePath: 'https://unpkg.com/tesseract.js-core@4.0.2/tesseract-core.wasm.js',
        ocrLanguage: 'eng',
        // Speech Recognition
        speechRecognitionLanguage: 'en-US',
        // Transcription
        transcriptionChunkDuration: 10000,
        allowLocalModelCaching: true,
        activeModelId: AVAILABLE_MODELS[0].id,
        modelStatuses: {} as { [modelId: string]: ModelStatus },
    };

    // --- GETTER AND SETTER FUNCTIONS ---

    // Tesseract.js - OCR
    public getOcrConfidenceThreshold(): number {
        const stored = localStorage.getItem(this.OCR_CONFIDENCE_KEY);
        return stored ? parseFloat(stored) : this.DEFAULTS.ocrConfidenceThreshold;
    }
    public setOcrConfidenceThreshold(value: number): void {
        localStorage.setItem(this.OCR_CONFIDENCE_KEY, String(value));
    }
    public getOcrWorkerPath(): string {
        return localStorage.getItem(this.OCR_WORKER_PATH_KEY) ?? this.DEFAULTS.ocrWorkerPath;
    }
    public setOcrWorkerPath(value: string): void {
        localStorage.setItem(this.OCR_WORKER_PATH_KEY, value);
    }
    public getOcrLangPath(): string {
        return localStorage.getItem(this.OCR_LANG_PATH_KEY) ?? this.DEFAULTS.ocrLangPath;
    }
    public setOcrLangPath(value: string): void {
        localStorage.setItem(this.OCR_LANG_PATH_KEY, value);
    }
    public getOcrCorePath(): string {
        return localStorage.getItem(this.OCR_CORE_PATH_KEY) ?? this.DEFAULTS.ocrCorePath;
    }
    public setOcrCorePath(value: string): void {
        localStorage.setItem(this.OCR_CORE_PATH_KEY, value);
    }
    public getOcrLanguage(): string {
        return localStorage.getItem(this.OCR_LANGUAGE_KEY) ?? this.DEFAULTS.ocrLanguage;
    }
    public setOcrLanguage(value: string): void {
        localStorage.setItem(this.OCR_LANGUAGE_KEY, value);
    }

    // Browser SpeechRecognition API
    public getSpeechRecognitionLanguage(): string {
        return localStorage.getItem(this.SPEECH_RECOGNITION_LANG_KEY) ?? this.DEFAULTS.speechRecognitionLanguage;
    }
    public setSpeechRecognitionLanguage(value: string): void {
        localStorage.setItem(this.SPEECH_RECOGNITION_LANG_KEY, value);
    }

    // Xenova/Transformers.js - Audio Transcription
    public getTranscriptionChunkDuration(): number {
        const stored = localStorage.getItem(this.TRANSCRIPTION_CHUNK_KEY);
        return stored ? parseInt(stored, 10) : this.DEFAULTS.transcriptionChunkDuration;
    }
    public setTranscriptionChunkDuration(value: number): void {
        localStorage.setItem(this.TRANSCRIPTION_CHUNK_KEY, String(value));
    }
    public getAllowLocalModelCaching(): boolean {
        const stored = localStorage.getItem(this.TRANSCRIPTION_CACHE_KEY);
        return stored ? JSON.parse(stored) : this.DEFAULTS.allowLocalModelCaching;
    }
    public setAllowLocalModelCaching(value: boolean): void {
        localStorage.setItem(this.TRANSCRIPTION_CACHE_KEY, JSON.stringify(value));
    }
    public getActiveModelId(): string {
        return localStorage.getItem(this.TRANSCRIPTION_ACTIVE_MODEL_ID_KEY) ?? this.DEFAULTS.activeModelId;
    }
    public setActiveModelId(modelId: string): void {
        localStorage.setItem(this.TRANSCRIPTION_ACTIVE_MODEL_ID_KEY, modelId);
    }
    public getModelStatuses(): { [modelId: string]: ModelStatus } {
        const stored = localStorage.getItem(this.TRANSCRIPTION_MODEL_STATUSES_KEY);
        return stored ? JSON.parse(stored) : this.DEFAULTS.modelStatuses;
    }
    public setModelStatuses(statuses: { [modelId: string]: ModelStatus }): void {
        localStorage.setItem(this.TRANSCRIPTION_MODEL_STATUSES_KEY, JSON.stringify(statuses));
    }
}

// Export a single instance
export const SensorSettings = new SettingsManager();
