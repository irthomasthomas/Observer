// src/components/AgentLogViewer.tsx
import React, { useState, useEffect } from 'react';
import { 
  Brain, HelpCircle, 
  Monitor, Clipboard, Camera, Mic, CheckCircle, XCircle, Clock, RotateCcw,
  ScanText, Bell, Mail, Send, MessageSquare, MessageSquarePlus, 
  MessageSquareQuote, PlayCircle, StopCircle, Video, VideoOff, Tag, SquarePen, Hourglass
} from 'lucide-react';
import FeedbackBubble from '../FeedbackBubble';
import { IterationStore, IterationData, SensorData, ToolCall } from '../../utils/IterationStore';

// Simple icon components for tools
const getToolIcon = (toolName: string) => {
  const iconMap: Record<string, React.ElementType> = {
    sendDiscordBot: () => <Send className="w-4 h-4" />,
    sendWhatsapp: () => <MessageSquare className="w-4 h-4" />,
    sendSms: () => <MessageSquarePlus className="w-4 h-4" />,
    sendPushover: () => <Send className="w-4 h-4" />,
    sendEmail: Mail,
    notify: Bell,
    system_notify: Bell,
    getMemory: Brain,
    setMemory: SquarePen,
    appendMemory: SquarePen,
    startAgent: PlayCircle,
    stopAgent: StopCircle,
    time: Hourglass,
    startClip: Video,
    stopClip: VideoOff,
    markClip: Tag,
    ask: MessageSquareQuote,
    message: MessageSquare,
  };
  return iconMap[toolName] || CheckCircle;
};

// Simple sensor icon mapping
const getSensorIcon = (sensorType: string) => {
  const iconMap: Record<string, React.ElementType> = {
    screenshot: Monitor,
    camera: Camera,
    ocr: ScanText,
    audio: Mic,
    clipboard: Clipboard,
    memory: Brain,
  };
  return iconMap[sensorType] || Monitor;
};

interface AgentLogViewerProps {
  agentId: string;
  maxEntries?: number;
  maxHeight?: string;
  getToken: () => Promise<string | undefined>;
  isAuthenticated: boolean;
}

const AgentLogViewer: React.FC<AgentLogViewerProps> = ({
  agentId,
  maxEntries = 50,
  maxHeight = '400px',
  getToken,
  isAuthenticated
}) => {
  const [iterations, setIterations] = useState<IterationData[]>([]);
  const [runCycleCount, setRunCycleCount] = useState(0);

  useEffect(() => {
    // Get initial iterations
    const initialIterations = IterationStore.getIterationsForAgent(agentId);
    setIterations(initialIterations);
    setRunCycleCount(initialIterations.length);

    // Subscribe to updates
    const unsubscribe = IterationStore.subscribe(() => {
      const updatedIterations = IterationStore.getIterationsForAgent(agentId);
      setIterations(updatedIterations);
      setRunCycleCount(updatedIterations.length);
    });

    return unsubscribe;
  }, [agentId]);

  // Render sensor previews
  const renderSensorPreviews = (sensors: SensorData[], modelImages?: string[]) => {
    const allPreviews: React.ReactNode[] = [];
    let imageIndex = 0;

    // Process sensor data and match with corresponding images
    sensors.forEach((sensor, index) => {
      const SensorIcon = getSensorIcon(sensor.type);
      
      if (sensor.type === 'screenshot' || sensor.type === 'camera') {
        // Show image thumbnail with sensor type
        const hasImage = modelImages && imageIndex < modelImages.length;
        const imageData = hasImage ? modelImages[imageIndex] : null;
        
        allPreviews.push(
          <div key={index} className="flex items-center gap-1.5 bg-gray-100 px-2 py-1 rounded text-xs">
            <SensorIcon className="w-4 h-4 text-blue-600" />
            {imageData ? (
              <img 
                src={`data:image/png;base64,${imageData}`}
                alt={`${sensor.type} ${imageIndex + 1}`}
                className="w-6 h-6 rounded-sm border border-gray-200 object-cover"
                onError={(e) => {
                  const imgElement = e.target as HTMLImageElement;
                  imgElement.src = `data:image/jpeg;base64,${imageData}`;
                }}
              />
            ) : (
              <span className="text-gray-700 capitalize">{sensor.type}</span>
            )}
          </div>
        );
        
        if (hasImage) imageIndex++;
      } else if (sensor.type === 'ocr' || sensor.type === 'clipboard') {
        const preview = typeof sensor.content === 'string' 
          ? sensor.content.slice(0, 30) + (sensor.content.length > 30 ? '...' : '')
          : 'text';
        allPreviews.push(
          <div key={index} className="flex items-center gap-1.5 bg-gray-100 px-2 py-1 rounded text-xs">
            <SensorIcon className="w-3 h-3 text-gray-600" />
            <span className="text-gray-700 truncate max-w-[150px]">{preview}</span>
          </div>
        );
      } else if (sensor.type === 'audio') {
        const transcript = sensor.content?.transcript || '';
        const preview = transcript.slice(0, 30) + (transcript.length > 30 ? '...' : '');
        const source = sensor.source ? `(${sensor.source})` : '';
        allPreviews.push(
          <div key={index} className="flex items-center gap-1.5 bg-gray-100 px-2 py-1 rounded text-xs">
            <SensorIcon className="w-3 h-3 text-gray-600" />
            <span className="text-gray-700 truncate max-w-[150px]">{preview} {source}</span>
          </div>
        );
      } else {
        allPreviews.push(
          <div key={index} className="flex items-center gap-1">
            <SensorIcon className="w-4 h-4 text-gray-600" />
            <span className="text-xs text-gray-500">{sensor.type}</span>
          </div>
        );
      }
    });
    
    if (allPreviews.length === 0) {
      return (
        <div className="flex items-center gap-1 text-gray-400 text-xs">
          <HelpCircle className="w-3 h-3" />
          <span>No sensors</span>
        </div>
      );
    }

    return (
      <div className="flex items-center flex-wrap gap-2">
        {allPreviews}
      </div>
    );
  };

  // Render model response preview
  const renderModelPreview = (response?: string) => {
    if (!response) {
      return <span className="text-gray-400 text-xs italic">No response</span>;
    }
    
    const preview = response.slice(0, 60);
    return (
      <div className="flex items-center gap-1.5">
        <Brain className="w-4 h-4 text-green-600 flex-shrink-0" />
        <span className="text-sm text-gray-700 truncate">
          "{preview}{response.length > 60 ? '...' : ''}"
        </span>
      </div>
    );
  };

  // Render tool indicators
  const renderToolIndicators = (tools: ToolCall[]) => {
    if (tools.length === 0) {
      return (
        <div className="text-xs text-gray-400 italic">
          No tools used
        </div>
      );
    }
    
    return (
      <div className="flex items-center gap-1.5">
        {tools.map((tool, index) => {
          const isSuccess = tool.status === 'success';
          const ToolIcon = getToolIcon(tool.name);
          
          return (
            <div key={index} className="flex items-center gap-0.5">
              <ToolIcon className={`w-4 h-4 ${isSuccess ? 'text-green-600' : 'text-red-600'}`} />
              {isSuccess ? (
                <CheckCircle className="w-3 h-3 text-green-600" />
              ) : (
                <XCircle className="w-3 h-3 text-red-600" />
              )}
            </div>
          );
        })}
      </div>
    );
  };

  // Main render
  if (iterations.length === 0) {
    return (
      <div className="p-4 text-center text-gray-500">
        <HelpCircle className="mx-auto h-8 w-8 text-gray-400 mb-2" />
        <p className="font-medium">No activity yet.</p>
        <p className="text-sm">Start the agent to see its activity log here.</p>
      </div>
    );
  }

  return (
    <div>
      {/* Feedback Bubble */}
      {runCycleCount >= 3 && (
        <div className="p-2 mb-4">
          <FeedbackBubble 
            agentId={agentId}
            getToken={getToken}
            isAuthenticated={isAuthenticated}
          />
        </div>
      )}

      <div
        className="overflow-y-auto scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-gray-100"
        style={{ maxHeight }}
      >
        <div className="space-y-4 p-2">
          {iterations.slice(0, maxEntries).map((iteration, index) => {
            const iterationNumber = iterations.length - index;
            
            return (
              <div 
                key={iteration.id} 
                className={`border rounded-lg p-4 transition-all duration-200 ${
                  iteration.hasError ? 'border-red-200 bg-red-50' : 'border-gray-200 bg-white'
                }`}
              >
                {/* Header */}
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2">
                      <RotateCcw className={`w-5 h-5 ${
                        iteration.hasError ? 'text-red-600' : 'text-blue-600'
                      }`} />
                      <span className="font-medium text-gray-900">
                        Iteration #{iterationNumber}
                      </span>
                    </div>
                    <div className="text-xs text-gray-500">
                      {new Date(iteration.startTime).toLocaleTimeString()}
                    </div>
                  </div>
                  
                  {iteration.duration !== undefined && (
                    <div className="flex items-center gap-1 text-sm text-gray-600">
                      <Clock className="w-4 h-4" />
                      <span>{iteration.duration.toFixed(1)}s</span>
                    </div>
                  )}
                </div>
                
                {/* Preview Content */}
                <div className="space-y-2">
                  {/* Sensors row */}
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-gray-500 w-16">SENSORS:</span>
                    {renderSensorPreviews(iteration.sensors, iteration.modelImages)}
                  </div>
                  
                  {/* Model response row */}
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-gray-500 w-16">MODEL:</span>
                    {renderModelPreview(iteration.modelResponse)}
                  </div>
                  
                  {/* Tools row */}
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-gray-500 w-16">TOOLS:</span>
                    {renderToolIndicators(iteration.tools)}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default AgentLogViewer;