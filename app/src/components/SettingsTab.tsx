import React, { useState, useRef, useEffect } from 'react';
import { Settings, TestTube2, Play, Download, Loader2, FileDown, CheckCircle2, Database, Trash2 } from 'lucide-react';
import { SensorSettings } from '../utils/settings';

// New Whisper imports
import { WhisperModelManager } from '../utils/whisper/WhisperModelManager';
import { WhisperTranscriptionService } from '../utils/whisper/WhisperTranscriptionService';
import { TranscriptionChunk, WhisperModelState, ModelSize, LanguageType } from '../utils/whisper/types';
import { AVAILABLE_MODELS, AVAILABLE_LANGUAGES, getModelInfo } from '../config/whisper-models';
import { StreamManager } from '../utils/streamManager';

import { AVAILABLE_OCR_LANGUAGES } from '../config/ocr-languages';




// Reusable Card Component (Your existing component)
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
  // --- OCR State Management (Existing) ---
  const [ocrLang, setOcrLang] = useState(SensorSettings.getOcrLanguage());
  const [ocrConfidence, setOcrConfidence] = useState(SensorSettings.getOcrConfidenceThreshold());

  // --- OCR Handler Functions (Existing) ---
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
  

  // --- NEW WHISPER STATE ---
  const [whisperSettings, setWhisperSettings] = useState(SensorSettings.getWhisperSettings());
  const [modelState, setModelState] = useState<WhisperModelState | null>(null);
  const [isTestRunning, setIsTestRunning] = useState(false);
  const [auditTrail, setAuditTrail] = useState<TranscriptionChunk[]>([]);
  const [transcriptionService, setTranscriptionService] = useState<WhisperTranscriptionService | null>(null);
  
  // Ref for the hidden audio player
  const audioPlayerRef = useRef<HTMLAudioElement>(null);

  // Model manager instance
  const modelManager = WhisperModelManager.getInstance();

  // Subscribe to model state changes
  useEffect(() => {
    const unsubscribe = modelManager.onStateChange(setModelState);
    setModelState(modelManager.getState());
    return unsubscribe;
  }, [modelManager]);


  // --- NEW WHISPER HANDLERS ---

  const handleModelSizeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newSize = e.target.value as ModelSize;
    const newSettings = { ...whisperSettings, modelSize: newSize };
    setWhisperSettings(newSettings);
    SensorSettings.setWhisperModelSize(newSize);
  };

  const handleLanguageChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newLanguage = e.target.value as LanguageType;
    const newSettings = { ...whisperSettings, language: newLanguage };
    setWhisperSettings(newSettings);
    SensorSettings.setWhisperLanguage(newLanguage);
  };

  const handleChunkDurationChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newDuration = parseInt(e.target.value, 10);
    const newSettings = { ...whisperSettings, chunkDurationMs: newDuration };
    setWhisperSettings(newSettings);
    SensorSettings.setWhisperChunkDuration(newDuration);
  };

  const handleLoadModel = async () => {
    try {
      await modelManager.loadModel();
    } catch (error) {
      console.error('Failed to load model:', error);
      alert(`Failed to load model: ${error}`);
    }
  };

  const handleUnloadModel = () => {
    if (isTestRunning) {
      handleStopTest();
    }
    modelManager.unloadModel();
  };


  const handleStartTest = async () => {
    if (!modelManager.isReady()) {
      alert('Please load a model first');
      return;
    }

    try {
      await StreamManager.requestStreamsForAgent('system-whisper-test', ['microphone']);
      const state = StreamManager.getCurrentState();
      
      if (state.microphoneStream) {
        setAuditTrail([]);
        const newService = new WhisperTranscriptionService();
        
        const onChunkProcessedCallback = (chunk: TranscriptionChunk) => {
          setAuditTrail(prev => [...prev, chunk].sort((a, b) => a.id - b.id));
        };

        await newService.start(state.microphoneStream, onChunkProcessedCallback);
        setTranscriptionService(newService);
        setIsTestRunning(true);
      } else {
        alert('Could not get microphone stream. Please ensure microphone permissions are granted.');
      }
    } catch (error) {
      console.error('Failed to start transcription test:', error);
      alert(`Failed to start test: ${error}`);
    }
  };

  const handleStopTest = () => {
    transcriptionService?.stop();
    setTranscriptionService(null);
    setIsTestRunning(false);
    StreamManager.releaseStreamsForAgent('system-whisper-test');
  };

  // Handler to play an audio chunk from the audit trail
  const playChunk = (blob: Blob) => {
      if (audioPlayerRef.current) {
          const url = URL.createObjectURL(blob);
          audioPlayerRef.current.src = url;
          audioPlayerRef.current.play();
          audioPlayerRef.current.onended = () => {
            URL.revokeObjectURL(url); // Clean up the object URL after playback
          };
      }
  };

  // Handler to download an audio chunk from the audit trail
  const downloadChunk = (blob: Blob, id: number) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `observer_chunk_${id}.webm`; // Assuming MediaRecorder defaults to webm
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url); // Clean up the object URL
  };


  return (
    <div className="space-y-8">
      <h1 className="text-3xl font-bold text-gray-800">Application Settings</h1>

      {/* --- Existing Screen OCR Settings Card --- */}
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

      {/* --- NEW Whisper Model Management Card --- */}
      <SettingsCard title="Whisper Speech Recognition">
        <div className="space-y-6">
          {/* Model Configuration */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="model-size" className="block text-sm font-medium text-gray-700 mb-2">
                Model Size
              </label>
              <select
                id="model-size"
                value={whisperSettings.modelSize}
                onChange={handleModelSizeChange}
                disabled={modelState?.status === 'loading' || modelState?.status === 'loaded'}
                className="block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md disabled:bg-gray-100"
              >
                {AVAILABLE_MODELS.map(model => (
                  <option key={model.size} value={model.size}>
                    {model.size.charAt(0).toUpperCase() + model.size.slice(1)} - {model.approximateSize} ({model.speed})
                  </option>
                ))}
              </select>
              {whisperSettings.modelSize && (
                <p className="text-xs text-gray-500 mt-1">
                  {getModelInfo(whisperSettings.modelSize).description}
                </p>
              )}
            </div>
            
            <div>
              <label htmlFor="language" className="block text-sm font-medium text-gray-700 mb-2">
                Language
              </label>
              <select
                id="language"
                value={whisperSettings.language}
                onChange={handleLanguageChange}
                disabled={modelState?.status === 'loading' || modelState?.status === 'loaded'}
                className="block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md disabled:bg-gray-100"
              >
                {AVAILABLE_LANGUAGES.map(lang => (
                  <option key={lang.type} value={lang.type}>
                    {lang.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Chunk Duration */}
          <div>
            <label htmlFor="chunk-duration" className="block text-sm font-medium text-gray-700 mb-2">
              Chunk Duration ({Math.round(whisperSettings.chunkDurationMs / 1000)}s)
            </label>
            <input 
              type="range" 
              id="chunk-duration" 
              min="5000" 
              max="60000" 
              step="5000"
              value={whisperSettings.chunkDurationMs} 
              onChange={handleChunkDurationChange}
              disabled={isTestRunning}
              className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer disabled:cursor-not-allowed" 
            />
            <div className="flex justify-between text-xs text-gray-500 mt-1">
              <span>5s</span>
              <span>30s</span>
              <span>60s</span>
            </div>
          </div>

          {/* Model Management Buttons */}
          <div className="flex items-center space-x-4">
            <button
              onClick={handleLoadModel}
              disabled={modelState?.status === 'loading' || modelState?.status === 'loaded'}
              className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center transition-all"
            >
              {modelState?.status === 'loading' ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : modelState?.status === 'loaded' ? (
                <CheckCircle2 className="mr-2 h-4 w-4" />
              ) : (
                <Database className="mr-2 h-4 w-4" />
              )}
              {modelState?.status === 'loading' ? 'Loading...' : modelState?.status === 'loaded' ? 'Model Loaded' : 'Load Model'}
            </button>
            
            {modelState?.status === 'loaded' && (
              <button
                onClick={handleUnloadModel}
                className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 flex items-center transition-all"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Unload Model
              </button>
            )}
            
            <button
              onClick={isTestRunning ? handleStopTest : handleStartTest}
              disabled={modelState?.status !== 'loaded'}
              className={`px-4 py-2 rounded-md text-white flex items-center transition-all disabled:bg-gray-400 disabled:cursor-not-allowed ${
                isTestRunning ? 'bg-red-600 hover:bg-red-700' : 'bg-green-600 hover:bg-green-700'
              }`}
            >
              <TestTube2 className="mr-2 h-4 w-4" />
              {isTestRunning ? 'Stop Test' : 'Start Test'}
            </button>
          </div>

          {/* Model Loading Progress */}
          {modelState?.status === 'loading' && modelState.progress.length > 0 && (
            <div className="space-y-3 pt-2">
              <h4 className="text-md font-semibold text-gray-700">
                Loading Model: {modelState.config?.modelId}
              </h4>
              {modelState.progress.map((item) => (
                <div key={item.file}>
                  <div className="flex justify-between items-center text-sm mb-1">
                    <span className="text-gray-600 flex items-center">
                      {item.status === 'done' 
                        ? <CheckCircle2 className="h-4 w-4 text-green-500 mr-2"/>
                        : <FileDown className="h-4 w-4 text-gray-400 mr-2"/>
                      }
                      {item.file}
                    </span>
                    <span className="font-medium text-gray-500">
                      {item.status === 'done' ? 'Done' : `${Math.round(item.progress)}%`}
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className={`h-2 rounded-full transition-all duration-300 ${
                        item.status === 'done' ? 'bg-green-500' : 'bg-blue-600'
                      }`}
                      style={{ width: `${item.progress}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Error Display */}
          {modelState?.error && (
            <div className="bg-red-50 border border-red-200 rounded-md p-3">
              <p className="text-sm text-red-800">
                <strong>Error:</strong> {modelState.error}
              </p>
            </div>
          )}

          {/* Transcription Results */}
          <div>
            <h4 className="text-md font-semibold text-gray-700 mb-2">Live Transcription</h4>
            <div className="border rounded-lg p-4 bg-gray-50 max-h-96 overflow-y-auto">
              {auditTrail.length === 0 ? (
                <p className="text-sm text-gray-500 text-center py-4">
                  {isTestRunning ? 'Listening... Speak into your microphone.' : 'Start a test to see transcription results here.'}
                </p>
              ) : (
                <div className="space-y-2">
                  {auditTrail.map((chunk) => (
                    <div key={chunk.id} className="bg-white p-3 rounded-md shadow-sm border flex justify-between items-center">
                      <div className="flex-1">
                        <p className="font-mono text-sm font-semibold">Chunk #{chunk.id}</p>
                        <p className="text-gray-800 italic mt-1">"{chunk.text || '...'}"</p>
                      </div>
                      <div className="flex items-center space-x-2 ml-4">
                        <button 
                          onClick={() => playChunk(chunk.blob)} 
                          title="Play Audio" 
                          className="p-2 rounded-full hover:bg-gray-100 text-gray-600"
                        >
                          <Play className="h-5 w-5"/>
                        </button>
                        <button 
                          onClick={() => downloadChunk(chunk.blob, chunk.id)} 
                          title="Download Audio" 
                          className="p-2 rounded-full hover:bg-gray-100 text-gray-600"
                        >
                          <Download className="h-5 w-5"/>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          
          {/* Hidden audio player for playback */}
          <audio ref={audioPlayerRef} className="hidden" controls={false}></audio>
        </div>
      </SettingsCard>
    </div>
  );
};

export default SettingsTab;
