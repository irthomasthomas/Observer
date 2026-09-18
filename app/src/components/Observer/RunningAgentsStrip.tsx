// src/components/Observer/RunningAgentsStrip.tsx
//
// Floating overlay of currently running/starting agents for the Observer tab. Cards sit in
// an absolutely-positioned layer above the Hero/chat — they never push or resize that
// content — and can be freely dragged anywhere within the tab by their header (drag state
// is in-memory only, resets each session; no grid snapping). Each card shows: name + status
// header, the real SensorPreviewPanel (crop-capable live preview, same component the full
// AgentCard uses), and a one-line "status · time · last word" readout — the model's streamed
// response collapsed to its most recent word, so a glance catches "PERSON_DETECTED" or
// "CONTINUE" landing without reading the whole response.

import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Square, Loader2, ArrowUpRight } from 'lucide-react';
import type { CompleteAgent } from '@utils/agent_database';
import { StreamManager, StreamState } from '@utils/streamManager';
import { Logger, LogEntry } from '@utils/logging';
import PieTimer from '@components/AgentCard/PieTimer';
import SensorPreviewPanel from '@components/AgentCard/SensorPreviewPanel';

interface RunningAgentsStripProps {
  agents: CompleteAgent[];
  runningAgents: Set<string>;
  startingAgents: Set<string>;
  onToggle: (agentId: string, isCurrentlyRunning: boolean) => void;
  /** A card here is a preview, not the real card — clicking its header (anywhere but the
   *  stop button or the preview controls) jumps to the Micro Agents tab. */
  onSelectAgent?: (agentId: string) => void;
}

type AgentLiveStatus = 'STARTING' | 'CAPTURING' | 'THINKING' | 'RESPONDING' | 'WAITING' | 'SKIPPED' | 'SLEEPING' | 'IDLE';

const STATUS_LABEL: Record<AgentLiveStatus, string> = {
  STARTING: 'Starting…',
  CAPTURING: 'Capturing…',
  THINKING: 'Thinking…',
  RESPONDING: 'Responding…',
  WAITING: 'Waiting…',
  SKIPPED: 'Skipped (no change)',
  SLEEPING: 'Sleeping',
  IDLE: 'Idle',
};

function formatCountdown(ms: number) {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes > 0 ? `${minutes}:${seconds.toString().padStart(2, '0')}` : `${seconds}s`;
}

// Mirrors the status/loop/sleep/streaming state machine in AgentCard.tsx, trimmed down to
// just what this card needs. Event-driven, same as AgentCard — no polling.
function useAgentLiveState(agentId: string, isRunning: boolean, isStarting: boolean) {
  const [liveStatus, setLiveStatus] = useState<AgentLiveStatus>('IDLE');
  const [lastWord, setLastWord] = useState('');
  const [progress, setProgress] = useState(0);
  const [durationMs, setDurationMs] = useState(0);
  const [isSleeping, setIsSleeping] = useState(false);
  const [sleepRemainingMs, setSleepRemainingMs] = useState(0);

  const statusRef = React.useRef<AgentLiveStatus>('IDLE');
  statusRef.current = liveStatus;
  const startRef = React.useRef(0);
  const durationRef = React.useRef(0);

  // Base status derivation from running/starting flags + Logger entries.
  useEffect(() => {
    if (!isRunning && !isStarting) {
      setLiveStatus('IDLE');
      return;
    }
    if (isStarting && !isRunning) {
      setLiveStatus('STARTING');
      return;
    }
    setLiveStatus(prev => (prev === 'STARTING' || prev === 'IDLE' ? 'CAPTURING' : prev));

    const handleNewLog = (log: LogEntry) => {
      if (log.source !== agentId) return;
      if (log.details?.logType === 'model-prompt') {
        setLiveStatus('THINKING');
      } else if (log.details?.logType === 'iteration-skipped') {
        setLiveStatus('SKIPPED');
      } else if (log.details?.logType === 'model-response') {
        setLiveStatus('WAITING');
        const text = (log.details.content as string) || '';
        const words = text.trim().split(/\s+/).filter(Boolean);
        if (words.length) setLastWord(words[words.length - 1]);
      }
    };
    Logger.addListener(handleNewLog);
    return () => Logger.removeListener(handleNewLog);
  }, [agentId, isRunning, isStarting]);

  // Loop timer (WAITING/CAPTURING ring).
  useEffect(() => {
    let loopTimer: ReturnType<typeof setInterval> | null = null;

    const handleIterationStart = (event: CustomEvent) => {
      if (event.detail.agentId !== agentId) return;
      if (loopTimer) clearInterval(loopTimer);
      setIsSleeping(false);
      startRef.current = event.detail.iterationStartTime;
      durationRef.current = event.detail.intervalMs;
      setDurationMs(event.detail.intervalMs);
      setProgress(0);
      if (statusRef.current === 'SLEEPING' || statusRef.current === 'IDLE' || statusRef.current === 'STARTING') {
        setLiveStatus('CAPTURING');
      }

      loopTimer = setInterval(() => {
        const elapsed = Date.now() - startRef.current;
        setProgress(Math.min(100, (elapsed / durationRef.current) * 100));
      }, 100);
    };

    const handleStreamStart = (event: CustomEvent) => {
      if (event.detail.agentId !== agentId) return;
      setLiveStatus('RESPONDING');
    };

    window.addEventListener('agentIterationStart', handleIterationStart as EventListener);
    window.addEventListener('agentStreamStart', handleStreamStart as EventListener);
    return () => {
      if (loopTimer) clearInterval(loopTimer);
      window.removeEventListener('agentIterationStart', handleIterationStart as EventListener);
      window.removeEventListener('agentStreamStart', handleStreamStart as EventListener);
    };
  }, [agentId]);

  // Streamed response chunks -> last word ticker (updates live as tokens arrive, not just
  // once the full response lands). Intentionally never cleared on sleep/iteration-start —
  // it should keep showing the last decision the agent made until a new one replaces it.
  useEffect(() => {
    let buffer = '';
    const handleChunk = (event: CustomEvent) => {
      if (event.detail.agentId !== agentId) return;
      buffer += event.detail.chunk || '';
      const words = buffer.trim().split(/\s+/).filter(Boolean);
      if (words.length) setLastWord(words[words.length - 1]);
    };
    const resetBuffer = (event: CustomEvent) => {
      if (event.detail.agentId !== agentId) return;
      buffer = '';
    };
    window.addEventListener('agentResponseChunk', handleChunk as EventListener);
    window.addEventListener('agentStreamStart', resetBuffer as EventListener);
    return () => {
      window.removeEventListener('agentResponseChunk', handleChunk as EventListener);
      window.removeEventListener('agentStreamStart', resetBuffer as EventListener);
    };
  }, [agentId]);

  // Sleep countdown.
  useEffect(() => {
    let sleepTimer: ReturnType<typeof setInterval> | null = null;

    const handleSleepStart = (event: CustomEvent) => {
      if (event.detail.agentId !== agentId) return;
      if (sleepTimer) clearInterval(sleepTimer);
      const sleepDurationMs = event.detail.durationMs;
      const sleepEnd = Date.now() + sleepDurationMs;
      setIsSleeping(true);
      setLiveStatus('SLEEPING');
      setSleepRemainingMs(sleepDurationMs);

      sleepTimer = setInterval(() => {
        const remaining = sleepEnd - Date.now();
        if (remaining <= 0) {
          setIsSleeping(false);
          setLiveStatus('WAITING');
          if (sleepTimer) clearInterval(sleepTimer);
          return;
        }
        setSleepRemainingMs(remaining);
      }, 250);
    };

    const handleSleepEnd = (event: CustomEvent) => {
      if (event.detail.agentId !== agentId) return;
      if (sleepTimer) clearInterval(sleepTimer);
      setIsSleeping(false);
      setLiveStatus('WAITING');
    };

    window.addEventListener('agentSleepStart', handleSleepStart as EventListener);
    window.addEventListener('agentSleepEnd', handleSleepEnd as EventListener);
    return () => {
      if (sleepTimer) clearInterval(sleepTimer);
      window.removeEventListener('agentSleepStart', handleSleepStart as EventListener);
      window.removeEventListener('agentSleepEnd', handleSleepEnd as EventListener);
    };
  }, [agentId]);

  return { liveStatus, lastWord, progress, durationMs, isSleeping, sleepRemainingMs };
}

// Drag-anywhere positioning for a single card. Pointer-based (not react-grid-layout — the
// grid's column-snapping fights a free-floating overlay), in-memory only so it resets on
// remount/tab switch. A short movement threshold tells a drag apart from a click so the
// header can still double as "open in Micro Agents".
function useFreeDrag(basePos: { x: number; y: number }) {
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number; dragging: boolean } | null>(null);

  const onPointerDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('button')) return;
    dragRef.current = { startX: e.clientX, startY: e.clientY, origX: offset.x, origY: offset.y, dragging: false };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) drag.dragging = true;
    if (drag.dragging) setOffset({ x: drag.origX + dx, y: drag.origY + dy });
  };
  const endDrag = () => {
    const wasDragging = dragRef.current?.dragging ?? false;
    dragRef.current = null;
    return wasDragging;
  };

  return {
    style: { left: basePos.x, top: basePos.y, transform: `translate(${offset.x}px, ${offset.y}px)` } as React.CSSProperties,
    isDragging: !!dragRef.current?.dragging,
    onPointerDown,
    onPointerMove,
    endDrag,
  };
}

const StripItem: React.FC<{
  agent: CompleteAgent;
  isRunning: boolean;
  isStarting: boolean;
  streams: StreamState;
  basePos: { x: number; y: number };
  onToggle: (agentId: string, isCurrentlyRunning: boolean) => void;
  onSelectAgent?: (agentId: string) => void;
}> = ({ agent, isRunning, isStarting, streams, basePos, onToggle, onSelectAgent }) => {
  const { liveStatus, lastWord, progress, durationMs, isSleeping, sleepRemainingMs } = useAgentLiveState(agent.id, isRunning, isStarting);
  const drag = useFreeDrag(basePos);

  const timeLabel = isSleeping
    ? formatCountdown(sleepRemainingMs)
    : isRunning && durationMs
      ? formatCountdown(durationMs * (1 - progress / 100))
      : null;

  const handlePointerUp = () => {
    const wasDragging = drag.endDrag();
    if (!wasDragging && onSelectAgent) onSelectAgent(agent.id);
  };

  return (
    <div
      className="absolute pointer-events-auto w-full max-w-[350px] bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden"
      style={drag.style}
    >
      <div
        onPointerDown={drag.onPointerDown}
        onPointerMove={drag.onPointerMove}
        onPointerUp={handlePointerUp}
        title={onSelectAgent ? `Drag to move · click to open "${agent.name}" in Micro Agents` : 'Drag to move'}
        className="flex items-center gap-3 px-4 py-3 border-b border-gray-100 cursor-grab active:cursor-grabbing select-none"
      >

        <div className="relative w-9 h-9 flex-shrink-0 flex items-center justify-center">
          {isRunning && !isSleeping ? (
            <PieTimer progress={progress} color="green" totalDurationMs={durationMs || undefined} isFilling size={36} />
          ) : (
            <div className="w-2.5 h-2.5 rounded-full bg-blue-400" />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="text-base font-semibold text-gray-800 truncate">{agent.name}</span>
            {onSelectAgent && <ArrowUpRight className="w-3.5 h-3.5 text-gray-300 flex-shrink-0" />}
          </div>
          {/* status | time | last word — one glance line, e.g. "Sleeping · 12s · PERSON_DETECTED" */}
          <div className="flex items-center gap-1.5 text-xs text-gray-400 min-w-0">
            <span className="flex-shrink-0">{isSleeping ? 'Sleeping' : STATUS_LABEL[liveStatus]}</span>
            {timeLabel && <><span className="flex-shrink-0">·</span><span className="flex-shrink-0">{timeLabel}</span></>}
            <span className="flex-shrink-0">·</span>
            <span key={lastWord} className="font-mono font-semibold text-gray-600 truncate animate-fade-in">{lastWord || '—'}</span>
          </div>
        </div>

        <button
          onClick={(e) => { e.stopPropagation(); onToggle(agent.id, isRunning); }}
          disabled={isStarting}
          className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-red-500 hover:bg-red-50 disabled:text-gray-400 transition-colors"
          title={isStarting ? 'Starting…' : 'Stop agent'}
        >
          {isStarting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Square className="w-3.5 h-3.5" fill="currentColor" />}
        </button>
      </div>

      <div className="px-4 pt-3">
        <SensorPreviewPanel agentId={agent.id} streams={streams} systemPrompt={agent.system_prompt} />
      </div>
    </div>
  );
};

const CARD_WIDTH = 350;

const RunningAgentsStrip: React.FC<RunningAgentsStripProps> = ({ agents, runningAgents, startingAgents, onToggle, onSelectAgent }) => {
  const [streams, setStreams] = useState<StreamState>(StreamManager.getCurrentState());
  const [viewportWidth, setViewportWidth] = useState(() => window.innerWidth);

  useEffect(() => {
    StreamManager.addListener(setStreams);
    return () => StreamManager.removeListener(setStreams);
  }, []);

  // Cascade anchors from the top-right corner, so newly-spawned agents appear there — track
  // viewport width so that anchor stays correct across resizes.
  useEffect(() => {
    const handleResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const active = agents.filter(a => runningAgents.has(a.id) || startingAgents.has(a.id));
  if (active.length === 0) return null;

  // Portaled to document.body and viewport-fixed (not `absolute` inside the tab's own
  // container) so the overlay covers the whole app window — including above the top
  // ProgressBar and outside whatever size <main>/the chat panel happens to be — rather
  // than being clipped to wherever this component sits in the tree.
  return createPortal(
    <div className="fixed inset-0 pointer-events-none z-[9999] overflow-visible">
      {active.map((agent, i) => (
        <StripItem
          key={agent.id}
          agent={agent}
          isRunning={runningAgents.has(agent.id)}
          isStarting={startingAgents.has(agent.id)}
          streams={streams}
          basePos={{ x: Math.max(16, viewportWidth - CARD_WIDTH - 16 - i * 24), y: 16 + i * 24 }}
          onToggle={onToggle}
          onSelectAgent={onSelectAgent}
        />
      ))}
    </div>,
    document.body
  );
};

export default RunningAgentsStrip;
