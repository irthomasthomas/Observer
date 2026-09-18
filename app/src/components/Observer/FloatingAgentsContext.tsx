// src/components/Observer/FloatingAgentsContext.tsx
//
// Shared "docked vs floating" state for agent cards spawned inline in the Observer chat
// (see MCP.tsx's 'agent-card' block) and rendered loose over the page (RunningAgentsStrip).
//
// A card starts docked — an ordinary chat message. Dragging its header past a small
// threshold pops it into the floating overlay; dragging a floating card back onto its own
// inline placeholder pill re-docks it (a per-agent dock target, not "anywhere over the chat
// pane" — that pane fills almost the whole screen in the unboxed Observer layout, so treating
// the whole thing as a drop zone meant nearly every release re-docked the card instead of
// letting it stay wherever it was dropped). Only *membership* (which ids are floating) and
// each card's *initial* pop-out position live here — that's state a handful of components
// need to agree on. Position during an active drag is local state inside whichever
// AgentLiveCard instance is currently being dragged (see dragSessionRef below), so a drag
// never re-renders the rest of the chat: only the one card that's actually moving repaints
// per pointermove.
//
// Handing a single continuous drag off between two different component instances (the
// inline card, then the floating card that replaces it the instant it pops out) is the
// tricky part — `dragSessionRef` is how: the window-level pointermove/up listeners that
// drive the gesture always call through this ref, and the floating card overwrites it with
// its own handlers as soon as it mounts, so the same drag just keeps going in a new pair of
// hands without missing a frame.

import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';

export interface FloatingPos { x: number; y: number }

export interface DragSession {
  /** Called on every pointermove once the gesture is past the drag threshold, with the
   *  card's would-be top-left (pointer position minus the original grab offset). */
  onMove: (cardX: number, cardY: number) => void;
  /** Called once on pointerup. `clientX`/`clientY` are the raw pointer position (for the
   *  drop-zone hit test); `cardX`/`cardY` mirror onMove's last values. */
  onEnd: (cardX: number, cardY: number, clientX: number, clientY: number) => void;
}

interface FloatingAgentsValue {
  floating: Record<string, FloatingPos>;
  isFloating: (agentId: string) => boolean;
  /** Pop an agent out of the chat flow into the floating overlay at this card position. */
  popOut: (agentId: string, cardX: number, cardY: number) => void;
  /** Remove an agent from the floating set — it reappears inline where its chat message is. */
  dock: (agentId: string) => void;
  /** Registers (or, with `el: null`, unregisters) the DOM node of an agent's inline
   *  placeholder pill as its dock target — call from the pill's `ref`. */
  setDockTarget: (agentId: string, el: HTMLElement | null) => void;
  /** True while `clientX`/`clientY` sit over this agent's own registered dock target
   *  (measured live, so scrolling the transcript while dragging still hit-tests correctly). */
  isOverDockTarget: (agentId: string, clientX: number, clientY: number) => boolean;
  /** The in-progress drag's current handlers — see file header. Null when nothing is being dragged. */
  dragSessionRef: React.MutableRefObject<DragSession | null>;
}

// MCP.tsx (the inline agent-card renderer) is shared by callers that don't spawn agents
// inline at all (GetStarted, MCPPanel) and so never wrap themselves in
// FloatingAgentsProvider. Rather than force every caller to provide one, the context
// defaults to an inert no-op implementation: nothing is ever "floating" and pop-out/dock
// are no-ops, so those callers behave exactly as before without needing to know this
// feature exists.
function createDefaultValue(): FloatingAgentsValue {
  return {
    floating: {},
    isFloating: () => false,
    popOut: () => {},
    dock: () => {},
    setDockTarget: () => {},
    isOverDockTarget: () => false,
    dragSessionRef: { current: null },
  };
}

const FloatingAgentsContext = createContext<FloatingAgentsValue>(createDefaultValue());

export const FloatingAgentsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [floating, setFloating] = useState<Record<string, FloatingPos>>({});
  const dockTargetsRef = useRef<Record<string, HTMLElement | null>>({});
  const dragSessionRef = useRef<DragSession | null>(null);

  const isFloating = useCallback((agentId: string) => Object.prototype.hasOwnProperty.call(floating, agentId), [floating]);

  const popOut = useCallback((agentId: string, cardX: number, cardY: number) => {
    setFloating(prev => ({ ...prev, [agentId]: { x: cardX, y: cardY } }));
  }, []);

  const dock = useCallback((agentId: string) => {
    setFloating(prev => {
      if (!(agentId in prev)) return prev;
      const next = { ...prev };
      delete next[agentId];
      return next;
    });
  }, []);

  const setDockTarget = useCallback((agentId: string, el: HTMLElement | null) => {
    dockTargetsRef.current[agentId] = el;
  }, []);

  const isOverDockTarget = useCallback((agentId: string, clientX: number, clientY: number) => {
    const el = dockTargetsRef.current[agentId];
    if (!el) return false;
    const rect = el.getBoundingClientRect();
    return clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom;
  }, []);

  const value = useMemo<FloatingAgentsValue>(() => ({
    floating, isFloating, popOut, dock, setDockTarget, isOverDockTarget, dragSessionRef,
  }), [floating, isFloating, popOut, dock, setDockTarget, isOverDockTarget]);

  return <FloatingAgentsContext.Provider value={value}>{children}</FloatingAgentsContext.Provider>;
};

export function useFloatingAgents(): FloatingAgentsValue {
  return useContext(FloatingAgentsContext);
}
