// src/components/Observer/RunningAgentsStrip.tsx
//
// Compact, non-intrusive strip of currently running/starting agents for the Observer tab —
// bigger than the minimized-agent chip (AgentChip), much smaller than a full AgentCard.
//
// Each chip shows the agent's LIVE feed (not a still capture) inside a ring that fills as
// the loop counts down to its next capture — when the ring completes, that's the moment
// the agent looks. This carries the "small local model watching a stream on a timer" idea
// without needing the full ActiveAgentView.

import React, { useEffect, useRef, useState } from 'react';
import { Square, Loader2, Bot } from 'lucide-react';
import type { CompleteAgent } from '@utils/agent_database';
import { StreamManager, StreamState } from '@utils/streamManager';
import { agentHasScreenSensor, agentHasCameraSensor } from '@components/AgentCard/agentCapabilities';
import PieTimer from '@components/AgentCard/PieTimer';

interface RunningAgentsStripProps {
  agents: CompleteAgent[];
  runningAgents: Set<string>;
  startingAgents: Set<string>;
  onToggle: (agentId: string, isCurrentlyRunning: boolean) => void;
  /** A chip is a preview, not the real card — clicking it (anywhere but the stop button)
   *  jumps to the Micro Agents tab where the full ActiveAgentView lives. */
  onSelectAgent?: (agentId: string) => void;
}

// Mirrors the loop/sleep progress tracking in AgentCard.tsx, trimmed down to just what the
// ring needs (no overrun handling — a slow response just leaves the ring sitting full until
// the next iteration-start event resets it, which is accurate: it's still waiting).
function useLoopRing(agentId: string) {
  const [progress, setProgress] = useState(0);
  const [durationMs, setDurationMs] = useState(0);
  const [isSleeping, setIsSleeping] = useState(false);
  const startRef = useRef(0);
  const durationRef = useRef(0);

  useEffect(() => {
    let loopTimer: ReturnType<typeof setInterval> | null = null;
    let sleepTimer: ReturnType<typeof setInterval> | null = null;

    const handleIterationStart = (event: CustomEvent) => {
      if (event.detail.agentId !== agentId) return;
      if (loopTimer) clearInterval(loopTimer);
      setIsSleeping(false);
      startRef.current = event.detail.iterationStartTime;
      durationRef.current = event.detail.intervalMs;
      setDurationMs(event.detail.intervalMs);
      setProgress(0);

      loopTimer = setInterval(() => {
        const elapsed = Date.now() - startRef.current;
        setProgress(Math.min(100, (elapsed / durationRef.current) * 100));
      }, 100);
    };

    const handleSleepStart = (event: CustomEvent) => {
      if (event.detail.agentId !== agentId) return;
      if (sleepTimer) clearInterval(sleepTimer);
      const sleepDurationMs = event.detail.durationMs;
      const sleepEnd = Date.now() + sleepDurationMs;
      setIsSleeping(true);
      setDurationMs(sleepDurationMs);
      setProgress(100);

      sleepTimer = setInterval(() => {
        const remaining = sleepEnd - Date.now();
        if (remaining <= 0) {
          setIsSleeping(false);
          setProgress(0);
          if (sleepTimer) clearInterval(sleepTimer);
          return;
        }
        setProgress(Math.max(0, (remaining / sleepDurationMs) * 100));
      }, 100);
    };

    const handleSleepEnd = (event: CustomEvent) => {
      if (event.detail.agentId !== agentId) return;
      if (sleepTimer) clearInterval(sleepTimer);
      setIsSleeping(false);
      setProgress(0);
    };

    window.addEventListener('agentIterationStart', handleIterationStart as EventListener);
    window.addEventListener('agentSleepStart', handleSleepStart as EventListener);
    window.addEventListener('agentSleepEnd', handleSleepEnd as EventListener);
    return () => {
      if (loopTimer) clearInterval(loopTimer);
      if (sleepTimer) clearInterval(sleepTimer);
      window.removeEventListener('agentIterationStart', handleIterationStart as EventListener);
      window.removeEventListener('agentSleepStart', handleSleepStart as EventListener);
      window.removeEventListener('agentSleepEnd', handleSleepEnd as EventListener);
    };
  }, [agentId]);

  return { progress, durationMs, isSleeping };
}

// The still frame the model reasons about; this chip shows the raw feed instead, so the
// video only ever comes from the live MediaStream, muted/no controls — same element type
// SensorPreviewPanel's VideoStream uses, just shrunk to fit the ring.
const LiveAvatar: React.FC<{ stream: MediaStream | null }> = ({ stream }) => {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current) videoRef.current.srcObject = stream;
  }, [stream]);

  if (!stream) return <Bot className="w-4 h-4 text-gray-400" />;

  return (
    <video
      ref={videoRef}
      muted
      autoPlay
      playsInline
      className="w-full h-full object-cover"
    />
  );
};

const StripItem: React.FC<{
  agent: CompleteAgent;
  isRunning: boolean;
  isStarting: boolean;
  streams: StreamState;
  onToggle: (agentId: string, isCurrentlyRunning: boolean) => void;
  onSelectAgent?: (agentId: string) => void;
}> = ({ agent, isRunning, isStarting, streams, onToggle, onSelectAgent }) => {
  const { progress, durationMs, isSleeping } = useLoopRing(agent.id);

  const liveStream = agentHasScreenSensor(agent.system_prompt)
    ? streams.screenVideoStream
    : agentHasCameraSensor(agent.system_prompt)
      ? streams.cameraStream
      : null;

  return (
    <div
      onClick={onSelectAgent ? () => onSelectAgent(agent.id) : undefined}
      role={onSelectAgent ? 'button' : undefined}
      tabIndex={onSelectAgent ? 0 : undefined}
      title={onSelectAgent ? `Open "${agent.name}" in Micro Agents` : undefined}
      className={`flex-shrink-0 flex items-center gap-2 pl-1.5 pr-1 py-1 bg-white border border-gray-200 rounded-full shadow-sm ${onSelectAgent ? 'cursor-pointer hover:bg-gray-50 transition-colors' : ''}`}
    >
      <div className="relative w-10 h-10 flex-shrink-0">
        <div className="absolute inset-1 rounded-full overflow-hidden bg-gray-900 flex items-center justify-center">
          <LiveAvatar stream={liveStream} />
        </div>
        {isRunning && (
          <div className="absolute inset-0">
            <PieTimer
              progress={progress}
              color={isSleeping ? 'blue' : 'green'}
              totalDurationMs={durationMs || undefined}
              isFilling={!isSleeping}
              size={40}
            />
          </div>
        )}
      </div>
      <span className="text-xs font-medium text-gray-700 max-w-[8rem] truncate">{agent.name}</span>
      <button
        onClick={(e) => { e.stopPropagation(); onToggle(agent.id, isRunning); }}
        disabled={isStarting}
        className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-red-500 hover:bg-red-50 disabled:text-gray-400 transition-colors"
        title={isStarting ? 'Starting…' : 'Stop agent'}
      >
        {isStarting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Square className="w-3 h-3" fill="currentColor" />}
      </button>
    </div>
  );
};

const RunningAgentsStrip: React.FC<RunningAgentsStripProps> = ({ agents, runningAgents, startingAgents, onToggle, onSelectAgent }) => {
  const [streams, setStreams] = useState<StreamState>(StreamManager.getCurrentState());

  useEffect(() => {
    StreamManager.addListener(setStreams);
    return () => StreamManager.removeListener(setStreams);
  }, []);

  const active = agents.filter(a => runningAgents.has(a.id) || startingAgents.has(a.id));
  if (active.length === 0) return null;

  return (
    <div className="flex items-center gap-2 px-4 py-2 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
      {active.map(agent => (
        <StripItem
          key={agent.id}
          agent={agent}
          isRunning={runningAgents.has(agent.id)}
          isStarting={startingAgents.has(agent.id)}
          streams={streams}
          onToggle={onToggle}
          onSelectAgent={onSelectAgent}
        />
      ))}
    </div>
  );
};

export default RunningAgentsStrip;
