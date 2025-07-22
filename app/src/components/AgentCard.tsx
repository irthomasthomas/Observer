// AgentCard.tsx

// MODIFIED: Removed 'useCallback' as it's not used.
import React, { useState, useEffect, useMemo, useRef, ReactNode } from 'react';
// MODIFIED: Removed unused icons: Code, User, MessageCircle
import { Edit, Trash2, ChevronDown, ChevronUp, Play, Terminal, Brain, Cpu, AlertTriangle, Eye, Activity, Clock, Power, Mic, Volume2, Zap, MessageSquareWarning, VideoOff } from 'lucide-react';
import { CompleteAgent } from '@utils/agent_database';
import AgentLogViewer from './AgentLogViewer';
// MODIFIED: Removed unused import for scheduling
// import { isAgentScheduled, getScheduledTime } from './ScheduleAgentModal';
import { isJupyterConnected } from '@utils/handlers/JupyterConfig';
import { listModels } from '@utils/ollamaServer';
import { getOllamaServerAddress } from '@utils/main_loop';
import { Logger, LogEntry } from '@utils/logging';
import { StreamManager, StreamState, AudioStreamType } from '@utils/streamManager';

/**
 * Defines the shape of the data needed by the UI to render an audio stream.
 */
interface UiAudioStream {
  type: AudioStreamType;
  stream: MediaStream;
  title: string;
  icon: ReactNode;
}

/**
 * Scans agent code for specific function calls that require warnings.
 * @param code The agent's JS or Python code as a string.
 * @returns An object indicating which communication methods are used.
 */
const getCommunicationWarnings = (code: string | undefined): { hasSms: boolean, hasWhatsapp: boolean } => {
  if (!code) {
    return { hasSms: false, hasWhatsapp: false };
  }

  const smsRegex = /\bsendSms\s*\(/;
  const whatsappRegex = /\bsendWhatsapp\s*\(/;

  const hasSms = smsRegex.test(code);
  const hasWhatsapp = whatsappRegex.test(code);

  return {
    hasSms,
    hasWhatsapp,
  };
};

/**
 * A "selector" function that takes the raw StreamState and returns only the audio
 * streams that should be displayed in the UI, respecting the 'allAudio' override.
 * This centralizes the display logic, keeping the render components clean.
 */
const getActiveAudioStreamsForDisplay = (state: StreamState): UiAudioStream[] => {
  // If the mixed stream exists, it is the ONLY one we should display.
  if (state.allAudioStream) {
    return [{
      type: 'allAudio',
      stream: state.allAudioStream,
      title: 'All Audio (Mixed)',
      icon: <><Volume2 className="w-3 h-3" /><Mic className="w-3 h-3 -ml-1" /></>
    }];
  }

  // Otherwise, collect any individual audio streams that are active.
  const activeStreams: UiAudioStream[] = [];
  if (state.microphoneStream) {
    activeStreams.push({
      type: 'microphone',
      stream: state.microphoneStream,
      title: 'Microphone',
      icon: <Mic className="w-4 h-4" />
    });
  }
  if (state.screenAudioStream) {
    activeStreams.push({
      type: 'screenAudio',
      stream: state.screenAudioStream,
      title: 'System Audio',
      icon: <Volume2 className="w-4 h-4" />
    });
  }

  return activeStreams;
};


type AgentLiveStatus = 'STARTING' | 'CAPTURING' | 'THINKING' | 'WAITING' | 'IDLE';

const AudioWaveform: React.FC<{ stream: MediaStream, title: string, icon: React.ReactNode }> = ({ stream, title, icon }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationFrameId = useRef<number>();

  useEffect(() => {
    if (!stream || !canvasRef.current || stream.getAudioTracks().length === 0) {
      return;
    }

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

      canvasCtx.fillStyle = '#1f2937'; // bg-gray-800
      canvasCtx.fillRect(0, 0, canvas.width, canvas.height);

      const barWidth = (canvas.width / bufferLength) * 2;
      let barHeight;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        barHeight = (dataArray[i] / 255) * canvas.height;
        canvasCtx.fillStyle = `rgba(52, 211, 153, ${barHeight / canvas.height})`; // a nice green
        canvasCtx.fillRect(x, canvas.height - barHeight, barWidth, barHeight);
        x += barWidth + 1;
      }
    };

    draw();

    return () => {
      // Cleanup on unmount
      if (animationFrameId.current) {
        cancelAnimationFrame(animationFrameId.current);
      }
      source.disconnect();
      analyser.disconnect();
      audioContext.close();
    };
  }, [stream]);

  return (
    <div className="bg-gray-800 rounded-lg p-3 flex-1 min-w-0 text-white flex flex-col gap-2">
       <div className="flex items-center gap-2 text-xs font-medium text-gray-300">
         {icon} {title}
       </div>
       <canvas ref={canvasRef} className="w-full h-12 rounded"></canvas>
    </div>
  );
};

const VideoStream: React.FC<{ stream: MediaStream }> = ({ stream }) => {
  const videoRef = React.useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  return (
    <div className="bg-black rounded-lg overflow-hidden aspect-video flex-1 min-w-0">
      <video ref={videoRef} muted autoPlay playsInline className="w-full h-full object-contain"></video>
    </div>
  );
};

interface AgentCardProps {
  agent: CompleteAgent;
  code?: string;
  isRunning: boolean;
  isStarting: boolean;
  isMemoryFlashing: boolean;
  onEdit: (agentId: string) => void;
  onDelete: (agentId: string) => Promise<void>;
  onToggle: (agentId: string, isRunning: boolean) => Promise<void>;
  onMemory: (agentId: string) => void;
  onShowJupyterModal: () => void;
  getToken: () => Promise<string | undefined>;
  isAuthenticated: boolean;
  hasQuotaError: boolean;
  onUpgradeClick: () => void;
  onSave: (agent: CompleteAgent, code: string) => Promise<void>;
}

// NEW: A dedicated component for placeholders when a stream is not available.
const NoStreamPlaceholder: React.FC<{ icon: React.ReactNode; text: string }> = ({ icon, text }) => (
  <div className="flex items-center justify-center gap-3 p-4 bg-gray-100 rounded-lg border border-dashed border-gray-300 text-gray-500">
    {icon}
    <span className="text-sm font-medium">{text}</span>
  </div>
);

// NEW: A dedicated component for the status indicator for cleanliness.
const AgentStatusPill: React.FC<{
  isRunning: boolean;
  isStarting: boolean;
  hasQuotaError: boolean;
}> = ({ isRunning, isStarting, hasQuotaError }) => {
  let text = 'Inactive';
  let colorClasses = 'bg-gray-100 text-gray-800'; // Default: Inactive

  if (hasQuotaError) {
    text = 'Limit Reached';
    colorClasses = 'bg-red-100 text-red-700';
  } else if (isStarting) {
    text = 'Starting';
    colorClasses = 'bg-yellow-100 text-yellow-800 animate-pulse';
  } else if (isRunning) {
    text = 'Active';
    colorClasses = 'bg-green-100 text-green-800';
  }

  return (
    <div className={`px-3 py-1 text-xs font-medium rounded-full inline-flex items-center ${colorClasses}`}>
      <div className={`w-2 h-2 rounded-full mr-1.5 ${hasQuotaError ? 'bg-red-500' : isStarting ? 'bg-yellow-500' : isRunning ? 'bg-green-500' : 'bg-gray-400'}`}></div>
      <span>{text}</span>
    </div>
  );
};

// RE-INTRODUCED: The component for displaying the quota error and upgrade button.
const QuotaErrorView: React.FC<{ onUpgradeClick: () => void }> = ({ onUpgradeClick }) => (
  <div className="mt-4 p-4 bg-orange-50 border-l-4 border-orange-400 rounded-r-lg animate-fade-in">
    <div className="flex items-start">
      <Zap className="h-6 w-6 text-orange-500 mr-3 flex-shrink-0" />
      <div>
        <h4 className="font-bold text-orange-800">Daily Limit Reached</h4>
        <p className="text-sm text-orange-700 mt-1">You've used all your free cloud credits for the day and the agent has been paused.</p>
      </div>
    </div>
    <button
      onClick={onUpgradeClick}
      className="w-full mt-4 inline-flex items-center justify-center px-4 py-2 border border-transparent text-sm font-bold rounded-md text-white bg-purple-600 hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500 transition-colors shadow-sm"
    >
      Upgrade to Pro
    </button>
  </div>
);


const CommunicationWarning: React.FC<{ warnings: { hasSms: boolean; hasWhatsapp: boolean } }> = ({ warnings }) => {
  if (!warnings.hasSms && !warnings.hasWhatsapp) {
    return null;
  }

  return (
    <div className="mt-4 p-3 bg-blue-50 border-l-4 border-blue-400 rounded-r-lg animate-fade-in">
      <div className="flex items-start">
        <MessageSquareWarning className="h-6 w-6 text-blue-500 mr-3 flex-shrink-0" />
        <div>
          <h4 className="font-bold text-blue-800">Notification Notice</h4>
          {warnings.hasWhatsapp && (
            <p className="text-sm text-blue-700 mt-1">
              <b>WhatsApp:</b> To receive messages, you must first message the number: +1 (555) 783-4727. This opens a 24-hour window due to Meta's policies.
            </p>
          )}
          {warnings.hasSms && (
            <p className="text-sm text-blue-700 mt-2">
              <b>SMS:</b> Delivery to US/Canada is currently unreliable due to carrier restrictions (A2P). It is recommend using email for now.
            </p>
          )}
        </div>
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

// MODIFIED: Removed unused LoopProgressBar component
// const LoopProgressBar...

const LastResponse: React.FC<{ response: string, responseKey: number }> = ({ response, responseKey }) => (
  <div key={responseKey} className="bg-white border border-gray-200 rounded-lg shadow-sm animate-fade-in min-h-0">
    <h4 className="text-xs font-semibold text-gray-500 mb-1 px-3 pt-2">Last Response</h4>
    <p className="text-sm text-gray-700 whitespace-pre-wrap max-h-40 overflow-y-auto scrollbar-thin px-3 pb-2">{response}</p>
  </div>
);

const ModelDropdown: React.FC<{
    currentModel: string;
    onModelChange: (modelName: string) => void;
}> = ({ currentModel, onModelChange }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [availableModels, setAvailableModels] = useState<{ name: string; multimodal?: boolean }[]>([]);
    const dropdownRef = useRef<HTMLDivElement>(null);

    const fetchModels = async () => {
        setIsLoading(true);
        setError(null);
        try {
            const serverDetails = getOllamaServerAddress();
            if (!serverDetails.host || !serverDetails.port) {
                throw new Error("Ollama server details not configured.");
            }
            const response = await listModels(serverDetails.host, serverDetails.port);
            if (response.error) {
                throw new Error(response.error);
            }
            setAvailableModels(response.models);
        } catch (e) {
            const errorMsg = e instanceof Error ? e.message : String(e);
            setError(`Failed to fetch models: ${errorMsg}`);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, []);

    const handleToggle = () => {
        if (!isOpen) {
            fetchModels();
        }
        setIsOpen(!isOpen);
    };

    const handleSelect = (modelName: string) => {
        onModelChange(modelName);
        setIsOpen(false);
    };

    return (
        <div className="relative inline-block text-left" ref={dropdownRef}>
            <div>
                {/* MODIFIED: Reduced padding, font size, and icon size for a smaller button */}
                <button
                    type="button"
                    className="inline-flex justify-center w-full rounded-md border border-gray-300 shadow-sm px-2.5 py-1.5 bg-white text-xs font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-100 focus:ring-indigo-500"
                    onClick={handleToggle}
                >
                    <span className="truncate max-w-[150px]">{currentModel || 'Select Model'}</span>
                    <ChevronDown className="-mr-1 ml-1.5 h-4 w-4" aria-hidden="true" />
                </button>
            </div>
            {/* MODIFIED: Made the dropdown panel narrower */}
            {isOpen && (
                <div className="origin-top-right absolute right-0 mt-2 w-48 rounded-md shadow-lg bg-white ring-1 ring-black ring-opacity-5 focus:outline-none z-10">
                    <div className="py-1" role="menu" aria-orientation="vertical" aria-labelledby="options-menu">
                        {isLoading && <div className="px-3 py-1.5 text-xs text-gray-500">Loading...</div>}
                        {error && <div className="px-3 py-1.5 text-xs text-red-600">{error}</div>}
                        {!isLoading && !error && availableModels.length === 0 && (
                            <div className="px-3 py-1.5 text-xs text-gray-500">No models found.</div>
                        )}
                        {!isLoading && !error && availableModels.map((model) => (
                            <button
                                key={model.name}
                                onClick={() => handleSelect(model.name)}
                                /* MODIFIED: Reduced padding and font size for list items */
                                className={`${
                                    model.name === currentModel ? 'bg-gray-100 text-gray-900' : 'text-gray-700'
                                } block w-full text-left px-3 py-1.5 text-xs hover:bg-gray-100 hover:text-gray-900`}
                                role="menuitem"
                            >
                                <div className="flex items-center justify-between">
                                  <span className="truncate">{model.name}</span>
                                  {model.multimodal && <Eye className="h-4 w-4 text-purple-600" />}
                                </div>
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

const AgentCard: React.FC<AgentCardProps> = ({
  agent,
  code,
  isRunning,
  isStarting,
  isMemoryFlashing,
  onEdit,
  onDelete,
  onToggle,
  onMemory,
  onShowJupyterModal,
  getToken,
  isAuthenticated,
  hasQuotaError,
  onUpgradeClick,
  onSave
}) => {
  const [activityExpanded, setActivityExpanded] = useState(false);
  const [isPythonAgent, setIsPythonAgent] = useState(false);
  const [startWarning, setStartWarning] = useState<string | null>(null);
  const [isCheckingModel, setIsCheckingModel] = useState(false);
  const [liveStatus, setLiveStatus] = useState<AgentLiveStatus>('IDLE');
  const [lastResponse, setLastResponse] = useState<string>('...');
  const [loopProgress, setLoopProgress] = useState(0);
  const [responseKey, setResponseKey] = useState(0);
  const [currentModel, setCurrentModel] = useState(agent.model_name);
  const initialModelRef = useRef(agent.model_name);

  const showStartingState = useMemo(() => isStarting || isCheckingModel, [isStarting, isCheckingModel]);
  const isLive = useMemo(() => (isRunning || showStartingState) && !hasQuotaError, [isRunning, showStartingState, hasQuotaError]);

  const [streams, setStreams] = useState<StreamState>({
    cameraStream: null,
    screenVideoStream: null,
    screenAudioStream: null,
    microphoneStream: null,
    allAudioStream: null
  });

  const communicationWarnings = useMemo(() => {
    return getCommunicationWarnings(code);
  }, [code]);

  useEffect(() => {
    if (code && code.trim().startsWith('#python')) {
      setIsPythonAgent(true);
    } else {
      setIsPythonAgent(false);
    }
  }, [code]);

  useEffect(() => {
    // Only trigger save if the model has actually changed from its initial value
    // and the necessary props are available.
    if (currentModel !== initialModelRef.current && onSave && code !== undefined) {
      console.log(`Model changed from "${initialModelRef.current}" to "${currentModel}". Saving...`);
      const updatedAgent = { ...agent, model_name: currentModel };
      onSave(updatedAgent, code);
      
      // Update the ref to prevent re-saving if the component re-renders for other reasons
      initialModelRef.current = currentModel;
    }
  }, [currentModel, agent, code, onSave]);

  useEffect(() => {
    setCurrentModel(agent.model_name);
    initialModelRef.current = agent.model_name;
  }, [agent.model_name]);

  useEffect(() => {
    const handleStreamUpdate = (newState: StreamState) => {
      setStreams(newState);
    };
    StreamManager.addListener(handleStreamUpdate);
    return () => {
      StreamManager.removeListener(handleStreamUpdate);
    };
  }, []);

  useEffect(() => {
    if (hasQuotaError) {
      setLiveStatus('IDLE');
      setLastResponse('Agent paused due to daily credit limit.');
      return;
    }

    if (showStartingState && !isRunning) {
        setLiveStatus('STARTING');
        setLastResponse('Agent is preparing to start...');
        return;
    }

    if (isRunning) {
      if (liveStatus === 'STARTING' || liveStatus === 'IDLE') {
          setLiveStatus('CAPTURING');
      }
      const handleNewLog = (log: LogEntry) => {
        if (log.source !== agent.id) return;
        if (log.details?.logType === 'model-prompt') {
          setLiveStatus('THINKING');
          setLoopProgress(0);
        } else if (log.details?.logType === 'model-response') {
          setLiveStatus('WAITING');
          setLastResponse(log.details.content as string);
          setResponseKey(key => key + 1);
        }
      };
      Logger.addListener(handleNewLog);
      return () => Logger.removeListener(handleNewLog);
    } else {
      setLiveStatus('IDLE');
    }
  }, [isRunning, showStartingState, agent.id, liveStatus, hasQuotaError]);

  useEffect(() => {
    let timer: NodeJS.Timeout | null = null;
    if (isRunning && liveStatus === 'WAITING' && !hasQuotaError) {
      const interval = 100;
      const totalDuration = agent.loop_interval_seconds * 1000;
      const increment = (interval / totalDuration) * 100;
      timer = setInterval(() => {
        setLoopProgress(prev => {
          const newProgress = prev + increment;
          if (newProgress >= 100) {
            clearInterval(timer!);
            setLiveStatus('CAPTURING');
            return 0;
          }
          return newProgress;
        });
      }, interval);
    }
    return () => { if (timer) clearInterval(timer); };
  }, [isRunning, liveStatus, agent.loop_interval_seconds, hasQuotaError]);

  const handleToggle = async () => {
    if (!isRunning) {
        setStartWarning(null);
        setIsCheckingModel(true);
        const agentModelName = currentModel;
        if (!agentModelName || agentModelName.trim() === "") {
          setStartWarning(`This agent needs a model configured. Please edit the agent to select a model.`);
          setIsCheckingModel(false);
          return;
        }

        let isModelAvailable = false;
        try {
          const serverDetails = getOllamaServerAddress();
          if (!serverDetails.host || !serverDetails.port) {
              throw new Error("Ollama server details not configured.");
          }
          const modelsResponse = await listModels(serverDetails.host, serverDetails.port);
          if (modelsResponse.error) {
            setStartWarning(`Could not verify model availability. Error: ${modelsResponse.error}`);
            setIsCheckingModel(false);
            return;
          }
          isModelAvailable = modelsResponse.models.some(model => model.name === agentModelName);
        } catch (e) {
          const errorMsg = e instanceof Error ? e.message : String(e);
          setStartWarning(`Could not verify model availability. Error: ${errorMsg}.`);
          setIsCheckingModel(false);
          return;
        }

        if (!isModelAvailable) {
          setStartWarning(`Model "${agentModelName}" is not available. Check server settings or edit the agent.`);
          setIsCheckingModel(false);
          return;
        }

        if (isPythonAgent && !isJupyterConnected()) {
          onShowJupyterModal();
          setIsCheckingModel(false);
          return;
        }

        setIsCheckingModel(false);
        onToggle(agent.id, isRunning);
      } else {
        setStartWarning(null);
        onToggle(agent.id, isRunning);
      }
  };

  return (
    <div className="relative bg-white rounded-xl shadow-sm border border-gray-200 transition-all duration-300 flex flex-col">

      {/* === OMNIPRESENT PROGRESS BAR === */}
      {isRunning && liveStatus === 'WAITING' && (
        <div className="absolute top-0 left-0 right-0 h-1 z-10">
          <div
            className="h-full bg-green-500 transition-all duration-150 ease-linear"
            style={{ width: `${loopProgress}%` }}
          />
        </div>
      )}

      {/* === CARD BODY === */}
      <div className="p-5 flex-grow">
        {/* --- Header: Status, Name, and Start/Stop Button --- */}
        <div className="flex justify-between items-center mb-4">
           <div className="flex-1 min-w-0">
             {!isLive && !hasQuotaError ? ( // Show name on left only when fully static
                <>
                  <h3 className="text-xl font-bold text-gray-800 truncate">
                    {agent.name}
                  </h3>
                  <div className="mt-1">
                    <AgentStatusPill isRunning={isRunning} isStarting={showStartingState} hasQuotaError={hasQuotaError} />
                  </div>
                </>
             ) : (
                <AgentStatusPill isRunning={isRunning} isStarting={showStartingState} hasQuotaError={hasQuotaError} />
             )}
           </div>

           {(isLive || hasQuotaError) && ( // Show centered name when live or in error state
             <h3 className="text-xl font-bold text-gray-800 truncate text-center flex-1 px-4">
               {agent.name}
             </h3>
           )}

           <div className="flex-1 flex justify-end">
             <button
               onClick={handleToggle}
               className={`px-4 py-2 rounded-lg font-medium flex-shrink-0 flex items-center transition-colors text-sm ${
                 hasQuotaError
                   ? 'bg-red-100 text-red-700 cursor-not-allowed'
                   : showStartingState
                   ? 'bg-yellow-100 text-yellow-700 cursor-wait'
                   : isRunning
                   ? 'bg-red-100 text-red-700 hover:bg-red-200'
                   : 'bg-green-100 text-green-700 hover:bg-green-200'
               }`}
               disabled={showStartingState || hasQuotaError}
             >
               {hasQuotaError ? (
                   <><Zap className="w-4 h-4 mr-2" /> Limit</>
               ) : showStartingState ? (
                   <>{isCheckingModel ? 'Checking...' : 'Starting...'}</>
               ) : isRunning ? (
                   <><Power className="w-4 h-4 mr-2" /> Stop</>
               ) : (
                   <><Play className="w-4 h-4 mr-2" /> Start</>
               )}
             </button>
           </div>
        </div>

        {/* --- MODIFIED Content Area: Prioritizes Quota Error View --- */}
        <div>
          {hasQuotaError ? (
            <QuotaErrorView onUpgradeClick={onUpgradeClick} />
          ) : isLive ? (
            // --- LIVE VIEW ---
            <div className="grid md:grid-cols-2 md:gap-6">
              <div className="space-y-4 animate-fade-in">
                {streams.screenVideoStream && <VideoStream stream={streams.screenVideoStream} />}
                {streams.cameraStream && <VideoStream stream={streams.cameraStream} />}
                {!streams.screenVideoStream && !streams.cameraStream && (
                    <NoStreamPlaceholder
                        icon={<VideoOff className="w-5 h-5" />}
                        text="No Video Stream"
                    />
                )}
                <div className="grid grid-cols-1 gap-2">
                    {getActiveAudioStreamsForDisplay(streams).map(({ type, stream, title, icon }) => (
                      <AudioWaveform key={type} stream={stream} title={title} icon={icon} />
                    ))}
                </div>
              </div>
              <div className="space-y-4 animate-fade-in flex flex-col justify-start">
                 <StateTicker status={liveStatus} />
                 <LastResponse response={lastResponse} responseKey={responseKey} />
              </div>
            </div>
          ) : (
            // --- STATIC VIEW ---
            <div className="space-y-4 animate-fade-in">
              <p className="text-sm text-gray-600">{agent.description || "No description provided."}</p>
              <div className="flex items-center flex-wrap gap-x-4 gap-y-2 text-sm text-gray-500">
                  <div className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${isPythonAgent ? 'bg-blue-100 text-blue-800' : 'bg-amber-100 text-amber-800'}`}>
                    {isPythonAgent ? 'Python' : 'JavaScript'}
                  </div>
                  <div className="inline-flex items-center"><Cpu className="w-4 h-4 mr-1.5" /><ModelDropdown currentModel={currentModel} onModelChange={setCurrentModel} /></div>
                  <div className="inline-flex items-center"><Clock className="w-4 h-4 mr-1.5" />{agent.loop_interval_seconds}s</div>
              </div>
              {startWarning && (<div className="mt-2 p-3 bg-yellow-50 border border-yellow-200 text-yellow-800 rounded-md text-sm flex items-center gap-2"><AlertTriangle className="h-5 w-5 flex-shrink-0" /><span>{startWarning}</span></div>)}
              <CommunicationWarning warnings={communicationWarnings} />
            </div>
          )}
        </div>
      </div>

      {/* === FOOTER: This part is consistent across both states === */}
      <div className="border-t border-gray-100 bg-gray-50/75 px-4 py-2 flex justify-between items-center">
        {/* Left Side: Edit/Delete */}
        <div className="flex items-center gap-2">
            <button onClick={() => onEdit(agent.id)} className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-200 rounded-md"><Edit className="w-4 h-4" /> Edit</button>
            <button onClick={() => onDelete(agent.id)} className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-red-600 hover:bg-red-100 rounded-md"><Trash2 className="w-4 h-4" /> Delete</button>
        </div>

        {/* Right Side: Memory/Jupyter and Activity Log */}
        <div className="flex items-center gap-2">
             {isPythonAgent ? (
                <button onClick={onShowJupyterModal} className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md ${isJupyterConnected() ? 'text-green-700 bg-green-50' : 'text-red-700 bg-red-50 hover:bg-red-100'}`}>
                    <Terminal className="w-4 h-4" /> Jupyter
                </button>
            ) : (
                <button onClick={() => onMemory(agent.id)} className={`flex items-center gap-1.5 px-3 py-1.5 text-sm text-purple-600 hover:bg-purple-100 rounded-md ${isMemoryFlashing ? 'animate-pulse' : ''}`}>
                    <Brain className="w-4 h-4" /> Memory
                </button>
            )}
            <button onClick={() => setActivityExpanded(!activityExpanded)} className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-blue-600 hover:bg-blue-100 rounded-md">
                {activityExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                Activity
            </button>
        </div>
      </div>

      {/* EXPANDABLE LOGS SECTION */}
      {activityExpanded && (
        <div className="border-t border-gray-200 p-4 bg-gray-50">
            <AgentLogViewer
              agentId={agent.id}
              getToken={getToken}
              isAuthenticated={isAuthenticated}
            />
        </div>
      )}
    </div>
  );
};

export default AgentCard;
