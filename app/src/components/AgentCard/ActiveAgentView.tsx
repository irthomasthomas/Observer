// components/AgentCard/ActiveAgentView.tsx
import React, { useMemo, useRef, useEffect, ReactNode, useState } from 'react';
import { Eye, Clock, Power, Activity, VideoOff, Mic, Volume2 } from 'lucide-react';
import { StreamState, AudioStreamType } from '@utils/streamManager';

type AgentLiveStatus = 'STARTING' | 'CAPTURING' | 'THINKING' | 'WAITING' | 'IDLE';

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

const AudioWaveform: React.FC<{ stream: MediaStream, title: string, icon: React.ReactNode }> = ({ stream, title, icon }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationFrameId = useRef<number>();

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
    <div className="bg-gray-800 rounded-lg p-3 flex-1 min-w-0 text-white flex flex-col gap-2">
       <div className="flex items-center gap-2 text-xs font-medium text-gray-300">{icon} {title}</div>
       <canvas ref={canvasRef} className="w-full h-12 rounded"></canvas>
    </div>
  );
};

const VideoStream: React.FC<{ stream: MediaStream }> = ({ stream }) => {
  const videoRef = React.useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (videoRef.current && stream) videoRef.current.srcObject = stream;
  }, [stream]);
  return (
    <div className="bg-black rounded-lg overflow-hidden aspect-video flex-1 min-w-0">
      <video ref={videoRef} muted autoPlay playsInline className="w-full h-full object-contain"></video>
    </div>
  );
};

const NoStreamPlaceholder: React.FC<{ icon: React.ReactNode; text: string }> = ({ icon, text }) => (
  <div className="flex items-center justify-center gap-3 p-4 bg-gray-100 rounded-lg border border-dashed border-gray-300 text-gray-500">
    {icon}
    <span className="text-sm font-medium">{text}</span>
  </div>
);

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
}

const ActiveAgentView: React.FC<ActiveAgentViewProps> = ({
    streams,
    liveStatus,
    lastResponse,
    responseKey,
    agentId
}) => {
    const audioStreamsToDisplay = useMemo(() => getActiveAudioStreamsForDisplay(streams), [streams]);
    const [streamingResponse, setStreamingResponse] = useState('');
    const [isStreaming, setIsStreaming] = useState(false);

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
            {/* Left Column: Media Streams */}
            <div className="space-y-4">
                {streams.screenVideoStream && <VideoStream stream={streams.screenVideoStream} />}
                {streams.cameraStream && <VideoStream stream={streams.cameraStream} />}
                {!streams.screenVideoStream && !streams.cameraStream && (
                    <NoStreamPlaceholder
                        icon={<VideoOff className="w-5 h-5" />}
                        text="No Video Stream"
                    />
                )}
                <div className="grid grid-cols-1 gap-2">
                    {audioStreamsToDisplay.map(({ type, stream, title, icon }) => (
                        <AudioWaveform key={type} stream={stream} title={title} icon={icon} />
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
            </div>
        </div>
    );
};

export default ActiveAgentView;
