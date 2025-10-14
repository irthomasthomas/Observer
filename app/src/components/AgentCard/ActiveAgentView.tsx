// components/AgentCard/ActiveAgentView.tsx
import React, { useMemo, useEffect, useState } from 'react';
import { Clock, Power, Activity, Eye } from 'lucide-react';
import { StreamState } from '@utils/streamManager';
import { CompleteAgent } from '@utils/agent_database';
import { IterationStore, ToolCall } from '@utils/IterationStore';
import ToolStatus from '@components/AgentCard/ToolStatus';
import SensorPreviewPanel from './SensorPreviewPanel';

type AgentLiveStatus = 'STARTING' | 'CAPTURING' | 'THINKING' | 'WAITING' | 'SKIPPED' | 'IDLE';

// --- Helper Components ---

const StateTicker: React.FC<{ status: AgentLiveStatus }> = ({ status }) => {
  const statusInfo = useMemo(() => {
    switch (status) {
      case 'STARTING': return { icon: <Power className="w-5 h-5" />, text: 'Agent is starting...', color: 'text-yellow-600' };
      case 'CAPTURING': return { icon: <Eye className="w-5 h-5 animate-subtle-pulse" />, text: 'Capturing Inputs...', color: 'text-cyan-600' };
      case 'THINKING': return { icon: <Activity className="w-5 h-5" />, text: 'Model is thinking...', color: 'text-purple-600' };
      case 'SKIPPED': return { icon: <Clock className="w-5 h-5" />, text: 'No Change, Skipped Iteration...', color: 'text-orange-500' };
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

const LastResponse: React.FC<{ response: string, responseKey: number }> = ({ response, responseKey }) => {
  const scrollRef = React.useRef<HTMLParagraphElement>(null);
  const [autoScroll, setAutoScroll] = React.useState(true);
  const prevScrollHeightRef = React.useRef<number>(0);

  // Handle scroll events to detect user interaction
  const handleScroll = () => {
    if (!scrollRef.current) return;

    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    const isAtBottom = scrollTop + clientHeight >= scrollHeight - 5;

    // Enable auto-scroll if user scrolled to bottom, disable if scrolled up
    setAutoScroll(isAtBottom);
  };

  // Auto-scroll effect when content changes
  useEffect(() => {
    if (!scrollRef.current || !autoScroll) return;

    const { scrollHeight } = scrollRef.current;

    // Only scroll if content actually changed (new content added)
    if (scrollHeight !== prevScrollHeightRef.current) {
      scrollRef.current.scrollTop = scrollHeight;
      prevScrollHeightRef.current = scrollHeight;
    }
  }, [response, autoScroll]);

  // Reset auto-scroll when responseKey changes (new response started)
  useEffect(() => {
    setAutoScroll(true);
  }, [responseKey]);

  return (
    <div key={responseKey} className="bg-white border border-gray-200 rounded-lg shadow-sm animate-fade-in min-h-0">
      <h4 className="text-xs font-semibold text-gray-500 mb-1 px-3 pt-2">Last Response</h4>
      <p
        ref={scrollRef}
        onScroll={handleScroll}
        className="text-sm text-gray-700 whitespace-pre-wrap max-h-40 overflow-y-auto scrollbar-thin px-3 pb-2"
      >
        {response}
      </p>
    </div>
  );
};


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
    const [streamingResponse, setStreamingResponse] = useState('');
    const [isStreaming, setIsStreaming] = useState(false);
    const [lastTools, setLastTools] = useState<ToolCall[]>([]);

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
            {/* Left Column: Sensor Previews */}
            <SensorPreviewPanel
                agentId={agentId}
                streams={streams}
                systemPrompt={agent.system_prompt}
            />

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
