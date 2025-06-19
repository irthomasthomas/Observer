// src/components/SettingsTab.tsx

import React, { useState, useEffect, useCallback } from 'react';
import { SensorSettings } from '../utils/settings';
import { 
  TranscriptionModelManager, 
  CombinedTranscriptionModel 
} from '../utils/transcriptionModelManager';
import { Logger } from '../utils/logging';
import { Download, CheckCircle, Loader, AlertTriangle, Settings } from 'lucide-react';
import { AVAILABLE_OCR_LANGUAGES } from '../config/ocr-languages';




const SPEECH_REC_LANGUAGES = [
  { value: 'en-US', label: 'English (US)' },
  { value: 'es-ES', label: 'Spanish (Spain)' },
  { value: 'fr-FR', label: 'French (France)' },
  { value: 'de-DE', label: 'German (Germany)' },
  { value: 'it-IT', label: 'Italian (Italy)' },
  { value: 'zh-CN', label: 'Chinese (Simplified)'},
  { value: 'zh-TW', label: 'Chinese (Traditional)'},
];


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
  // --- STATE MANAGEMENT ---
  const [ocrLang, setOcrLang] = useState(SensorSettings.getOcrLanguage());
  const [ocrConfidence, setOcrConfidence] = useState(SensorSettings.getOcrConfidenceThreshold());
  const [speechLang, setSpeechLang] = useState(SensorSettings.getSpeechRecognitionLanguage());
  
  const [models, setModels] = useState<CombinedTranscriptionModel[]>([]);
  const [activeModelId, setActiveModelId] = useState(SensorSettings.getActiveModelId());
  const [downloadingModelId, setDownloadingModelId] = useState<string | null>(null);
  
  const [chunkDuration, setChunkDuration] = useState(SensorSettings.getTranscriptionChunkDuration());
  const [allowCaching, setAllowCaching] = useState(SensorSettings.getAllowLocalModelCaching());

  // --- DATA FETCHING ---
  const refreshModels = useCallback(() => {
    const modelData = TranscriptionModelManager.getCombinedModels();
    setModels(modelData);
    Logger.debug('SETTINGS', 'Refreshed model list from manager.');
  }, []);

  useEffect(() => {
    Logger.info('SETTINGS', 'SettingsTab mounted, loading initial state.');
    refreshModels();
  }, [refreshModels]);

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
  
  const handleSpeechLangChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newLang = e.target.value;
    setSpeechLang(newLang);
    SensorSettings.setSpeechRecognitionLanguage(newLang);
  };
  
  const handleActiveModelChange = (modelId: string) => {
    setActiveModelId(modelId);
    TranscriptionModelManager.setActiveModel(modelId);
  };
  
  const handleDownloadClick = async (modelId: string) => {
    setDownloadingModelId(modelId);
    Logger.info('SETTINGS', `User initiated download for model: ${modelId}`);
    try {
      await TranscriptionModelManager.downloadModel(modelId, (progress) => {
        // You could use this callback to update a progress bar in the future
        console.log(`Download progress for ${modelId}:`, progress);
      });
    } catch (error) {
      Logger.error('SETTINGS', `Failed to download ${modelId}`, error);
    } finally {
      setDownloadingModelId(null);
      refreshModels(); // Refresh the list to show the new 'downloaded' or 'error' status
    }
  };

  const handleChunkDurationChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newDuration = parseInt(e.target.value, 10);
    setChunkDuration(newDuration);
    SensorSettings.setTranscriptionChunkDuration(newDuration);
  };

  const handleAllowCachingChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newAllow = e.target.checked;
    setAllowCaching(newAllow);
    SensorSettings.setAllowLocalModelCaching(newAllow);
  };

  return (
    <div className="space-y-8">
      <h1 className="text-3xl font-bold text-gray-800">Application Settings</h1>

      {/* --- OCR SETTINGS --- */}
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

      {/* --- SPEECH INPUT SETTINGS --- */}
      <SettingsCard title="Microphone Speech Input Settings">
        <div>
          <label htmlFor="speech-lang" className="block text-sm font-medium text-gray-700">Spoken Language</label>
          <select id="speech-lang" value={speechLang} onChange={handleSpeechLangChange} className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md">
            {SPEECH_REC_LANGUAGES.map(lang => <option key={lang.value} value={lang.value}>{lang.label}</option>)}
          </select>
        </div>
      </SettingsCard>

      {/* --- SYSTEM AUDIO TRANSCRIPTION SETTINGS --- */}
      <SettingsCard title="System Audio Transcription Settings">
        <p className="text-sm text-gray-600 mb-4">Select the model used for transcribing system audio. Larger models are more accurate but require a one-time download.</p>
        <div className="space-y-4">
          {models.map(model => (
            <div key={model.id} className="flex items-center justify-between p-3 border rounded-lg">
              <div className="flex items-center">
                <input
                  id={model.id}
                  type="radio"
                  name="active-model"
                  checked={activeModelId === model.id}
                  onChange={() => handleActiveModelChange(model.id)}
                  className="h-4 w-4 text-blue-600 border-gray-300 focus:ring-blue-500"
                />
                <div className="ml-3 text-sm">
                  <label htmlFor={model.id} className="font-medium text-gray-900">{model.name} <span className="text-gray-500">({model.size})</span></label>
                  <p className="text-gray-500">{model.description}</p>
                </div>
              </div>
              <div className="w-32 text-right">
                {model.status === 'downloaded' ? (
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                    <CheckCircle className="h-4 w-4 mr-1"/> Downloaded
                  </span>
                ) : downloadingModelId === model.id ? (
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                    <Loader className="h-4 w-4 mr-1 animate-spin"/> Downloading...
                  </span>
                ) : model.status === 'error' ? (
                   <button onClick={() => handleDownloadClick(model.id)} className="inline-flex items-center px-3 py-1 border border-transparent text-xs font-medium rounded-md shadow-sm text-white bg-red-600 hover:bg-red-700">
                    <AlertTriangle className="h-4 w-4 mr-1"/> Retry
                  </button>
                ) : (
                  <button onClick={() => handleDownloadClick(model.id)} className="inline-flex items-center px-3 py-1 border border-transparent text-xs font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700">
                    <Download className="h-4 w-4 mr-1"/> Download
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </SettingsCard>
      
      {/* --- ADVANCED SETTINGS --- */}
      <SettingsCard title="Advanced Settings">
        <div className="space-y-4">
          <div>
            <label htmlFor="chunk-duration" className="block text-sm font-medium text-gray-700">Transcription Chunk Duration ({chunkDuration/1000}s)</label>
            <p className="text-xs text-gray-500 mb-2">Shorter duration gives faster results but may be less accurate.</p>
            <input type="range" id="chunk-duration" min="2000" max="30000" step="1000" value={chunkDuration} onChange={handleChunkDurationChange} className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer" />
          </div>
          <div className="flex items-center">
            <input type="checkbox" id="allow-caching" checked={allowCaching} onChange={handleAllowCachingChange} className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"/>
            <label htmlFor="allow-caching" className="ml-2 block text-sm text-gray-900">Allow local model caching in browser</label>
          </div>
        </div>
      </SettingsCard>
    </div>
  );
};

export default SettingsTab;
