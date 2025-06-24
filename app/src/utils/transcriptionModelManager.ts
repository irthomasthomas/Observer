// src/utils/transcriptionConfig.ts

export interface TranscriptionConfig {
  model: string;
  language: string;
  task: 'transcribe' | 'translate';
}

// Define your available configurations
export const ENGLISH_CONFIG: TranscriptionConfig = {
  model: 'Xenova/whisper-tiny.en',
  language: 'english',
  task: 'transcribe'
};

export const FRENCH_CONFIG: TranscriptionConfig = {
  model: 'Xenova/whisper-small',
  language: 'french',
  task: 'transcribe'
};

const CONFIG_STORAGE_KEY = 'observer-transcription-config';

class ConfigManager {
  
  // Sets the user's choice in localStorage
  setConfig(config: TranscriptionConfig): void {
    localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(config));
  }

  // Gets the user's choice, defaulting to English
  getConfig(): TranscriptionConfig {
    const storedConfig = localStorage.getItem(CONFIG_STORAGE_KEY);
    if (storedConfig) {
      return JSON.parse(storedConfig);
    }
    return ENGLISH_CONFIG; // Default to tiny English model
  }
}

// Export a single instance for the app to use
export const TranscriptionConfigService = new ConfigManager();
