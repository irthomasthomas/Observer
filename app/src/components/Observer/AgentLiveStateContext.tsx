// src/components/Observer/AgentLiveStateContext.tsx
//
// Keeps each agent's live status/progress/last-word state alive independently of whether its
// card is currently rendered inline (in the chat transcript) or floating (in the overlay) —
// those are two different component instances in two different subtrees, so computing this
// state locally inside AgentLiveCard (as a first pass did) meant popping a card out — or
// docking it back — silently reset its progress ring and last-word ticker to blank, because
// the new instance started from scratch. One hidden "keeper" per relevant agent id runs the
// actual event-driven tracking (mirrors AgentCard's state machine) and reports into a shared
// map that both AgentLiveCard render modes read from, so the underlying state survives the
// swap.

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Logger, LogEntry } from '@utils/logging';

export type AgentLiveStatus = 'STARTING' | 'CAPTURING' | 'THINKING' | 'RESPONDING' | 'WAITING' | 'SKIPPED' | 'SLEEPING' | 'IDLE';

export interface AgentLiveState {
  liveStatus: AgentLiveStatus;
  lastWord: string;
  progress: number;
  durationMs: number;
  isSleeping: boolean;
  sleepRemainingMs: number;
}

const DEFAULT_STATE: AgentLiveState = {
  liveStatus: 'IDLE', lastWord: '', progress: 0, durationMs: 0, isSleeping: false, sleepRemainingMs: 0,
};

const AgentLiveStateContext = createContext<Record<string, AgentLiveState>>({});

export function useAgentLiveStateFor(agentId: string): AgentLiveState {
  const map = useContext(AgentLiveStateContext);
  return map[agentId] ?? DEFAULT_STATE;
}

// Mirrors the status/loop/sleep/streaming state machine in AgentCard.tsx. Event-driven — no
// polling. This is the only place that actually computes the state; everything else reads it
// back out of the map above.
function useAgentLiveState(agentId: string, isRunning: boolean, isStarting: boolean): AgentLiveState {
  const [liveStatus, setLiveStatus] = useState<AgentLiveStatus>('IDLE');
  const [lastWord, setLastWord] = useState('');
  const [progress, setProgress] = useState(0);
  const [durationMs, setDurationMs] = useState(0);
  const [isSleeping, setIsSleeping] = useState(false);
  const [sleepRemainingMs, setSleepRemainingMs] = useState(0);

  const statusRef = useRef<AgentLiveStatus>('IDLE');
  statusRef.current = liveStatus;
  const startRef = useRef(0);
  const durationRef = useRef(0);

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

  // Streamed response chunks -> last word ticker. Never cleared on sleep — it should keep
  // showing the last decision the agent made until a new one replaces it.
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

const Keeper: React.FC<{
  agentId: string;
  isRunning: boolean;
  isStarting: boolean;
  onUpdate: (id: string, state: AgentLiveState) => void;
}> = ({ agentId, isRunning, isStarting, onUpdate }) => {
  const state = useAgentLiveState(agentId, isRunning, isStarting);
  useEffect(() => {
    onUpdate(agentId, state);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentId, state.liveStatus, state.lastWord, state.progress, state.durationMs, state.isSleeping, state.sleepRemainingMs]);
  return null;
};

export const AgentLiveStateProvider: React.FC<{
  agentIds: string[];
  runningAgents: Set<string>;
  startingAgents: Set<string>;
  children: React.ReactNode;
}> = ({ agentIds, runningAgents, startingAgents, children }) => {
  const [map, setMap] = useState<Record<string, AgentLiveState>>({});

  const handleUpdate = useCallback((id: string, state: AgentLiveState) => {
    setMap(prev => ({ ...prev, [id]: state }));
  }, []);

  return (
    <AgentLiveStateContext.Provider value={map}>
      {agentIds.map(id => (
        <Keeper key={id} agentId={id} isRunning={runningAgents.has(id)} isStarting={startingAgents.has(id)} onUpdate={handleUpdate} />
      ))}
      {children}
    </AgentLiveStateContext.Provider>
  );
};
