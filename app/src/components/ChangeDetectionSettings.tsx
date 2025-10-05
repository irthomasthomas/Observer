import React, { useState } from 'react';
import { Settings, Camera, Monitor, Zap, ChevronDown, ChevronUp } from 'lucide-react';
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

// Sensitivity presets
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
    dhashImageSimilarity: 0.70,
    pixelImageSimilarity: 0.85,
    suspiciousSimilarity: 0.998,
  },
  balanced: {
    textSimilarity: 0.90,
    dhashImageSimilarity: 0.85,
    pixelImageSimilarity: 0.90,
    suspiciousSimilarity: 0.998,
  },
  sensitive: {
    textSimilarity: 0.95,
    dhashImageSimilarity: 0.92,
    pixelImageSimilarity: 0.98,
    suspiciousSimilarity: 0.998,
  },
};

// Mode card configuration
interface ModeCardConfig {
  mode: DetectionMode;
  icon: React.ReactNode;
  title: string;
  description: string;
  bestFor: string[];
  isRecommended?: boolean;
}

const MODE_CARDS: ModeCardConfig[] = [
  {
    mode: DetectionMode.DHashOnly,
    icon: <Camera className="h-8 w-8" />,
    title: "Camera Feed",
    description: "Handles lighting changes, compression, and movement",
    bestFor: ["Webcams", "Video streams", "Live feeds"],
  },
  {
    mode: DetectionMode.PixelDifferenceOnly,
    icon: <Monitor className="h-8 w-8" />,
    title: "Screen UI",
    description: "Detects pixel-perfect changes in applications",
    bestFor: ["Apps", "Websites", "UI testing"],
  },
  {
    mode: DetectionMode.Hybrid,
    icon: <Zap className="h-8 w-8" />,
    title: "Smart (Auto)",
    description: "Intelligently adapts to what you're monitoring",
    bestFor: ["Mixed content", "Unsure", "General use"],
    isRecommended: true,
  },
];

const ChangeDetectionSettings: React.FC = () => {
  const [detectionMode, setDetectionModeState] = useState(getChangeDetectionMode());
  const [thresholds, setThresholds] = useState(getThresholds());
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [currentPreset, setCurrentPreset] = useState<SensitivityPreset>('balanced');

  // Handle mode selection
  const handleModeSelect = (mode: DetectionMode) => {
    setDetectionModeState(mode);
    setChangeDetectionMode(mode);
  };

  // Handle preset selection
  const handlePresetSelect = (preset: SensitivityPreset) => {
    setCurrentPreset(preset);
    const config = PRESET_CONFIGS[preset];

    // Apply all preset values
    setTextSimilarityThreshold(config.textSimilarity);
    setDHashSimilarityThreshold(config.dhashImageSimilarity);
    setPixelSimilarityThreshold(config.pixelImageSimilarity);
    setSuspiciousSimilarityThreshold(config.suspiciousSimilarity);

    // Update local state
    setThresholds(config);
  };

  // Individual threshold handlers
  const handleTextSimilarityChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseFloat(e.target.value);
    setTextSimilarityThreshold(value);
    setThresholds({ ...thresholds, textSimilarity: value });
    setCurrentPreset('balanced'); // Custom setting, no longer a preset
  };

  const handleDHashSimilarityChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseFloat(e.target.value);
    setDHashSimilarityThreshold(value);
    setThresholds({ ...thresholds, dhashImageSimilarity: value });
    setCurrentPreset('balanced'); // Custom setting
  };

  const handleSuspiciousSimilarityChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseFloat(e.target.value);
    setSuspiciousSimilarityThreshold(value);
    setThresholds({ ...thresholds, suspiciousSimilarity: value });
    setCurrentPreset('balanced'); // Custom setting
  };

  const handlePixelSimilarityChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseFloat(e.target.value);
    setPixelSimilarityThreshold(value);
    setThresholds({ ...thresholds, pixelImageSimilarity: value });
    setCurrentPreset('balanced'); // Custom setting
  };

  return (
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
                    {card.icon}
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
  );
};

export default ChangeDetectionSettings;
