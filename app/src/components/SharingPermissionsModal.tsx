import React, { useState, useEffect, useRef } from 'react';
import { X, Monitor, Mic, Waves, Blend, Eye, Camera as CameraIcon, Play, Square, AlertTriangle, CheckCircle, Volume2, FileText } from 'lucide-react';
import { StreamManager, StreamState } from '@utils/streamManager';
import { Logger } from '@utils/logging';
import { SensorPlaceholder, SENSOR_DESCRIPTIONS, getRequiredStreamsFromSensors } from '@utils/sensorMapping';

// --- Self-Contained UI Sub-Components for the Modal ---


/**
 * A placeholder shown when a stream preview is not yet active.
 */
const StreamPlaceholder: React.FC<{ Icon: React.ElementType; text: string }> = ({ Icon, text }) => (
  <div className="bg-gray-50 border-2 border-dashed border-gray-300 rounded-lg flex flex-col items-center justify-center aspect-video flex-1 min-w-0 text-gray-400 h-full">
    <Icon className="w-10 h-10 mb-2" />
    <span className="font-medium text-sm">{text}</span>
  </div>
);

// --- InfoTag-Style Sensor Components ---

/**
 * InfoTag-style sensor toggle matching StaticAgentView design patterns
 */
const SensorToggle: React.FC<{
  sensor: SensorPlaceholder;
  isActive: boolean;
  isEnabled: boolean;
  onToggle: (sensor: SensorPlaceholder, active: boolean) => void;
}> = ({ sensor, isActive, isEnabled, onToggle }) => {
  const info = SENSOR_DESCRIPTIONS[sensor];
  const getIconComponent = (iconName: string) => {
    switch (iconName) {
      case 'Monitor': return Monitor;
      case 'FileText': return FileText;
      case 'Camera': return CameraIcon;
      case 'Volume2': return Volume2;
      case 'Mic': return Mic;
      case 'Headphones': return Blend;
      default: return Monitor;
    }
  };
  const IconComponent = getIconComponent(info.icon);

  return (
    <button
      type="button"
      onClick={() => onToggle(sensor, !isActive)}
      disabled={!isEnabled}
      className={`group inline-flex flex-col items-center gap-1 px-3 py-2 rounded-md text-sm font-medium transition-all cursor-pointer ${
        isActive 
          ? 'bg-blue-100 text-blue-800 hover:bg-blue-200' 
          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
      } disabled:opacity-50 disabled:cursor-not-allowed`}
      title={info.description}
    >
      <div className="flex items-center gap-1.5">
        <IconComponent className="w-4 h-4" />
        <span>{info.name}</span>
        {isActive && <CheckCircle className="w-3.5 h-3.5" />}
      </div>
      <code className={`text-xs font-mono px-1.5 py-0.5 rounded ${
        isActive ? 'bg-blue-200 text-blue-900' : 'bg-gray-200 text-gray-600'
      }`}>
        {sensor}
      </code>
    </button>
  );
};


/**
 * Renders a live video stream.
 */
const VideoStream: React.FC<{ stream: MediaStream }> = ({ stream }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (videoRef.current && stream) videoRef.current.srcObject = stream;
  }, [stream]);
  return (
    <div className="bg-black rounded-lg overflow-hidden aspect-video flex-1 min-w-0">
      <video ref={videoRef} muted autoPlay playsInline className="w-full h-full object-contain"></video>
    </div>
  );
};

/**
 * Renders a live audio waveform visualizer.
 */
const AudioWaveform: React.FC<{ stream: MediaStream }> = ({ stream }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!stream || !canvasRef.current || stream.getAudioTracks().length === 0 || !stream.getAudioTracks().some(t => t.enabled && !t.muted)) {
      return;
    }
    const audioContext = new AudioContext();
    const analyser = audioContext.createAnalyser();
    const source = audioContext.createMediaStreamSource(stream);
    source.connect(analyser);
    analyser.fftSize = 256;
    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    const canvasCtx = canvasRef.current.getContext('2d')!;
    let animationFrameId: number;
    const draw = () => {
      animationFrameId = requestAnimationFrame(draw);
      analyser.getByteFrequencyData(dataArray);
      canvasCtx.fillStyle = '#f9fafb'; // bg-gray-50
      canvasCtx.fillRect(0, 0, canvasCtx.canvas.width, canvasCtx.canvas.height);
      const barWidth = (canvasCtx.canvas.width / dataArray.length) * 1.5;
      let x = 0;
      for (const value of dataArray) {
        const percent = value / 256;
        const barHeight = canvasCtx.canvas.height * percent;
        canvasCtx.fillStyle = `rgba(16, 185, 129, ${Math.max(0.2, percent)})`; // A vibrant green
        canvasCtx.fillRect(x, canvasCtx.canvas.height - barHeight, barWidth, barHeight);
        x += barWidth;
      }
    };
    draw();
    return () => {
      cancelAnimationFrame(animationFrameId);
      source.disconnect();
      audioContext.close();
    };
  }, [stream]);
  return (
    <div className="bg-gray-50 rounded-lg overflow-hidden flex-1 min-w-0 aspect-video h-full">
      <canvas ref={canvasRef} className="w-full h-full"></canvas>
    </div>
  );
};

// --- Main Modal Component ---

interface SharingPermissionsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const SharingPermissionsModal: React.FC<SharingPermissionsModalProps> = ({ isOpen, onClose }) => {
  // State management
  const [streams, setStreams] = useState<StreamState>(() => StreamManager.getCurrentState());
  const [selectedSensors, setSelectedSensors] = useState<Set<SensorPlaceholder>>(new Set());
  const [activeSensors, setActiveSensors] = useState<Set<SensorPlaceholder>>(new Set());
  const [isApplying, setIsApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const AGENT_ID = 'system-sensor-ui';

  // Available sensors for the modal (per user request)
  const AVAILABLE_SENSORS: SensorPlaceholder[] = ['$SCREEN_64', '$CAMERA', '$SCREEN_AUDIO', '$MICROPHONE', '$ALL_AUDIO'];

  // Listen to stream state changes
  useEffect(() => {
    if (!isOpen) return;
    const handleStreamUpdate = (newState: StreamState) => setStreams(newState);
    StreamManager.addListener(handleStreamUpdate);
    return () => StreamManager.removeListener(handleStreamUpdate);
  }, [isOpen]);

  // No cleanup when modal closes - streams should persist in background
  // The modal acts as a control panel for a persistent background agent
  // Streams only stop when explicitly stopped by user action

  // Handle sensor toggle in checklist
  const handleSensorToggle = (sensor: SensorPlaceholder, active: boolean) => {
    const updated = new Set(selectedSensors);
    if (active) {
      updated.add(sensor);
    } else {
      updated.delete(sensor);
    }
    setSelectedSensors(updated);
    setError(null); // Clear any previous errors
  };

  // Apply changes - TRANSACTIONAL APPROACH
  const handleApplyChanges = async () => {
    if (selectedSensors.size === 0) {
      // Stop all sensors
      Logger.info("SensorModal", `Stopping all sensors for agent '${AGENT_ID}'`);
      StreamManager.releaseStreamsForAgent(AGENT_ID);
      setActiveSensors(new Set());
      return;
    }

    setIsApplying(true);
    setError(null);

    try {
      const sensorsArray = Array.from(selectedSensors);
      const requiredStreams = getRequiredStreamsFromSensors(sensorsArray);
      
      Logger.info("SensorModal", `Applying sensor changes for agent '${AGENT_ID}': [${sensorsArray.join(', ')}] → [${requiredStreams.join(', ')}]`);
      
      // SINGLE TRANSACTIONAL REQUEST - like main_loop.ts
      await StreamManager.requestStreamsForAgent(AGENT_ID, requiredStreams);
      
      setActiveSensors(new Set(selectedSensors));
      Logger.info("SensorModal", `Successfully applied sensor changes. Active sensors: [${sensorsArray.join(', ')}]`);
      
    } catch (error) {
      Logger.error("SensorModal", `Failed to apply sensor changes for agent '${AGENT_ID}'`, error);
      
      // CRITICAL: ROBUST ERROR CLEANUP - matching main_loop.ts:148 pattern
      Logger.debug("SensorModal", `Cleaning up streams after error for agent '${AGENT_ID}'`);
      StreamManager.releaseStreamsForAgent(AGENT_ID);
      
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      setError(`Failed to acquire sensors: ${errorMessage}`);
      setActiveSensors(new Set()); // Reset active sensors on error
      
    } finally {
      setIsApplying(false);
    }
  };

  // Stop all sensors
  const handleStopAll = () => {
    Logger.info("SensorModal", `User requested stop all sensors for agent '${AGENT_ID}'`);
    StreamManager.releaseStreamsForAgent(AGENT_ID);
    setActiveSensors(new Set());
    setSelectedSensors(new Set());
    setError(null);
  };


  const hasChanges = JSON.stringify([...selectedSensors].sort()) !== JSON.stringify([...activeSensors].sort());

  return (
    <div className={`fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[70] transition-opacity duration-300 ${isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl border border-gray-200 m-4 flex flex-col max-h-[90vh] animate-fade-in">
        
        {/* Header */}
        <div className="p-6 border-b border-gray-200 flex justify-between items-center flex-shrink-0">
          <h2 className="text-xl font-bold text-gray-800">Sensor Control Panel</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-800 transition-colors">
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="p-6 space-y-4 overflow-y-auto">
          
          {/* Error Display */}
          {error && (
            <div className="p-3 bg-yellow-50 border border-yellow-200 text-yellow-800 rounded-md text-sm flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* SENSOR CONTROL */}
          <div>
            <h4 className="text-xs font-semibold text-gray-500 mb-2">SENSOR CONTROL</h4>
            <div className="flex flex-wrap gap-2 mb-4">
              {AVAILABLE_SENSORS.map(sensor => (
                <SensorToggle
                  key={sensor}
                  sensor={sensor}
                  isActive={selectedSensors.has(sensor)}
                  isEnabled={!isApplying}
                  onToggle={handleSensorToggle}
                />
              ))}
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-3">
              <button
                onClick={handleApplyChanges}
                disabled={!hasChanges || isApplying}
                className={`flex items-center gap-2 px-3 py-1.5 text-sm rounded-md font-medium transition-all ${
                  hasChanges && !isApplying
                    ? 'bg-blue-600 text-white hover:bg-blue-700'
                    : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                }`}
              >
                <Play className="w-3.5 h-3.5" />
                {isApplying ? 'Applying...' : 'Apply'}
              </button>
              
              {activeSensors.size > 0 && (
                <button
                  onClick={handleStopAll}
                  disabled={isApplying}
                  className="flex items-center gap-2 px-3 py-1.5 text-sm rounded-md bg-red-100 text-red-700 hover:bg-red-200 transition-colors font-medium"
                >
                  <Square className="w-3.5 h-3.5" />
                  Stop All
                </button>
              )}
              
              <div className="text-xs text-gray-500">
                {activeSensors.size === 0 ? 'No sensors active' : `${activeSensors.size} active`}
              </div>
            </div>
          </div>

          {/* Live Previews */}
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {streams.screenVideoStream ? (
                <div className="animate-fade-in"><VideoStream stream={streams.screenVideoStream} /></div>
              ) : (
                <StreamPlaceholder Icon={Eye} text="Screen Preview" />
              )}
              {streams.cameraStream ? (
                <div className="animate-fade-in"><VideoStream stream={streams.cameraStream} /></div>
              ) : (
                <StreamPlaceholder Icon={CameraIcon} text="Camera Preview" />
              )}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {streams.screenAudioStream ? (
                <div className="animate-fade-in"><AudioWaveform stream={streams.screenAudioStream} /></div>
              ) : (
                <StreamPlaceholder Icon={Waves} text="System Audio" />
              )}
              {streams.microphoneStream ? (
                <div className="animate-fade-in"><AudioWaveform stream={streams.microphoneStream} /></div>
              ) : (
                <StreamPlaceholder Icon={Mic} text="Microphone" />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SharingPermissionsModal;
