import React, { useState, useEffect, useMemo, useRef, ReactNode } from 'react';
import { Edit, Trash2, MessageCircle, ChevronDown, ChevronUp, Play, Terminal, Code, User, Brain, AlertTriangle, Eye, Activity, Clock, Power, Mic, Volume2, Zap } from 'lucide-react'; // Added Zap
import { CompleteAgent } from '@utils/agent_database';
import AgentLogViewer from './AgentLogViewer';
import { isAgentScheduled, getScheduledTime } from './ScheduleAgentModal';
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
  // --- NEW PROPS ---
  hasQuotaError: boolean;
  onUpgradeClick: () => void;
}

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
  // --- DESTRUCTURE NEW PROPS ---
  hasQuotaError,
  onUpgradeClick,
}) => {
  const [activityExpanded, setActivityExpanded] = useState(false);
  const [isPythonAgent, setIsPythonAgent] = useState(false);
  const [startWarning, setStartWarning] = useState<string | null>(null);
  const [isCheckingModel, setIsCheckingModel] = useState(false);
  const [liveStatus, setLiveStatus] = useState<AgentLiveStatus>('IDLE');
  const [lastResponse, setLastResponse] = useState<string>('...');
  const [loopProgress, setLoopProgress] = useState(0);
  const [responseKey, setResponseKey] = useState(0);
  const showStartingState = isStarting || isCheckingModel;

  const [streams, setStreams] = useState<StreamState>({ 
    cameraStream: null,
    screenVideoStream: null,
    screenAudioStream: null,
    microphoneStream: null,
    allAudioStream: null
  });

  useEffect(() => {
    if (code && code.trim().startsWith('#python')) {
      setIsPythonAgent(true);
    } else {
      setIsPythonAgent(false);
    }
  }, [code]);
  
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
    // If there's a quota error, the agent should effectively be 'IDLE' and not attempt to run.
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
  }, [isRunning, showStartingState, agent.id, liveStatus, hasQuotaError]); // Added hasQuotaError

  useEffect(() => {
    let timer: NodeJS.Timeout | null = null;
    if (isRunning && liveStatus === 'WAITING' && !hasQuotaError) { // Ensure not running on error
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
  }, [isRunning, liveStatus, agent.loop_interval_seconds, hasQuotaError]); // Added hasQuotaError

  const handleToggle = async () => {
    if (!isRunning) {
        setStartWarning(null);
        setIsCheckingModel(true);
        const agentModelName = agent.model_name;
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
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden transition-all duration-300">
      <style>{`
        @keyframes pulse-grow { 0%, 100% { transform: scale(1); opacity: 1; } 50% { transform: scale(1.1); opacity: 0.8; } }
        .animate-pulse-grow { animation: pulse-grow 2s infinite ease-in-out; }
        @keyframes subtle-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.7; } }
        .animate-subtle-pulse { animation: subtle-pulse 1.5s infinite ease-in-out; }
        @keyframes fade-in { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        .animate-fade-in { animation: fade-in 0.5s ease-out forwards; }
      `}</style>
      
      <div className="p-5 pb-0 flex justify-between items-start">
        <div className={`px-4 py-2 rounded-lg text-sm font-medium flex items-center ${ isPythonAgent ? 'bg-blue-50 text-blue-700' : 'bg-amber-50 text-amber-700'}`}>
          {isPythonAgent ? <><Terminal className="w-4 h-4 mr-2" /> Python</> : <><Code className="w-4 h-4 mr-2" /> JavaScript</>}
        </div>
        {/* Disable Start/Stop button if a quota error is present */}
        <button onClick={handleToggle} className={`px-6 py-2.5 rounded-lg font-medium flex items-center transition-colors ${ hasQuotaError ? 'bg-red-100 text-red-700 cursor-not-allowed' : showStartingState ? 'bg-yellow-100 text-yellow-700 cursor-wait' : isRunning ? 'bg-red-100 text-red-700 hover:bg-red-200' : 'bg-green-100 text-green-700 hover:bg-green-200'}`} disabled={showStartingState || hasQuotaError}>
          {hasQuotaError ? 'Limit Reached' : showStartingState ? (
            <>{isCheckingModel ? 'Checking...' : 'Starting...'}</>
          ) : isRunning ? 'Stop' : <><Play className="w-5 h-5 mr-1" />Start</>}
        </button>
      </div>
      
      <div className="p-5">
        <div className="flex gap-4">
          <div className="w-20 flex-shrink-0 flex flex-col items-center gap-3">
            <div className={`w-20 h-20 ${isPythonAgent ? 'bg-blue-100' : 'bg-amber-100'} rounded-full flex items-center justify-center`}>
              <div className={`w-12 h-12 ${isPythonAgent ? 'bg-blue-500' : 'bg-amber-500'} rounded-full flex items-center justify-center ${isRunning && !showStartingState && !hasQuotaError ? 'animate-pulse-grow' : ''}`}>
                <User className="w-7 h-7 text-white" />
              </div>
            </div>
            <AgentPersistentControls isPythonAgent={isPythonAgent} jupyterConnected={isJupyterConnected()} isMemoryFlashing={isMemoryFlashing} onMemory={() => onMemory(agent.id)}/>
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-2xl font-semibold text-gray-800 truncate">{agent.name}</h3>
            {/* Conditional rendering logic */}
            {isRunning || showStartingState ? (
              <LiveAgentView status={liveStatus} lastResponse={lastResponse} responseKey={responseKey} loopProgress={loopProgress} loopInterval={agent.loop_interval_seconds} streams={streams}/>
            ) : (
              <StaticAgentInfo 
                agent={agent} 
                startWarning={startWarning} 
                onEdit={onEdit} 
                onDelete={onDelete}
                // --- PASS PROPS DOWN ---
                hasQuotaError={hasQuotaError}
                onUpgradeClick={onUpgradeClick}
              />
            )}
          </div>
        </div>
      </div>
      
      <div>
         <button onClick={() => setActivityExpanded(!activityExpanded)} className="w-full px-5 py-4 flex items-center border-t border-gray-100 hover:bg-gray-50 transition-colors">
          <MessageCircle className="w-6 h-6 text-blue-500 mr-2" />
          <span className="text-xl font-medium">Activity Log</span>
          <div className="ml-auto">
            {activityExpanded ? <ChevronUp className="w-5 h-5 text-gray-400" /> : <ChevronDown className="w-5 h-5 text-gray-400" />}
          </div>
        </button>
        {activityExpanded && (
          <div className="border-t border-gray-100 p-4 bg-gray-50/50">
            <AgentLogViewer 
              agentId={agent.id}
              getToken={getToken}
              isAuthenticated={isAuthenticated}
            />
          </div>
        )}
      </div>
    </div>
  );
};

const AgentPersistentControls: React.FC<{isPythonAgent: boolean, jupyterConnected: boolean, isMemoryFlashing: boolean, onMemory: () => void,}> = ({ isPythonAgent, jupyterConnected, isMemoryFlashing, onMemory }) => {
  if (isPythonAgent) {
    return (
      <div className={`mt-1 flex items-center text-xs ${jupyterConnected ? 'text-green-600' : 'text-red-600'}`}>
        <Terminal className="h-8 w-8 mr-1" />
      </div>
    );
  }
  return (
    <button onClick={onMemory} className="mt-1 text-purple-600 hover:text-purple-800 flex items-center text-xs">
      <Brain className={`h-8 w-8 mr-1 ${isMemoryFlashing ? 'animate-pulse' : ''}`} />
    </button>
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

const LoopProgressBar: React.FC<{ progress: number, interval: number }> = ({ progress, interval }) => (
  <div>
    <div className="flex justify-between items-center mb-1 text-xs text-gray-500">
      <span>Next cycle in {interval}s</span>
      <span>{Math.round(progress)}%</span>
    </div>
    <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
      <div className="bg-green-500 h-2 rounded-full transition-all duration-100 ease-linear" style={{ width: `${progress}%` }}/>
    </div>
  </div>
);

const LastResponse: React.FC<{ response: string, responseKey: number }> = ({ response, responseKey }) => (
  <div key={responseKey} className="bg-white border border-gray-200 rounded-lg shadow-sm animate-fade-in min-h-0">
    <h4 className="text-xs font-semibold text-gray-500 mb-1 px-3 pt-2">Last Response</h4>
    <p className="text-sm text-gray-700 whitespace-pre-wrap max-h-24 overflow-y-auto scrollbar-thin px-3 pb-2">{response}</p>
  </div>
);

const LiveAgentView: React.FC<{status: AgentLiveStatus, lastResponse: string, responseKey: number, loopProgress: number, loopInterval: number, streams: StreamState}> = ({ status, lastResponse, responseKey, loopProgress, loopInterval, streams }) => {
  
  const displayableAudioStreams = useMemo(() => getActiveAudioStreamsForDisplay(streams), [streams]);

  return (
    <div className="mt-2 space-y-3">
      <StateTicker status={status} />
      {status === 'WAITING' && (<div className="animate-fade-in"><LoopProgressBar progress={loopProgress} interval={loopInterval} /></div>)}
      
      {(streams.screenVideoStream || streams.cameraStream) && (
        <div className="flex gap-2 animate-fade-in">
          {streams.screenVideoStream && <VideoStream stream={streams.screenVideoStream} />}
          {streams.cameraStream && <VideoStream stream={streams.cameraStream} />}
        </div>
      )}

      {/* It renders only if the selector returns streams, and then simply maps over them. */}
      {displayableAudioStreams.length > 0 && (
        <div className="flex gap-2 animate-fade-in">
          {displayableAudioStreams.map(({ type, stream, title, icon }) => (
            <AudioWaveform
              key={type}
              stream={stream}
              title={title}
              icon={icon}
            />
          ))}
        </div>
      )}

      <LastResponse response={lastResponse} responseKey={responseKey} />
    </div>
  );
};


// --- NEW COMPONENT FOR QUOTA ERROR ---
const QuotaErrorView: React.FC<{ onUpgradeClick: () => void }> = ({ onUpgradeClick }) => (
  <div className="mt-2 p-4 bg-orange-50 border-l-4 border-orange-400 rounded-lg animate-fade-in">
    <div className="flex items-start">
      <Zap className="h-6 w-6 text-orange-500 mr-3 flex-shrink-0" />
      <div>
        <h4 className="font-bold text-orange-800">Daily Limit Reached</h4>
        <p className="text-sm text-orange-700 mt-1">You've used all your free cloud credits for the day!</p>
      </div>
    </div>
    <button
      onClick={onUpgradeClick}
      className="w-full mt-4 inline-flex items-center justify-center px-4 py-2 border border-transparent text-sm font-bold rounded-md text-white bg-purple-600 hover:bg-purple-700 transition-colors shadow-sm"
    >
      Upgrade to Pro
    </button>
  </div>
);


// --- UPDATED StaticAgentInfo COMPONENT ---
const StaticAgentInfo: React.FC<{
  agent: CompleteAgent, 
  startWarning: string | null, 
  onEdit: (id: string) => void, 
  onDelete: (id: string) => Promise<void>,
  hasQuotaError: boolean, // New prop
  onUpgradeClick: () => void, // New prop
}> = (props) => {
  // --- RENDER QUOTA ERROR VIEW IF PROP IS TRUE ---
  if (props.hasQuotaError) {
    return <QuotaErrorView onUpgradeClick={props.onUpgradeClick} />;
  }

  // --- OTHERWISE, RENDER THE NORMAL INACTIVE VIEW ---
  return (
    <>
      <div className="flex items-center mt-1">
        <div className="w-3 h-3 rounded-full mr-2 bg-gray-400"></div>
        <span className="text-sm text-gray-600">Inactive</span>
      </div>
      <p className="mt-2 text-gray-600">{props.agent.description}</p>
      {props.startWarning && (<div className="mt-3 p-3 bg-yellow-50 border border-yellow-300 text-yellow-700 rounded-md text-sm"><div className="flex items-center"><AlertTriangle className="h-5 w-5 mr-2 flex-shrink-0" /><span>{props.startWarning}</span></div></div>)}
      <div className="mt-4 flex flex-wrap gap-2">
        <div className="px-3 py-1 bg-gray-100 rounded-lg text-sm text-gray-600">{props.agent.model_name || "No model set"}</div>
        <div className="px-3 py-1 bg-gray-100 rounded-lg text-sm text-gray-600">{props.agent.loop_interval_seconds}s</div>
        {isAgentScheduled(props.agent.id) && <div className="px-3 py-1 bg-yellow-50 rounded-lg text-sm text-yellow-700">Scheduled: {getScheduledTime(props.agent.id)?.toLocaleString()}</div>}
      </div>
      <div className="mt-5 flex gap-3">
        <button onClick={() => props.onEdit(props.agent.id)} className="px-5 py-2 rounded-lg flex items-center bg-gray-100 hover:bg-gray-200 text-gray-700"><Edit className="w-4 h-4 mr-2" /> Edit</button>
        <button onClick={() => props.onDelete(props.agent.id)} className="px-5 py-2 rounded-lg flex items-center bg-red-50 hover:bg-red-100 text-red-600"><Trash2 className="w-4 h-4 mr-2" /> Delete</button>
      </div>
    </>
  );
};

export default AgentCard;
