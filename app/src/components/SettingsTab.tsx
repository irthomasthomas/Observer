import React, { useState } from 'react';
import { Settings } from 'lucide-react';
import { Logger } from '../utils/logging';
import { SensorSettings } from '../utils/settings';

// --- NEW IMPORTS ---
// 1. Import the new, simple config service and its types.
import { TranscriptionConfigService, TranscriptionConfig } from '../utils/transcriptionModelManager';
// 2. Import the list of available models and languages you have defined elsewhere.
import { AVAILABLE_MODELS } from '../config/transcription-models';
import { AVAILABLE_OCR_LANGUAGES } from '../config/ocr-languages';

// List of languages supported by the multilingual models.
const SUPPORTED_TRANSCRIPTION_LANGUAGES = [
  { value: 'english', label: 'English' },
  { value: 'spanish', label: 'Spanish' },
  { value: 'french', label: 'French' },
  { value: 'german', label: 'German' },
  { value: 'italian', label: 'Italian' },
  { value: 'chinese', label: 'Chinese' },
  { value: 'japanese', label: 'Japanese' },
  { value: 'korean', label: 'Korean' },
];

// Reusable Card Component
const SettingsCard: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div className="bg-white shadow-md rounded-lg mb-6">
    <div className="p-4 border-b">
      <h3 className="text-lg font-semibold flex items-center">
        <Settings className="h-5 w-5 mr-2 text-gray-500" />
        {title}
      </h3>
    </div>
    <div className="p-6">{children}</div>
  </div>
);

const SettingsTab = () => {
  // --- STATE MANAGEMENT (Simplified) ---
  const [ocrLang, setOcrLang] = useState(SensorSettings.getOcrLanguage());
  const [ocrConfidence, setOcrConfidence] = useState(SensorSettings.getOcrConfidenceThreshold());
  const [chunkDuration, setChunkDuration] = useState(SensorSettings.getTranscriptionChunkDuration());

  // The entire state for transcription is now managed by a single config object,
  // initialized directly from our simple service.
  const [transcriptionConfig, setTranscriptionConfig] = useState<TranscriptionConfig>(
    TranscriptionConfigService.getConfig()
  );

  // --- HANDLER FUNCTIONS ---
  const handleOcrLangChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newLang = e.target.value;
    setOcrLang(newLang);
    SensorSettings.setOcrLanguage(newLang);
  };
  
  const handleOcrConfidenceChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newConfidence = parseInt(e.target.value, 10);
    setOcrConfidence(newConfidence);
    SensorSettings.setOcrConfidenceThreshold(newConfidence);
  };
  
  const handleChunkDurationChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newDuration = parseInt(e.target.value, 10);
    setChunkDuration(newDuration);
    SensorSettings.setTranscriptionChunkDuration(newDuration);
  };

  // This single, unified handler updates the transcription configuration.
  const handleTranscriptionConfigChange = (newConfigPart: Partial<TranscriptionConfig>) => {
    // Merge with existing state to form the new configuration
    const newConfig = { ...transcriptionConfig, ...newConfigPart };

    // Business Rule: If a model is English-only, force the language to English.
    if (newConfig.model.endsWith('.en')) {
      newConfig.language = 'english';
    }

    // Update the local state to re-render the UI
    setTranscriptionConfig(newConfig);
    // Persist the user's choice for future sessions
    TranscriptionConfigService.setConfig(newConfig);
    Logger.info('SETTINGS', `Transcription config updated: ${JSON.stringify(newConfig)}`);
  };

  return (
    <div className="space-y-8">
      <h1 className="text-3xl font-bold text-gray-800">Application Settings</h1>

      <SettingsCard title="Screen OCR Settings">
        <div className="space-y-4">
          <div>
            <label htmlFor="ocr-lang" className="block text-sm font-medium text-gray-700">Recognition Language</label>
            <select id="ocr-lang" value={ocrLang} onChange={handleOcrLangChange} className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md">
            {AVAILABLE_OCR_LANGUAGES.map(lang => <option key={lang.code} value={lang.code}>{lang.label}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="ocr-confidence" className="block text-sm font-medium text-gray-700">Minimum Confidence ({ocrConfidence}%)</label>
            <input type="range" id="ocr-confidence" min="0" max="100" value={ocrConfidence} onChange={handleOcrConfidenceChange} className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer" />
          </div>
        </div>
      </SettingsCard>

      <SettingsCard title="Microphone & System Audio Transcription">
        <p className="text-sm text-gray-600 mb-4">Select the model and language for transcription. The model will be downloaded automatically on first use if not cached.</p>
        
        <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">Transcription Model</label>
            <div className="space-y-3">
            {AVAILABLE_MODELS.map(model => (
                <div key={model.id} className="flex items-center justify-between p-3 border rounded-lg">
                    <div className="flex items-center">
                        <input
                            id={model.id}
                            type="radio"
                            name="active-model"
                            checked={transcriptionConfig.model === model.id}
                            onChange={() => handleTranscriptionConfigChange({ model: model.id })}
                            className="h-4 w-4 text-blue-600 border-gray-300 focus:ring-blue-500"
                        />
                        <div className="ml-3 text-sm">
                            <label htmlFor={model.id} className="font-medium text-gray-900">{model.name} <span className="text-gray-500">({model.size})</span></label>
                            <p className="text-gray-500">{model.description}</p>
                        </div>
                    </div>
                </div>
            ))}
            </div>
        </div>

        <div>
          <label htmlFor="speech-lang" className="block text-sm font-medium text-gray-700">Spoken Language</label>
          <select 
            id="speech-lang" 
            value={transcriptionConfig.language} 
            onChange={(e) => handleTranscriptionConfigChange({ language: e.target.value })} 
            disabled={transcriptionConfig.model.endsWith('.en')}
            className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md disabled:bg-gray-100 disabled:cursor-not-allowed"
          >
            {SUPPORTED_TRANSCRIPTION_LANGUAGES.map(lang => <option key={lang.value} value={lang.value}>{lang.label}</option>)}
          </select>
           {transcriptionConfig.model.endsWith('.en') && (
            <p className="text-xs text-gray-500 mt-1">Language is automatically set to English for this model.</p>
          )}
        </div>
      </SettingsCard>
      
      <SettingsCard title="Advanced Settings">
        <div className="space-y-4">
          <div>
            <label htmlFor="chunk-duration" className="block text-sm font-medium text-gray-700">Transcription Chunk Duration ({chunkDuration/1000}s)</label>
            <p className="text-xs text-gray-500 mb-2">Shorter duration gives faster results but may be less accurate. Affects microphone agents.</p>
            <input type="range" id="chunk-duration" min="2000" max="30000" step="1000" value={chunkDuration} onChange={handleChunkDurationChange} className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer" />
          </div>
        </div>
      </SettingsCard>
    </div>
  );
};

export default SettingsTab;
