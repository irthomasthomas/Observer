import { ModelSize, LanguageType, ModelConfig } from '../utils/whisper/types';

export interface ModelInfo {
  size: ModelSize;
  description: string;
  approximateSize: string;
  speed: 'Very Fast' | 'Fast' | 'Medium' | 'Slow';
  accuracy: 'Basic' | 'Good' | 'Better' | 'Best';
}

export const AVAILABLE_MODELS: ModelInfo[] = [
  {
    size: 'tiny',
    description: 'Fastest, lowest accuracy',
    approximateSize: '~39MB',
    speed: 'Very Fast',
    accuracy: 'Basic'
  },
  {
    size: 'base',
    description: 'Balanced speed and accuracy',
    approximateSize: '~74MB', 
    speed: 'Fast',
    accuracy: 'Good'
  },
  {
    size: 'small',
    description: 'Better accuracy, slower',
    approximateSize: '~244MB',
    speed: 'Medium', 
    accuracy: 'Better'
  },
  {
    size: 'medium',
    description: 'Best accuracy, slowest',
    approximateSize: '~769MB',
    speed: 'Slow',
    accuracy: 'Best'
  }
];

export interface LanguageInfo {
  type: LanguageType;
  label: string;
  description: string;
}

export const AVAILABLE_LANGUAGES: LanguageInfo[] = [
  {
    type: 'en',
    label: 'English Only',
    description: 'Optimized for English, better performance'
  },
  {
    type: 'multilingual', 
    label: 'Multilingual',
    description: 'Supports 99+ languages, slightly slower'
  }
];

export function createModelConfig(
  modelSize: ModelSize,
  language: LanguageType,
  quantized: boolean = true
): ModelConfig {
  const modelId = language === 'en' 
    ? `Xenova/whisper-${modelSize}.en`
    : `Xenova/whisper-${modelSize}`;

  return {
    modelSize,
    language,
    quantized,
    modelId
  };
}

export function getModelInfo(modelSize: ModelSize): ModelInfo {
  const info = AVAILABLE_MODELS.find(m => m.size === modelSize);
  if (!info) {
    throw new Error(`Unknown model size: ${modelSize}`);
  }
  return info;
}

export function getLanguageInfo(language: LanguageType): LanguageInfo {
  const info = AVAILABLE_LANGUAGES.find(l => l.type === language);
  if (!info) {
    throw new Error(`Unknown language type: ${language}`);
  }
  return info;
}