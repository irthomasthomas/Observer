// src/utils/tutorialFlow.ts
//
// State machine for the first-run demo, kept OUTSIDE React so every producer and consumer can
// reach it: ObserverHero unmounts on first send, the progress-bar canvas is a plain util, and
// the notification arrives from the agent loop. Purely an observer: it never sits in a tool's
// call path, it only listens (stream `onFinished`, Logger `tool-success`).
//
//   idle -> building (user sent) -> monitoring (agent running) -> finished (bar hit 100%)
//        -> notified (agent's notification tool succeeded, from monitoring or finished)
//        -> idle (CTA dismissed)

import { useSyncExternalStore } from 'react';
import { Logger, type LogEntry } from './logging';
import { tutorialStreamCapture } from './tutorialStreamCapture';

export type TutorialPhase = 'idle' | 'building' | 'monitoring' | 'finished' | 'notified';

interface TutorialSnapshot {
  phase: TutorialPhase;
  agentId: string | null;
}

// Tools that count as "the agent told the user", whatever phase the demo is in: if the model
// says the download finished and fires one of these, that's the moment the demo is about.
const NOTIFY_TOOLS = new Set([
  'sendEmail', 'sendWhatsapp', 'sendSms', 'call', 'sendTelegram', 'sendDiscord',
  'sendPushover', 'sendGotify', 'system_notify', 'notify', 'message', 'overlay',
]);
// The "log it" wheel option writes to memory, but agents also write memory routinely on every
// loop, so these only count once the bar has finished.
const MEMORY_TOOLS = new Set(['setMemory', 'appendMemory']);

// If no notification is seen this long after the bar finishes (a couple of agent loops),
// show the CTA anyway so the user is never stuck.
const NOTIFY_FALLBACK_MS = 45000;

let snapshot: TutorialSnapshot = { phase: 'idle', agentId: null };
const listeners = new Set<() => void>();
let fallbackTimer: ReturnType<typeof setTimeout> | null = null;
let wired = false;

const set = (next: Partial<TutorialSnapshot>) => {
  snapshot = { ...snapshot, ...next };
  listeners.forEach(l => l());
};

const clearFallback = () => { if (fallbackTimer) { clearTimeout(fallbackTimer); fallbackTimer = null; } };

// Listeners run after the tool has already finished; errors here must never reach it.
const onLog = (entry: LogEntry) => {
  try {
    const { phase, agentId } = snapshot;
    if ((phase !== 'monitoring' && phase !== 'finished') || entry.source !== agentId) return;
    const d = entry.details;
    if (d?.logType !== 'tool-success') return;
    const tool = d?.content?.tool;
    if (NOTIFY_TOOLS.has(tool) || (phase === 'finished' && MEMORY_TOOLS.has(tool))) {
      clearFallback();
      set({ phase: 'notified' });
    }
  } catch { /* observer only */ }
};

const enterFinished = () => {
  set({ phase: 'finished' });
  clearFallback();
  fallbackTimer = setTimeout(() => { if (snapshot.phase === 'finished') set({ phase: 'notified' }); }, NOTIFY_FALLBACK_MS);
};

const wire = () => {
  if (wired) return;
  wired = true;
  Logger.addListener(onLog);
  tutorialStreamCapture.onFinished(() => {
    if (snapshot.phase === 'monitoring') enterFinished();
  });
};

export const tutorialFlow = {
  /** The user sent the demo prompt. */
  start() { wire(); clearFallback(); tutorialStreamCapture.resetClock(); set({ phase: 'building', agentId: null }); },
  /** The demo agent is running. */
  attachAgent(agentId: string) {
    if (snapshot.phase !== 'building') return;
    set({ phase: 'monitoring', agentId });
    // The bar only starts filling now, so time spent in capture/whitelisting can't run it out.
    tutorialStreamCapture.startClock();
  },
  /** Stopped/dismissed. */
  reset() { clearFallback(); tutorialStreamCapture.resetClock(); set({ phase: 'idle', agentId: null }); },
  get: () => snapshot,
  subscribe(l: () => void) { listeners.add(l); return () => { listeners.delete(l); }; },
};

export const useTutorialFlow = (): TutorialSnapshot =>
  useSyncExternalStore(tutorialFlow.subscribe, tutorialFlow.get);
