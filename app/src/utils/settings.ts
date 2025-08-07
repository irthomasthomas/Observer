// src/utils/settings.ts

// NOTE: No imports are needed from your config files anymore.
import { WhisperSettings, ModelSize, LanguageType } from './whisper/types';

class SettingsManager {
    // --- PRIVATE CONSTANTS FOR LOCALSTORAGE KEYS ---
    private readonly OCR_CONFIDENCE_KEY = 'observer-ai:settings:ocrConfidenceThreshold';
    private readonly OCR_WORKER_PATH_KEY = 'observer-ai:settings:ocrWorkerPath';
    private readonly OCR_LANG_PATH_KEY = 'observer-ai:settings:ocrLangPath';
    private readonly OCR_CORE_PATH_KEY = 'observer-ai:settings:ocrCorePath';
    private readonly OCR_LANGUAGE_KEY = 'observer-ai:settings:ocrLanguage';
    
    // --- WHISPER SETTINGS KEYS ---
    private readonly WHISPER_SETTINGS_KEY = 'observer-ai:settings:whisperSettings';

    // --- SENSIBLE DEFAULTS ---
    private readonly DEFAULTS = {
        ocrConfidenceThreshold: 50,
        ocrWorkerPath: 'https://unpkg.com/tesseract.js@6.0.0/dist/worker.min.js',
        ocrLangPath: 'https://tessdata.projectnaptha.com/4.0.0',
        ocrCorePath: 'https://unpkg.com/tesseract.js-core@4.0.2/tesseract-core.wasm.js',
        ocrLanguage: 'eng',
        whisperSettings: {
            modelSize: 'tiny' as ModelSize,
            language: 'en' as LanguageType,
            quantized: true,
            chunkDurationMs: 15000
        } as WhisperSettings
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

    // Whisper Settings
    public getWhisperSettings(): WhisperSettings {
        const stored = localStorage.getItem(this.WHISPER_SETTINGS_KEY);
        if (stored) {
            try {
                const parsed = JSON.parse(stored);
                return { ...this.DEFAULTS.whisperSettings, ...parsed };
            } catch (error) {
                console.warn('Failed to parse whisper settings, using defaults:', error);
                return this.DEFAULTS.whisperSettings;
            }
        }
        return this.DEFAULTS.whisperSettings;
    }

    public setWhisperSettings(settings: WhisperSettings): void {
        localStorage.setItem(this.WHISPER_SETTINGS_KEY, JSON.stringify(settings));
    }

    public setWhisperModelSize(modelSize: ModelSize): void {
        const settings = this.getWhisperSettings();
        settings.modelSize = modelSize;
        this.setWhisperSettings(settings);
    }

    public setWhisperLanguage(language: LanguageType): void {
        const settings = this.getWhisperSettings();
        settings.language = language;
        this.setWhisperSettings(settings);
    }

    public setWhisperQuantized(quantized: boolean): void {
        const settings = this.getWhisperSettings();
        settings.quantized = quantized;
        this.setWhisperSettings(settings);
    }

    public setWhisperChunkDuration(durationMs: number): void {
        if (durationMs < 5000 || durationMs > 60000) {
            throw new Error('Chunk duration must be between 5-60 seconds');
        }
        const settings = this.getWhisperSettings();
        settings.chunkDurationMs = durationMs;
        this.setWhisperSettings(settings);
    }
}

// Export a single instance
export const SensorSettings = new SettingsManager();
