import React, { useState, useEffect, useRef } from 'react';
import { X, Monitor, Video, Mic, Waves, Combine, Eye, Camera as CameraIcon } from 'lucide-react';
import { StreamManager, StreamState } from '@utils/streamManager';
import { Logger } from '@utils/logging';

// --- Self-Contained UI Sub-Components for the Modal ---

/**
 * A large, clickable button to request a master permission from the browser.
 */
const PermissionButton: React.FC<{ onClick: () => void; Icon: React.ElementType; title: string }> = ({ onClick, Icon, title }) => (
  <button
    onClick={onClick}
    className="flex flex-col items-center justify-center gap-2 p-4 rounded-lg bg-gray-100 hover:bg-gray-200 transition-colors w-full h-full text-gray-700 border border-gray-200"
  >
    <Icon className="w-8 h-8" />
    <span className="font-semibold text-center">{title}</span>
  </button>
);

/**
 * A small "pill" indicator that shows the live status of a specific sensor.
 */
const SensorStatusIndicator: React.FC<{ isActive: boolean; Icon: React.ElementType; label: string; color: string }> = ({ isActive, Icon, label, color }) => (
  <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${isActive ? color : 'bg-gray-100 text-gray-500'}`}>
    <Icon className={`w-4 h-4 transition-transform ${isActive ? 'scale-110' : ''}`} />
    {label}
  </div>
);

/**
 * A placeholder shown when a stream preview is not yet active.
 */
const StreamPlaceholder: React.FC<{ Icon: React.ElementType; text: string }> = ({ Icon, text }) => (
  <div className="bg-gray-50 border-2 border-dashed border-gray-300 rounded-lg flex flex-col items-center justify-center aspect-video flex-1 min-w-0 text-gray-400 h-full">
    <Icon className="w-10 h-10 mb-2" />
    <span className="font-medium text-sm">{text}</span>
  </div>
);

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


// --- The Main Modal Component ---

interface SharingPermissionsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const SharingPermissionsModal: React.FC<SharingPermissionsModalProps> = ({ isOpen, onClose }) => {
  const [streams, setStreams] = useState<StreamState>(() => StreamManager.getCurrentState());

  useEffect(() => {
    if (!isOpen) return;
    const handleStreamUpdate = (newState: StreamState) => setStreams(newState);
    StreamManager.addListener(handleStreamUpdate);
    return () => StreamManager.removeListener(handleStreamUpdate);
  }, [isOpen]);

  const handleRequest = async (type: 'screen' | 'camera' | 'microphone') => {
    const agentId = 'system-permission-ui';
    try {
      if (type === 'screen') {
        await StreamManager.requestStreamsForAgent(agentId, ['screenVideo', 'screenAudio']);
      } else if (type === 'camera') {
        await StreamManager.requestStreamsForAgent(agentId, ['camera']);
      } else {
        await StreamManager.requestStreamsForAgent(agentId, ['microphone']);
      }
    } catch (error) {
      Logger.error("PermissionsModal", `User denied or failed to acquire '${type}' permissions.`, error);
    }
  };

  return (
    <div className={`fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 transition-opacity duration-300 ${isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl border border-gray-200 m-4 flex flex-col max-h-[90vh]">
        <div className="p-6 border-b border-gray-200 flex justify-between items-center flex-shrink-0">
          <h2 className="text-xl font-bold text-gray-800">Sensor Control Panel</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-800 transition-colors">
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="p-6 space-y-6 overflow-y-auto">
          <div>
            <h3 className="text-lg font-semibold text-gray-700 mb-2">Activate Master Sensors</h3>
            <p className="text-sm text-gray-500 mb-4">Click to grant browser permissions. This will enable the live sensors below.</p>
            <div className="grid grid-cols-3 gap-4">
              <PermissionButton onClick={() => handleRequest('screen')} Icon={Monitor} title="Screen & Audio" />
              <PermissionButton onClick={() => handleRequest('camera')} Icon={Video} title="Camera" />
              <PermissionButton onClick={() => handleRequest('microphone')} Icon={Mic} title="Microphone" />
            </div>
          </div>
          
          <div>
            <h3 className="text-lg font-semibold text-gray-700 mb-3">Live Sensor Status</h3>
            <div className="flex flex-wrap gap-3 items-center">
              <SensorStatusIndicator isActive={!!streams.cameraStream} Icon={Video} label="Camera" color="bg-purple-100 text-purple-700" />
              <SensorStatusIndicator isActive={!!streams.screenVideoStream} Icon={Monitor} label="Screen Video" color="bg-purple-100 text-purple-700" />
              <SensorStatusIndicator isActive={!!streams.screenAudioStream} Icon={Waves} label="Screen Audio" color="bg-green-100 text-green-700" />
              <SensorStatusIndicator isActive={!!streams.microphoneStream} Icon={Mic} label="Microphone" color="bg-green-100 text-green-700" />
              <SensorStatusIndicator isActive={!!streams.screenAudioStream && !!streams.microphoneStream} Icon={Combine} label="Audio + Mic" color="bg-green-100 text-green-700" />
            </div>
          </div>

          <div>
              <h3 className="text-lg font-semibold text-gray-700 mb-3">Live Previews</h3>
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
    </div>
  );
};

export default SharingPermissionsModal;
