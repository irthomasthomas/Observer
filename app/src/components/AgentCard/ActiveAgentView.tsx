// components/AgentCard/ActiveAgentView.tsx
import React, { useMemo, useRef, useEffect, ReactNode, useState } from 'react';
import { Eye, Clock, Power, Activity, Mic, Volume2, Crop, RotateCcw, Brain, Images, AlertTriangle } from 'lucide-react';
import { StreamState, AudioStreamType } from '@utils/streamManager';
import { CropConfig, setAgentCrop, getAgentCrop } from '@utils/screenCapture';
import { CompleteAgent, getAgentMemory, getAgentImageMemory } from '@utils/agent_database';
import { agentHasScreenSensor, agentHasCameraSensor, agentHasSensor } from '@utils/agentCapabilities';
import { IterationStore, ToolCall } from '@utils/IterationStore';
import ToolStatus from '@components/AgentCard/ToolStatus';
import { useTranscriptionPolling } from '@hooks/useTranscriptionPolling';
import TranscriptionModal from '@components/AgentCard/TranscriptionModal';

type AgentLiveStatus = 'STARTING' | 'CAPTURING' | 'THINKING' | 'WAITING' | 'IDLE';

// --- Crop Overlay Component ---

interface CropOverlayProps {
  isActive: boolean;
  onCropSelect: (crop: CropConfig) => void;
  existingCrop?: CropConfig | null;
  videoElement: HTMLVideoElement | null;
}

const CropOverlay: React.FC<CropOverlayProps> = ({ isActive, onCropSelect, existingCrop, videoElement }) => {
  const [isSelecting, setIsSelecting] = useState(false);
  const [startPos, setStartPos] = useState({ x: 0, y: 0 });
  const [currentCrop, setCurrentCrop] = useState<CropConfig | null>(existingCrop || null);
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setCurrentCrop(existingCrop || null);
  }, [existingCrop]);

  const getVideoScale = () => {
    if (!videoElement || !overlayRef.current) return { scaleX: 1, scaleY: 1, offsetX: 0, offsetY: 0 };

    const video = videoElement;
    const overlay = overlayRef.current;
    const videoRatio = video.videoWidth / video.videoHeight;
    const containerRatio = overlay.offsetWidth / overlay.offsetHeight;

    let scaleX, scaleY, offsetX = 0, offsetY = 0;

    if (videoRatio > containerRatio) {
      // Video is wider - fit to width
      scaleX = video.videoWidth / overlay.offsetWidth;
      scaleY = scaleX;
      offsetY = (overlay.offsetHeight - video.videoHeight / scaleY) / 2;
    } else {
      // Video is taller - fit to height
      scaleY = video.videoHeight / overlay.offsetHeight;
      scaleX = scaleY;
      offsetX = (overlay.offsetWidth - video.videoWidth / scaleX) / 2;
    }

    return { scaleX, scaleY, offsetX, offsetY };
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!isActive || !overlayRef.current) return;

    const rect = overlayRef.current.getBoundingClientRect();
    const { offsetX, offsetY } = getVideoScale();

    const x = e.clientX - rect.left - offsetX;
    const y = e.clientY - rect.top - offsetY;

    setStartPos({ x, y });
    setIsSelecting(true);
    setCurrentCrop(null);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isSelecting || !overlayRef.current) return;

    const rect = overlayRef.current.getBoundingClientRect();
    const { scaleX, scaleY, offsetX, offsetY } = getVideoScale();

    const currentX = e.clientX - rect.left - offsetX;
    const currentY = e.clientY - rect.top - offsetY;

    const x = Math.min(startPos.x, currentX);
    const y = Math.min(startPos.y, currentY);
    const width = Math.abs(currentX - startPos.x);
    const height = Math.abs(currentY - startPos.y);

    // Convert to video coordinates
    const videoCrop = {
      x: Math.max(0, Math.round(x * scaleX)),
      y: Math.max(0, Math.round(y * scaleY)),
      width: Math.round(width * scaleX),
      height: Math.round(height * scaleY)
    };

    setCurrentCrop(videoCrop);
  };

  const handleMouseUp = () => {
    if (!isSelecting || !currentCrop) return;

    setIsSelecting(false);
    if (currentCrop.width > 10 && currentCrop.height > 10) {
      onCropSelect(currentCrop);
    }
  };

  const renderCropRect = () => {
    if (!currentCrop || !overlayRef.current) return null;

    const { scaleX, scaleY, offsetX, offsetY } = getVideoScale();

    const style = {
      left: `${currentCrop.x / scaleX + offsetX}px`,
      top: `${currentCrop.y / scaleY + offsetY}px`,
      width: `${currentCrop.width / scaleX}px`,
      height: `${currentCrop.height / scaleY}px`,
    };

    return (
      <div
        className="absolute border-2 border-blue-500 bg-blue-500 bg-opacity-20"
        style={style}
      >
        <div className="absolute -top-6 left-0 bg-blue-500 text-white text-xs px-1 rounded">
          {currentCrop.width}×{currentCrop.height}
        </div>
      </div>
    );
  };

  // Show overlay if actively cropping OR if there's an existing crop to display
  if (!isActive && !existingCrop) return null;

  return (
    <div
      ref={overlayRef}
      className={`absolute inset-0 z-10 ${isActive ? 'cursor-crosshair' : 'pointer-events-none'}`}
      onMouseDown={isActive ? handleMouseDown : undefined}
      onMouseMove={isActive ? handleMouseMove : undefined}
      onMouseUp={isActive ? handleMouseUp : undefined}
      onMouseLeave={isActive ? () => setIsSelecting(false) : undefined}
    >
      {renderCropRect()}
      {isActive && (
        <div className="absolute top-2 left-2 bg-black bg-opacity-70 text-white text-xs px-2 py-1 rounded">
          Drag to select crop area
        </div>
      )}
    </div>
  );
};

// --- Helper Functions & Components specific to the Active View ---

const getActiveAudioStreamsForDisplay = (state: StreamState): { type: AudioStreamType; stream: MediaStream; title: string; icon: ReactNode; }[] => {
  if (state.allAudioStream) {
    return [{ type: 'allAudio', stream: state.allAudioStream, title: 'All Audio (Mixed)', icon: <><Volume2 className="w-3 h-3" /><Mic className="w-3 h-3 -ml-1" /></> }];
  }
  const activeStreams: { type: AudioStreamType; stream: MediaStream; title: string; icon: ReactNode; }[] = [];
  if (state.microphoneStream) {
    activeStreams.push({ type: 'microphone', stream: state.microphoneStream, title: 'Microphone', icon: <Mic className="w-4 h-4" /> });
  }
  if (state.screenAudioStream) {
    activeStreams.push({ type: 'screenAudio', stream: state.screenAudioStream, title: 'System Audio', icon: <Volume2 className="w-4 h-4" /> });
  }
  return activeStreams;
};

const AudioWaveform: React.FC<{
  stream: MediaStream;
  title: string;
  icon: React.ReactNode;
  type: AudioStreamType;
}> = ({ stream, title, icon, type }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationFrameId = useRef<number>();
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Use transcription polling hook
  const transcription = useTranscriptionPolling(type, true, 25, 500);

  useEffect(() => {
    if (!stream || !canvasRef.current || stream.getAudioTracks().length === 0) return;
    const audioContext = new AudioContext();
    const source = audioContext.createMediaStreamSource(stream);
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 256;
    source.connect(analyser);
    const canvas = canvasRef.current;
    const canvasCtx = canvas.getContext('2d')!;
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    const draw = () => {
      animationFrameId.current = requestAnimationFrame(draw);
      analyser.getByteFrequencyData(dataArray);
      canvasCtx.fillStyle = '#1f2937';
      canvasCtx.fillRect(0, 0, canvas.width, canvas.height);
      const barWidth = (canvas.width / bufferLength) * 2;
      let x = 0;
      for (let i = 0; i < bufferLength; i++) {
        const barHeight = (dataArray[i] / 255) * canvas.height;
        canvasCtx.fillStyle = `rgba(52, 211, 153, ${barHeight / canvas.height})`;
        canvasCtx.fillRect(x, canvas.height - barHeight, barWidth, barHeight);
        x += barWidth + 1;
      }
    };
    draw();
    return () => {
      if (animationFrameId.current) cancelAnimationFrame(animationFrameId.current);
      source.disconnect();
      analyser.disconnect();
      audioContext.close().catch(() => {});
    };
  }, [stream]);

  return (
    <>
      <div
        className="bg-gray-800 rounded-lg p-3 flex-1 min-w-0 text-white flex flex-col gap-2 cursor-pointer hover:bg-gray-700 transition-colors"
        onClick={() => setIsModalOpen(true)}
        title="Click to view full transcription"
      >
        <div className="flex items-center gap-2 text-xs font-medium text-gray-300">
          {icon} {title}
        </div>
        <canvas ref={canvasRef} className="w-full h-12 rounded"></canvas>

        {/* Sliding Window Transcription Display */}
        {transcription.lastWords.length > 0 && (
          <div className="relative overflow-hidden h-6">
            <div
              className={`absolute inset-0 flex items-center transition-opacity duration-300 ${
                transcription.hasNewContent ? 'opacity-100' : 'opacity-80'
              }`}
            >
              {/* Gradient fade effect - only on the left */}
              <div className="absolute left-0 top-0 bottom-0 w-12 bg-gradient-to-r from-gray-800 to-transparent z-10 pointer-events-none" />

              {/* Sliding text - positioned to show the end */}
              <div
                className="absolute top-0 bottom-0 right-8 left-12 flex items-center justify-end overflow-hidden"
              >
                <div
                  className={`text-xs text-gray-300 whitespace-nowrap transition-all duration-500 ease-out ${
                    transcription.hasNewContent ? 'animate-pulse' : ''
                  }`}
                  style={{
                    transform: transcription.hasNewContent ? 'translateX(-4px)' : 'translateX(0)',
                  }}
                >
                  {transcription.lastWords.join(' ')}
                </div>
              </div>
            </div>

            {/* Typing indicator when active */}
            {transcription.isActive && transcription.hasNewContent && (
              <div className="absolute right-1 top-1/2 transform -translate-y-1/2 flex gap-1">
                <div className="w-1 h-1 bg-green-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <div className="w-1 h-1 bg-green-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <div className="w-1 h-1 bg-green-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Transcription Modal */}
      <TranscriptionModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        streamType={type}
        fullTranscript={transcription.fullTranscript}
        streamTitle={title}
      />
    </>
  );
};

const VideoStream: React.FC<{
  stream: MediaStream;
  streamType: 'camera' | 'screen';
  agentId: string;
}> = ({ stream, streamType, agentId }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isCropMode, setIsCropMode] = useState(false);
  const [currentCrop, setCurrentCrop] = useState<CropConfig | null>(null);

  // Load existing crop config
  useEffect(() => {
    const existingCrop = getAgentCrop(agentId, streamType);
    setCurrentCrop(existingCrop);
  }, [agentId, streamType]);

  useEffect(() => {
    if (videoRef.current && stream) videoRef.current.srcObject = stream;
  }, [stream]);

  const handleCropSelect = (crop: CropConfig) => {
    setAgentCrop(agentId, streamType, crop);
    setCurrentCrop(crop);
    setIsCropMode(false);
  };

  const handleClearCrop = () => {
    setAgentCrop(agentId, streamType, null);
    setCurrentCrop(null);
  };

  return (
    <div className="bg-black rounded-lg overflow-hidden aspect-video flex-1 min-w-0 relative group">
      {/* Video element */}
      <video ref={videoRef} muted autoPlay playsInline className="w-full h-full object-contain"></video>

      {/* Crop controls - show on hover */}
      <div className="absolute top-2 left-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center gap-1 z-20">
        <button
          onClick={() => setIsCropMode(true)}
          disabled={isCropMode}
          className="bg-black bg-opacity-70 hover:bg-opacity-90 text-white p-1.5 rounded text-xs flex items-center gap-1 transition-colors disabled:opacity-50"
          title={`Crop ${streamType}`}
        >
          <Crop className="w-3 h-3" />
        </button>

        {currentCrop && (
          <>
            <div className="bg-black bg-opacity-70 text-white text-xs px-1.5 py-1 rounded">
              {currentCrop.width}×{currentCrop.height}
            </div>
            <button
              onClick={handleClearCrop}
              className="bg-red-600 bg-opacity-80 hover:bg-opacity-100 text-white p-1 rounded transition-colors"
              title="Clear crop"
            >
              <RotateCcw className="w-3 h-3" />
            </button>
          </>
        )}
      </div>

      {/* Crop overlay */}
      <CropOverlay
        isActive={isCropMode}
        onCropSelect={handleCropSelect}
        existingCrop={currentCrop}
        videoElement={videoRef.current}
      />
    </div>
  );
};

const NoSensorsWarning: React.FC = () => (
  <div className="flex items-center justify-center gap-3 p-4 bg-red-50 rounded-lg border border-red-200 text-red-600">
    <AlertTriangle className="w-5 h-5" />
    <span className="text-sm font-medium">No Active Sensors</span>
  </div>
);

const MemoryPreview: React.FC<{ agentId: string }> = ({ agentId }) => {
  const [memory, setMemory] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);

  // Load initial memory
  useEffect(() => {
    const loadMemory = async () => {
      try {
        const memoryData = await getAgentMemory(agentId);
        setMemory(memoryData || '');
      } catch (error) {
        console.error('Failed to load memory:', error);
        setMemory('');
      } finally {
        setIsLoading(false);
      }
    };
    loadMemory();
  }, [agentId]);

  // Listen for memory updates via custom events
  useEffect(() => {
    const handleMemoryUpdate = async (event: CustomEvent) => {
      if (event.detail.agentId === agentId) {
        try {
          const memoryData = await getAgentMemory(agentId);
          setMemory(memoryData || '');
        } catch (error) {
          console.error('Failed to reload memory:', error);
        }
      }
    };

    window.addEventListener('agent-memory-update', handleMemoryUpdate as any);
    return () => {
      window.removeEventListener('agent-memory-update', handleMemoryUpdate as any);
    };
  }, [agentId]);

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 bg-blue-50 px-3 py-2 rounded-lg border border-blue-200 flex-1 min-w-0">
        <Brain className="w-4 h-4 text-blue-600 flex-shrink-0" />
        <span className="text-blue-700 text-sm italic">Loading memory...</span>
      </div>
    );
  }

  if (!memory.trim()) {
    return (
      <div className="flex items-center gap-2 bg-blue-50 px-3 py-2 rounded-lg border border-blue-200 flex-1 min-w-0">
        <Brain className="w-4 h-4 text-blue-600 flex-shrink-0" />
        <span className="text-blue-700 text-sm italic">No memory data yet</span>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-2 bg-blue-50 px-3 py-2 rounded-lg border border-blue-200 flex-1 min-w-0">
      <Brain className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <div className="text-xs font-medium text-blue-600 mb-1">Memory</div>
        <div className="text-blue-700 text-sm leading-relaxed break-words line-clamp-3 overflow-hidden">
          {memory}
        </div>
      </div>
    </div>
  );
};

const ImageMemoryPreview: React.FC<{ agentId: string }> = ({ agentId }) => {
  const [images, setImages] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Load initial image memory
  useEffect(() => {
    const loadImages = async () => {
      try {
        const imageData = await getAgentImageMemory(agentId);
        setImages(imageData || []);
      } catch (error) {
        console.error('Failed to load image memory:', error);
        setImages([]);
      } finally {
        setIsLoading(false);
      }
    };
    loadImages();
  }, [agentId]);

  // Listen for memory updates via custom events
  useEffect(() => {
    const handleMemoryUpdate = async (event: CustomEvent) => {
      if (event.detail.agentId === agentId) {
        try {
          const imageData = await getAgentImageMemory(agentId);
          setImages(imageData || []);
        } catch (error) {
          console.error('Failed to reload image memory:', error);
        }
      }
    };

    window.addEventListener('agent-memory-update', handleMemoryUpdate as any);
    return () => {
      window.removeEventListener('agent-memory-update', handleMemoryUpdate as any);
    };
  }, [agentId]);

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 bg-purple-50 px-3 py-2 rounded-lg border border-purple-200 flex-1 min-w-0">
        <Images className="w-4 h-4 text-purple-600 flex-shrink-0" />
        <span className="text-purple-700 text-sm italic">Loading image memory...</span>
      </div>
    );
  }

  if (images.length === 0) {
    return (
      <div className="flex items-center gap-2 bg-purple-50 px-3 py-2 rounded-lg border border-purple-200 flex-1 min-w-0">
        <Images className="w-4 h-4 text-purple-600 flex-shrink-0" />
        <span className="text-purple-700 text-sm italic">No image memory yet</span>
      </div>
    );
  }

  const imagesToShow = images.slice(-3); // Show last 3 images

  return (
    <div className="bg-purple-50 px-3 py-2 rounded-lg border border-purple-200 flex-1 min-w-0">
      <div className="flex items-center gap-2 mb-2">
        <Images className="w-4 h-4 text-purple-600 flex-shrink-0" />
        <div className="text-xs font-medium text-purple-600">Image Memory</div>
        <span className="text-xs text-purple-500">({images.length} total)</span>
      </div>
      <div className="flex gap-2 flex-wrap">
        {imagesToShow.map((imageBase64, index) => (
          <img
            key={index}
            src={`data:image/png;base64,${imageBase64}`}
            alt={`Memory image ${index + 1}`}
            className="w-16 h-16 rounded border border-purple-200 object-cover flex-shrink-0"
            onError={(e) => {
              // Fallback to JPEG if PNG fails
              (e.target as HTMLImageElement).src = `data:image/jpeg;base64,${imageBase64}`;
            }}
          />
        ))}
      </div>
    </div>
  );
};

const StateTicker: React.FC<{ status: AgentLiveStatus }> = ({ status }) => {
  const statusInfo = useMemo(() => {
    switch (status) {
      case 'STARTING': return { icon: <Power className="w-5 h-5" />, text: 'Agent is starting...', color: 'text-yellow-600' };
      case 'CAPTURING': return { icon: <Eye className="w-5 h-5 animate-subtle-pulse" />, text: 'Capturing Inputs...', color: 'text-cyan-600' };
      case 'THINKING': return { icon: <Activity className="w-5 h-5" />, text: 'Model is thinking...', color: 'text-purple-600' };
      case 'WAITING': return { icon: <Clock className="w-5 h-5" />, text: 'Waiting for next cycle...', color: 'text-gray-500' };
      default: return { icon: <div />, text: 'Idle', color: 'text-gray-400' };
    }
  }, [status]);
  return (
    <div className={`flex items-center gap-3 px-4 py-2 rounded-lg bg-gray-100 ${statusInfo.color}`}>
      <div className="flex-shrink-0">{statusInfo.icon}</div>
      <span className="font-medium text-sm">{statusInfo.text}</span>
      {(status === 'THINKING' || status === 'STARTING') && <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin ml-auto" />}
    </div>
  );
};

const LastResponse: React.FC<{ response: string, responseKey: number }> = ({ response, responseKey }) => (
  <div key={responseKey} className="bg-white border border-gray-200 rounded-lg shadow-sm animate-fade-in min-h-0">
    <h4 className="text-xs font-semibold text-gray-500 mb-1 px-3 pt-2">Last Response</h4>
    <p className="text-sm text-gray-700 whitespace-pre-wrap max-h-40 overflow-y-auto scrollbar-thin px-3 pb-2">{response}</p>
  </div>
);


// --- Main Component ---

interface ActiveAgentViewProps {
    streams: StreamState;
    liveStatus: AgentLiveStatus;
    lastResponse: string;
    responseKey: number;
    agentId: string;
    agent: CompleteAgent;
    code?: string;
}

const ActiveAgentView: React.FC<ActiveAgentViewProps> = ({
    streams,
    liveStatus,
    lastResponse,
    responseKey,
    agentId,
    agent
}) => {
    const audioStreamsToDisplay = useMemo(() => getActiveAudioStreamsForDisplay(streams), [streams]);
    const [streamingResponse, setStreamingResponse] = useState('');
    const [isStreaming, setIsStreaming] = useState(false);
    const [lastTools, setLastTools] = useState<ToolCall[]>([]);

    // Detect which sensors this agent actually uses
    const hasScreenSensor = useMemo(() => agentHasScreenSensor(agent.system_prompt), [agent.system_prompt]);
    const hasCameraSensor = useMemo(() => agentHasCameraSensor(agent.system_prompt), [agent.system_prompt]);
    const hasMemorySensor = useMemo(() => agentHasSensor(agent.system_prompt, 'MEMORY'), [agent.system_prompt]);
    const hasImageMemorySensor = useMemo(() => agentHasSensor(agent.system_prompt, 'IMEMORY'), [agent.system_prompt]);

    // Check if we have any active sensor previews to show
    const hasAnySensorPreviews = hasScreenSensor || hasCameraSensor || hasMemorySensor || hasImageMemorySensor;

    // Load initial tool data and subscribe to updates
    useEffect(() => {
        const loadLastTools = () => {
            const tools = IterationStore.getToolsFromLastIteration(agentId);
            setLastTools(tools);
        };

        // Load initial data
        loadLastTools();

        // Subscribe to IterationStore updates
        const unsubscribe = IterationStore.subscribe(() => {
            loadLastTools();
        });

        return unsubscribe;
    }, [agentId]);

    useEffect(() => {
        const handleStreamStart = (event: CustomEvent) => {
            if (event.detail.agentId === agentId) {
                setStreamingResponse('');
                setIsStreaming(true);
            }
        };

        const handleStreamChunk = (event: CustomEvent) => {
            if (event.detail.agentId === agentId) {
                setStreamingResponse(prev => prev + event.detail.chunk);
            }
        };

        const handleIterationStart = (event: CustomEvent) => {
            if (event.detail.agentId === agentId) {
                setIsStreaming(false);
                setStreamingResponse('');
            }
        };

        window.addEventListener('agentStreamStart', handleStreamStart as EventListener);
        window.addEventListener('agentResponseChunk', handleStreamChunk as EventListener);
        window.addEventListener('agentIterationStart', handleIterationStart as EventListener);

        return () => {
            window.removeEventListener('agentStreamStart', handleStreamStart as EventListener);
            window.removeEventListener('agentResponseChunk', handleStreamChunk as EventListener);
            window.removeEventListener('agentIterationStart', handleIterationStart as EventListener);
        };
    }, [agentId]);

    return (
        <div className="grid md:grid-cols-2 md:gap-6 animate-fade-in">
            {/* Left Column: Media Streams & Sensor Previews */}
            <div className="space-y-4">
                {/* Video Streams */}
                {hasScreenSensor && streams.screenVideoStream && <VideoStream stream={streams.screenVideoStream} streamType="screen" agentId={agentId} />}
                {hasCameraSensor && streams.cameraStream && <VideoStream stream={streams.cameraStream} streamType="camera" agentId={agentId} />}

                {/* Memory Sensor Previews */}
                {(hasMemorySensor || hasImageMemorySensor) && (
                    <div className="flex flex-col sm:flex-row gap-4">
                        {hasMemorySensor && <MemoryPreview agentId={agentId} />}
                        {hasImageMemorySensor && <ImageMemoryPreview agentId={agentId} />}
                    </div>
                )}


                {/* Show warning only if no sensors are configured and no recent tools */}
                {!hasAnySensorPreviews && lastTools.length === 0 && <NoSensorsWarning />}
                <div className="grid grid-cols-1 gap-2">
                    {audioStreamsToDisplay.map(({ type, stream, title, icon }) => (
                        <AudioWaveform key={type} stream={stream} title={title} icon={icon} type={type} />
                    ))}
                </div>
            </div>

            {/* Right Column: Status and Response */}
            <div className="space-y-4 flex flex-col justify-start">
                <StateTicker status={liveStatus} />
                <LastResponse
                    response={isStreaming ? streamingResponse : lastResponse}
                    responseKey={isStreaming ? -1 : responseKey}
                />
                {/* Tool Status - Show below last response only if there are tools */}
                {lastTools.length > 0 && (
                    <div className="max-h-32 overflow-y-auto">
                        <ToolStatus
                            tools={lastTools}
                            variant="compact"
                        />
                    </div>
                )}
            </div>
        </div>
    );
};

export default ActiveAgentView;
