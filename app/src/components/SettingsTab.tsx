import React, { useState, useRef, useEffect } from 'react';
import { Settings, TestTube2, Play, Download, Loader2, FileDown, CheckCircle2, Database, Trash2, Camera, Monitor, Zap, ChevronDown, ChevronUp } from 'lucide-react';
import { SensorSettings } from '../utils/settings';

// New Whisper imports
import { WhisperModelManager } from '../utils/whisper/WhisperModelManager';
import { WhisperTranscriptionService } from '../utils/whisper/WhisperTranscriptionService';
import { TranscriptionChunk, WhisperModelState } from '../utils/whisper/types';
import { SUGGESTED_MODELS, LANGUAGE_NAMES } from '../config/whisper-models';

import { AVAILABLE_OCR_LANGUAGES } from '../config/ocr-languages';

// Change Detection imports
import {
  DetectionMode,
  getChangeDetectionMode,
  setChangeDetectionMode,
  getThresholds,
  setTextSimilarityThreshold,
  setDHashSimilarityThreshold,
  setSuspiciousSimilarityThreshold,
  setPixelSimilarityThreshold
} from '../utils/change_detector';




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


// Sensitivity presets for Change Detection
type SensitivityPreset = 'relaxed' | 'balanced' | 'sensitive';

interface PresetConfig {
  textSimilarity: number;
  dhashImageSimilarity: number;
  pixelImageSimilarity: number;
  suspiciousSimilarity: number;
}

const PRESET_CONFIGS: Record<SensitivityPreset, PresetConfig> = {
  relaxed: {
    textSimilarity: 0.85,
    dhashImageSimilarity: 0.85,
    pixelImageSimilarity: 0.90,
    suspiciousSimilarity: 0.999,
  },
  balanced: {
    textSimilarity: 0.90,
    dhashImageSimilarity: 0.90,
    pixelImageSimilarity: 0.95,
    suspiciousSimilarity: 0.998,
  },
  sensitive: {
    textSimilarity: 0.95,
    dhashImageSimilarity: 0.95,
    pixelImageSimilarity: 0.98,
    suspiciousSimilarity: 0.995,
  },
};

// Mode card configuration
interface ModeCardConfig {
  mode: DetectionMode;
  IconComponent: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  bestFor: string[];
  isRecommended?: boolean;
}

const SettingsTab = () => {
  const MODE_CARDS: ModeCardConfig[] = [
    {
      mode: DetectionMode.DHashOnly,
      IconComponent: Camera,
      title: "Camera Feed",
      description: "Handles lighting changes, compression, and movement",
      bestFor: ["Webcams", "Video streams", "Live feeds"],
    },
    {
      mode: DetectionMode.PixelDifferenceOnly,
      IconComponent: Monitor,
      title: "Screen UI",
      description: "Detects pixel-perfect changes in applications",
      bestFor: ["Apps", "Websites", "UI testing"],
    },
    {
      mode: DetectionMode.Hybrid,
      IconComponent: Zap,
      title: "Smart (Auto)",
      description: "Intelligently adapts to what you're monitoring",
      bestFor: ["Mixed content", "Unsure", "General use"],
      isRecommended: true,
    },
  ];

  // --- Change Detection State ---
  const [detectionMode, setDetectionModeState] = useState(getChangeDetectionMode());
  const [thresholds, setThresholds] = useState(getThresholds());
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [currentPreset, setCurrentPreset] = useState<SensitivityPreset>('sensitive');

  // --- OCR State Management (Existing) ---
  const [ocrLang, setOcrLang] = useState(SensorSettings.getOcrLanguage());
  const [ocrConfidence, setOcrConfidence] = useState(SensorSettings.getOcrConfidenceThreshold());

  // Helper function to format transcript duration
  const formatTranscriptDuration = (chunkDurationMs: number, maxChunks: number): string => {
    const totalMs = chunkDurationMs * maxChunks;
    const totalMinutes = Math.floor(totalMs / 60000);
    const totalSeconds = Math.floor((totalMs % 60000) / 1000);

    if (totalMinutes >= 60) {
      const hours = Math.floor(totalMinutes / 60);
      const minutes = totalMinutes % 60;
      return `${hours}h ${minutes}m ${totalSeconds}s`;
    } else if (totalMinutes > 0) {
      return `${totalMinutes}m ${totalSeconds}s`;
    } else {
      return `${totalSeconds}s`;
    }
  };

  // --- Change Detection Handler Functions ---
  const handleModeSelect = (mode: DetectionMode) => {
    setDetectionModeState(mode);
    setChangeDetectionMode(mode);
  };

  const handlePresetSelect = (preset: SensitivityPreset) => {
    setCurrentPreset(preset);
    const config = PRESET_CONFIGS[preset];

    setTextSimilarityThreshold(config.textSimilarity);
    setDHashSimilarityThreshold(config.dhashImageSimilarity);
    setPixelSimilarityThreshold(config.pixelImageSimilarity);
    setSuspiciousSimilarityThreshold(config.suspiciousSimilarity);

    setThresholds(config);
  };

  const handleTextSimilarityChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseFloat(e.target.value);
    setTextSimilarityThreshold(value);
    setThresholds({ ...thresholds, textSimilarity: value });
    setCurrentPreset('balanced');
  };

  const handleDHashSimilarityChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseFloat(e.target.value);
    setDHashSimilarityThreshold(value);
    setThresholds({ ...thresholds, dhashImageSimilarity: value });
    setCurrentPreset('balanced');
  };

  const handleSuspiciousSimilarityChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseFloat(e.target.value);
    setSuspiciousSimilarityThreshold(value);
    setThresholds({ ...thresholds, suspiciousSimilarity: value });
    setCurrentPreset('balanced');
  };

  const handlePixelSimilarityChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseFloat(e.target.value);
    setPixelSimilarityThreshold(value);
    setThresholds({ ...thresholds, pixelImageSimilarity: value });
    setCurrentPreset('balanced');
  };

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


  // --- SIMPLE WHISPER HANDLERS ---

  const handleModelIdChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newSettings = { ...whisperSettings, modelId: e.target.value };
    setWhisperSettings(newSettings);
    SensorSettings.setWhisperModelId(e.target.value);
  };

  const handleTaskChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const task = e.target.value || undefined;
    const newSettings = { ...whisperSettings, task: task as any };
    setWhisperSettings(newSettings);
    SensorSettings.setWhisperTask(task as any);
  };

  const handleLanguageChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const language = e.target.value || undefined;
    const newSettings = { ...whisperSettings, language };
    setWhisperSettings(newSettings);
    SensorSettings.setWhisperLanguage(language);
  };

  const handleQuantizedChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newSettings = { ...whisperSettings, quantized: e.target.checked };
    setWhisperSettings(newSettings);
    SensorSettings.setWhisperQuantized(e.target.checked);
  };

  const handleChunkDurationChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newDuration = parseInt(e.target.value, 10);
    const newSettings = { ...whisperSettings, chunkDurationMs: newDuration };
    setWhisperSettings(newSettings);
    SensorSettings.setWhisperChunkDuration(newDuration);
  };

  const handleMaxChunksToKeepChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newMaxChunks = parseInt(e.target.value, 10);
    const newSettings = { ...whisperSettings, maxChunksToKeep: newMaxChunks };
    setWhisperSettings(newSettings);
    SensorSettings.setWhisperMaxChunksToKeep(newMaxChunks);
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
      // For testing, directly get microphone stream without using StreamManager
      // to avoid creating duplicate transcription services
      const micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      setAuditTrail([]);
      const newService = new WhisperTranscriptionService();
      
      const onChunkProcessedCallback = (chunk: TranscriptionChunk) => {
        setAuditTrail(prev => [...prev, chunk].sort((a, b) => a.id - b.id));
      };

      await newService.start(micStream, onChunkProcessedCallback);
      setTranscriptionService(newService);
      setIsTestRunning(true);
    } catch (error) {
      console.error('Failed to start transcription test:', error);
      alert(`Failed to start test: ${error}`);
    }
  };

  const handleStopTest = () => {
    transcriptionService?.stop();
    setTranscriptionService(null);
    setIsTestRunning(false);
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

      {/* --- Change Detection Settings Card --- */}
      <div className="bg-white shadow-md rounded-lg mb-6">
        <div className="p-4 border-b">
          <h3 className="text-lg font-semibold flex items-center">
            <Settings className="h-5 w-5 mr-2 text-gray-500" />
            Change Detection Settings
          </h3>
        </div>

        <div className="p-6 space-y-8">
          {/* Mode Selection Cards */}
          <div>
            <label className="block text-sm font-medium text-gray-900 mb-4">
              What are you monitoring?
            </label>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {MODE_CARDS.map((card) => (
                <div
                  key={card.mode}
                  onClick={() => handleModeSelect(card.mode)}
                  className={`relative p-4 border-2 rounded-lg cursor-pointer transition-all hover:shadow-md ${
                    detectionMode === card.mode
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 bg-white hover:border-gray-300'
                  }`}
                >
                  {card.isRecommended && (
                    <div className="absolute -top-2 -right-2 bg-green-500 text-white text-xs font-semibold px-2 py-1 rounded-full">
                      Recommended
                    </div>
                  )}
                  <div className="flex flex-col items-center text-center space-y-3">
                    <div className={`${detectionMode === card.mode ? 'text-blue-600' : 'text-gray-500'}`}>
                      <card.IconComponent className="h-8 w-8" />
                    </div>
                    <h4 className="font-semibold text-gray-900">{card.title}</h4>
                    <p className="text-xs text-gray-600">{card.description}</p>
                    <div className="pt-2 border-t border-gray-200 w-full">
                      <p className="text-xs font-medium text-gray-700 mb-1">Best for:</p>
                      <ul className="text-xs text-gray-600 space-y-1">
                        {card.bestFor.map((item, idx) => (
                          <li key={idx}>• {item}</li>
                        ))}
                      </ul>
                    </div>
                    <div className="pt-2">
                      <div
                        className={`px-4 py-2 rounded-md text-sm font-medium ${
                          detectionMode === card.mode
                            ? 'bg-blue-600 text-white'
                            : 'bg-gray-100 text-gray-700'
                        }`}
                      >
                        {detectionMode === card.mode ? '✓ Active' : 'Select'}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Sensitivity Presets */}
          <div>
            <label className="block text-sm font-medium text-gray-900 mb-4">
              How sensitive should change detection be?
            </label>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <button
                onClick={() => handlePresetSelect('relaxed')}
                className={`p-4 border-2 rounded-lg text-left transition-all ${
                  currentPreset === 'relaxed'
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-200 bg-white hover:border-gray-300'
                }`}
              >
                <div className="font-semibold text-gray-900">Relaxed</div>
                <div className="text-xs text-gray-600 mt-1">Only detect major changes</div>
              </button>
              <button
                onClick={() => handlePresetSelect('balanced')}
                className={`p-4 border-2 rounded-lg text-left transition-all ${
                  currentPreset === 'balanced'
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-200 bg-white hover:border-gray-300'
                }`}
              >
                <div className="font-semibold text-gray-900">Balanced</div>
                <div className="text-xs text-gray-600 mt-1">Recommended for most uses</div>
              </button>
              <button
                onClick={() => handlePresetSelect('sensitive')}
                className={`p-4 border-2 rounded-lg text-left transition-all ${
                  currentPreset === 'sensitive'
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-200 bg-white hover:border-gray-300'
                }`}
              >
                <div className="font-semibold text-gray-900">Sensitive</div>
                <div className="text-xs text-gray-600 mt-1">Catch even small changes</div>
              </button>
            </div>
          </div>

          {/* Advanced Settings Toggle */}
          <div>
            <button
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="flex items-center text-sm font-medium text-gray-700 hover:text-gray-900"
            >
              <Settings className="h-4 w-4 mr-2" />
              Advanced Settings
              {showAdvanced ? (
                <ChevronUp className="h-4 w-4 ml-1" />
              ) : (
                <ChevronDown className="h-4 w-4 ml-1" />
              )}
            </button>

            {showAdvanced && (
              <div className="mt-4 space-y-6 p-4 bg-gray-50 rounded-lg border border-gray-200">
                {/* Text Similarity */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label htmlFor="text-similarity" className="text-sm font-medium text-gray-900">
                      📝 Text Change Sensitivity
                    </label>
                    <div className="flex items-center space-x-2">
                      <input
                        type="number"
                        min="0.5"
                        max="1.0"
                        step="0.01"
                        value={thresholds.textSimilarity.toFixed(2)}
                        onChange={(e) => {
                          const value = parseFloat(e.target.value);
                          if (value >= 0.5 && value <= 1.0) {
                            handleTextSimilarityChange(e);
                          }
                        }}
                        className="w-16 px-2 py-1 text-xs border border-gray-300 rounded focus:ring-blue-500 focus:border-blue-500"
                      />
                      <span className="text-sm font-semibold text-blue-700">
                        {(thresholds.textSimilarity * 100).toFixed(0)}%
                      </span>
                    </div>
                  </div>
                  <input
                    type="range"
                    id="text-similarity"
                    min="0.5"
                    max="1.0"
                    step="0.01"
                    value={thresholds.textSimilarity}
                    onChange={handleTextSimilarityChange}
                    className="w-full h-2 bg-blue-200 rounded-lg appearance-none cursor-pointer"
                  />
                  <p className="text-xs text-gray-600 mt-1">
                    How much text must change to trigger detection. Lower = detects more text changes
                  </p>
                </div>

                {/* DHash Similarity */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label htmlFor="dhash-similarity" className="text-sm font-medium text-gray-900">
                      🎯 Visual Change Detection
                    </label>
                    <div className="flex items-center space-x-2">
                      <input
                        type="number"
                        min="0.5"
                        max="1.0"
                        step="0.01"
                        value={thresholds.dhashImageSimilarity.toFixed(2)}
                        onChange={(e) => {
                          const value = parseFloat(e.target.value);
                          if (value >= 0.5 && value <= 1.0) {
                            handleDHashSimilarityChange(e);
                          }
                        }}
                        disabled={detectionMode === DetectionMode.PixelDifferenceOnly}
                        className="w-16 px-2 py-1 text-xs border border-gray-300 rounded focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-200 disabled:cursor-not-allowed"
                      />
                      <span
                        className={`text-sm font-semibold ${
                          detectionMode === DetectionMode.PixelDifferenceOnly
                            ? 'text-gray-500'
                            : 'text-blue-700'
                        }`}
                      >
                        {(thresholds.dhashImageSimilarity * 100).toFixed(0)}%
                      </span>
                    </div>
                  </div>
                  <input
                    type="range"
                    id="dhash-similarity"
                    min="0.5"
                    max="1.0"
                    step="0.01"
                    value={thresholds.dhashImageSimilarity}
                    onChange={handleDHashSimilarityChange}
                    disabled={detectionMode === DetectionMode.PixelDifferenceOnly}
                    className={`w-full h-2 rounded-lg appearance-none cursor-pointer ${
                      detectionMode === DetectionMode.PixelDifferenceOnly
                        ? 'bg-gray-300 cursor-not-allowed'
                        : 'bg-blue-200'
                    }`}
                  />
                  <p className="text-xs text-gray-600 mt-1">
                    Handles video compression and lighting variations. Lower = more changes trigger AI
                  </p>
                </div>

                {/* Pixel Similarity */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label htmlFor="pixel-similarity" className="text-sm font-medium text-gray-900">
                      🔍 Precise Change Detection
                    </label>
                    <div className="flex items-center space-x-2">
                      <input
                        type="number"
                        min="0.5"
                        max="1.0"
                        step="0.01"
                        value={thresholds.pixelImageSimilarity.toFixed(2)}
                        onChange={(e) => {
                          const value = parseFloat(e.target.value);
                          if (value >= 0.5 && value <= 1.0) {
                            handlePixelSimilarityChange(e);
                          }
                        }}
                        disabled={detectionMode === DetectionMode.DHashOnly}
                        className="w-16 px-2 py-1 text-xs border border-gray-300 rounded focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-200 disabled:cursor-not-allowed"
                      />
                      <span
                        className={`text-sm font-semibold ${
                          detectionMode === DetectionMode.DHashOnly ? 'text-gray-500' : 'text-blue-700'
                        }`}
                      >
                        {(thresholds.pixelImageSimilarity * 100).toFixed(0)}%
                      </span>
                    </div>
                  </div>
                  <input
                    type="range"
                    id="pixel-similarity"
                    min="0.5"
                    max="1.0"
                    step="0.01"
                    value={thresholds.pixelImageSimilarity}
                    onChange={handlePixelSimilarityChange}
                    disabled={detectionMode === DetectionMode.DHashOnly}
                    className={`w-full h-2 rounded-lg appearance-none cursor-pointer ${
                      detectionMode === DetectionMode.DHashOnly
                        ? 'bg-gray-300 cursor-not-allowed'
                        : 'bg-blue-200'
                    }`}
                  />
                  <p className="text-xs text-gray-600 mt-1">
                    Catches exact pixel-level UI updates. Lower = catches smaller UI changes
                  </p>
                </div>

                {/* Suspicious Similarity (Hybrid only) */}
                {detectionMode === DetectionMode.Hybrid && (
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label htmlFor="suspicious-similarity" className="text-sm font-medium text-gray-900">
                        ⚡ Detailed Check Trigger
                      </label>
                      <div className="flex items-center space-x-2">
                        <input
                          type="number"
                          min="0.95"
                          max="1.0"
                          step="0.001"
                          value={thresholds.suspiciousSimilarity.toFixed(3)}
                          onChange={(e) => {
                            const value = parseFloat(e.target.value);
                            if (value >= 0.95 && value <= 1.0) {
                              handleSuspiciousSimilarityChange(e);
                            }
                          }}
                          className="w-20 px-2 py-1 text-xs border border-gray-300 rounded focus:ring-blue-500 focus:border-blue-500"
                        />
                        <span className="text-sm font-semibold text-blue-700">
                          {(thresholds.suspiciousSimilarity * 100).toFixed(2)}%
                        </span>
                      </div>
                    </div>
                    <input
                      type="range"
                      id="suspicious-similarity"
                      min="0.95"
                      max="1.0"
                      step="0.001"
                      value={thresholds.suspiciousSimilarity}
                      onChange={handleSuspiciousSimilarityChange}
                      className="w-full h-2 bg-blue-200 rounded-lg appearance-none cursor-pointer"
                    />
                    <p className="text-xs text-gray-600 mt-1">
                      When images look nearly identical, check pixels for subtle changes
                    </p>
                  </div>
                )}

                {/* Reset Button */}
                <div className="pt-2">
                  <button
                    onClick={() => handlePresetSelect('balanced')}
                    className="text-sm text-blue-600 hover:text-blue-700 font-medium"
                  >
                    ↺ Reset to Balanced
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

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
          <div>
            <label htmlFor="model-id" className="block text-sm font-medium text-gray-700 mb-2">
              Model ID
            </label>
            <input
              type="text"
              id="model-id"
              value={whisperSettings.modelId}
              onChange={handleModelIdChange}
              placeholder="Enter any HuggingFace model ID"
              list="model-suggestions"
              disabled={modelState?.status === 'loading' || modelState?.status === 'loaded'}
              className="block w-full px-3 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md disabled:bg-gray-100"
            />
            <datalist id="model-suggestions">
              {SUGGESTED_MODELS.map(model => (
                <option key={model} value={model} />
              ))}
            </datalist>
            <p className="text-xs text-gray-500 mt-1">
              Examples: Xenova/whisper-small.en (English only), Xenova/whisper-small (multilingual)
            </p>
          </div>

          {/* Responsive Options - Only show for multilingual models */}
          {!whisperSettings.modelId.endsWith('.en') && (
            <div className="bg-gray-50 p-4 rounded-lg border">
              <h4 className="text-sm font-medium text-gray-900 mb-3">Multilingual Options</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="task" className="block text-xs font-medium text-gray-700 mb-1">
                    Task
                  </label>
                  <select
                    id="task"
                    value={whisperSettings.task || ''}
                    onChange={handleTaskChange}
                    className="block w-full px-3 py-2 text-sm border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="">Default (transcribe)</option>
                    <option value="transcribe">Transcribe</option>
                    <option value="translate">Translate to English</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="language" className="block text-xs font-medium text-gray-700 mb-1">
                    Language
                  </label>
                  <select
                    id="language"
                    value={whisperSettings.language || ''}
                    onChange={handleLanguageChange}
                    className="block w-full px-3 py-2 text-sm border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="">Auto-detect</option>
                    {Object.entries(LANGUAGE_NAMES).map(([code, name]) => (
                      <option key={code} value={code}>{name}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* Quantized Option */}
          <div className="flex items-center">
            <input
              type="checkbox"
              id="quantized"
              checked={whisperSettings.quantized}
              onChange={handleQuantizedChange}
              className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
            />
            <label htmlFor="quantized" className="ml-2 text-sm font-medium text-gray-700">
              Quantized (smaller file sizes, faster loading)
            </label>
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

          {/* Transcript Size (Max Chunks to Keep) */}
          <div>
            <label htmlFor="max-chunks" className="block text-sm font-medium text-gray-700 mb-2">
              Transcript Size ({whisperSettings.maxChunksToKeep} chunks)
              <span className="ml-2 text-xs text-blue-600 font-medium">
                💡 Keeps {formatTranscriptDuration(whisperSettings.chunkDurationMs, whisperSettings.maxChunksToKeep)} of history as text for the Agents
              </span>
            </label>
            <input
              type="range"
              id="max-chunks"
              min="1"
              max="100"
              step="1"
              value={whisperSettings.maxChunksToKeep}
              onChange={handleMaxChunksToKeepChange}
              disabled={isTestRunning}
              className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer disabled:cursor-not-allowed"
            />
            <div className="flex justify-between text-xs text-gray-500 mt-1">
              <span>1 chunk</span>
              <span>50 chunks</span>
              <span>100 chunks</span>
            </div>
          </div>

          {/* Model Management Buttons */}
          <div className="flex items-center space-x-4">
            <button
              onClick={handleLoadModel}
              disabled={modelState?.status === 'loading' || modelState?.status === 'loaded'}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center transition-all"
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
