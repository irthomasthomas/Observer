// src/components/Observer/AgentLiveCard.tsx
//
// The live agent card, usable in two places with the same component:
//   - 'inline'   — a normal chat message in MCP.tsx's transcript (static in flow).
//   - 'floating' — loose over the page in RunningAgentsStrip.tsx (fixed position).
// Dragging the header past a small threshold pops an inline card out into the floating
// overlay; dragging a floating card back over the chat transcript docks it. See
// FloatingAgentsContext.tsx for how a single drag gesture hands off between the two
// instances involved in a pop-out.

import React, { useEffect, useRef, useState } from 'react';
import { Square, Play, Loader2, ArrowUpRight } from 'lucide-react';
import type { CompleteAgent } from '@utils/agent_database';
import { StreamState } from '@utils/streamManager';
import PieTimer from '@components/AgentCard/PieTimer';
import SensorPreviewPanel from '@components/AgentCard/SensorPreviewPanel';
import { useFloatingAgents } from './FloatingAgentsContext';
import { useAgentLiveStateFor, type AgentLiveStatus } from './AgentLiveStateContext';

export const CARD_WIDTH = 350;

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

interface AgentLiveCardProps {
  agent: CompleteAgent;
  isRunning: boolean;
  isStarting: boolean;
  streams: StreamState;
  onToggle: (agentId: string, isCurrentlyRunning: boolean) => void;
  onSelectAgent?: (agentId: string) => void;
  mode: 'inline' | 'floating';
  /** 'floating' only — this card's current position, owned by RunningAgentsStrip (it reads
   *  the initial spot from context on mount, then this component drives it during drags). */
  floatingPos?: { x: number; y: number };
}

const AgentLiveCard: React.FC<AgentLiveCardProps> = ({ agent, isRunning, isStarting, streams, onToggle, onSelectAgent, mode, floatingPos }) => {
  const { liveStatus, lastWord, progress, durationMs, isSleeping, sleepRemainingMs } = useAgentLiveStateFor(agent.id);
  const { popOut, dock, isOverDockTarget, dragSessionRef } = useFloatingAgents();

  const [pos, setPos] = useState(floatingPos || { x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const headerRef = useRef<HTMLDivElement>(null);
  // Only the very first pop-in should fade from transparent — re-applying that animation on
  // every drag-end (whenever `isDragging` flips back to false) briefly reset opacity to 0,
  // which read as the card blinking/disappearing on every drop.
  const hasAnimatedIn = useRef(false);

  // Claim the in-progress drag session the instant this instance mounts as the floating
  // side of a pop-out — see FloatingAgentsContext.tsx's file header for why this hand-off
  // is necessary (the gesture started on a different, now-unmounted, inline instance).
  useEffect(() => {
    if (mode !== 'floating') return;
    setIsDragging(true);
    dragSessionRef.current = {
      onMove: (x, y) => setPos({ x, y }),
      onEnd: (x, y, clientX, clientY) => {
        setIsDragging(false);
        setPos({ x, y });
        if (isOverDockTarget(agent.id, clientX, clientY)) dock(agent.id);
      },
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  const timeLabel = isSleeping
    ? formatCountdown(sleepRemainingMs)
    : isRunning && durationMs
      ? formatCountdown(durationMs * (1 - progress / 100))
      : null;

  const handleHeaderPointerDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('button')) return;
    const rect = headerRef.current!.getBoundingClientRect();
    const grabDX = e.clientX - rect.left;
    const grabDY = e.clientY - rect.top;
    const startX = e.clientX;
    const startY = e.clientY;
    let dragging = false;

    const handleMove = (ev: PointerEvent) => {
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      if (!dragging && (Math.abs(dx) > 4 || Math.abs(dy) > 4)) {
        dragging = true;
        setIsDragging(true);
        if (mode === 'inline') {
          // First crossing: pop this agent out. A new floating AgentLiveCard mounts and
          // takes over dragSessionRef via its own mount effect, but that's a React commit
          // away — not necessarily done before the *next* native pointermove, which fires as
          // fast as the OS delivers them. Install an interim session that routes straight
          // through context (popOut is a plain upsert) so no movement is ever silently
          // dropped in that gap; once the floating instance's effect runs, it overwrites this
          // with its own cheap local-state version and steady-state dragging never touches
          // context again.
          popOut(agent.id, ev.clientX - grabDX, ev.clientY - grabDY);
          dragSessionRef.current = {
            onMove: (mx, my) => popOut(agent.id, mx, my),
            onEnd: (ex, ey, clientX2, clientY2) => {
              popOut(agent.id, ex, ey);
              if (isOverDockTarget(agent.id, clientX2, clientY2)) dock(agent.id);
            },
          };
          return;
        }
      }
      if (!dragging) return;
      dragSessionRef.current?.onMove(ev.clientX - grabDX, ev.clientY - grabDY);
    };
    const handleUp = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
      if (!dragging) {
        onSelectAgent?.(agent.id);
        return;
      }
      dragSessionRef.current?.onEnd(ev.clientX - grabDX, ev.clientY - grabDY, ev.clientX, ev.clientY);
    };

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
  };

  const containerStyle: React.CSSProperties = mode === 'floating'
    ? { position: 'fixed', left: pos.x, top: pos.y }
    : {};

  const playPopInAnimation = mode === 'floating' && !isDragging && !hasAnimatedIn.current;
  if (playPopInAnimation) hasAnimatedIn.current = true;

  return (
    <div
      className={`${mode === 'floating' ? 'pointer-events-auto' : 'w-full'} max-w-[350px] bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden ${playPopInAnimation ? 'animate-fade-in' : ''}`}
      style={containerStyle}
    >
      <div
        ref={headerRef}
        onPointerDown={handleHeaderPointerDown}
        title={onSelectAgent ? `Drag to move · click to open "${agent.name}" in Micro Agents` : 'Drag to move'}
        className={`flex items-center gap-3 px-4 py-3 border-b border-gray-100 select-none ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
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
          className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 transition-colors disabled:text-gray-400 ${isRunning ? 'text-red-500 hover:bg-red-50' : 'text-green-600 hover:bg-green-50'}`}
          title={isStarting ? 'Starting…' : isRunning ? 'Stop agent' : 'Start agent'}
        >
          {isStarting
            ? <Loader2 className="w-4 h-4 animate-spin" />
            : isRunning
              ? <Square className="w-3.5 h-3.5" fill="currentColor" />
              : <Play className="w-3.5 h-3.5" fill="currentColor" />}
        </button>
      </div>

      <div className="px-4 pt-3">
        <SensorPreviewPanel agentId={agent.id} streams={streams} systemPrompt={agent.system_prompt} />
      </div>
    </div>
  );
};

export default AgentLiveCard;
