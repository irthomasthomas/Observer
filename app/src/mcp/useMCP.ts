// src/mcp/useMCP.ts
//
// React glue between the pure runner and the MCP UI. Holds the wire, the per-tool-call
// status map, and the deferred-promise registry that turns a human approval into a
// resolved promise the runner awaits.

import { useCallback, useRef, useState } from 'react';
import type { TokenProvider } from '@utils/main_loop';
import { ModelManager } from '@utils/ModelManager';
import type { WireMessage, ToolCallStatus } from './types';
import { getTool, getToolSpecs } from './registry';
import getMcpSystemPrompt from './systemPrompt';
import {
  runConversation,
  sealDanglingToolCalls,
  type InteractionRequest,
  type InteractionDecision,
} from './runner';

export interface ToolStatusEntry {
  status: ToolCallStatus;
  name: string;
  args: any;
}

export interface UseMCPOptions {
  getToken: TokenProvider;
  isUsingObServer: boolean;
  /** Cloud model that drives function calling. */
  modelName?: string;
  /** When true, confirmable tools run without a human gate. */
  skipPermissions?: boolean;
}

/** Listener fired after any agent-mutating tool completes. Receives the tool name. */
export type MutationListener = (toolName: string) => void;

const DEFAULT_MODEL = 'gemini-2.5-flash-lite-free';

/** Tools that change the dashboard's agent list / running state. */
const MUTATING_TOOLS = new Set(['create_agent', 'edit_agent', 'start_agent', 'stop_agent']);

const abortError = () => new DOMException('Stopped by user.', 'AbortError');
const isAbortError = (e: unknown): boolean =>
  e instanceof DOMException ? e.name === 'AbortError' : (e as any)?.name === 'AbortError';

export function useMCP(options: UseMCPOptions) {
  const { getToken, isUsingObServer, modelName = DEFAULT_MODEL, skipPermissions } = options;

  // The wire always begins with the (hidden) system message.
  const wireRef = useRef<WireMessage[]>([
    { role: 'system', content: getMcpSystemPrompt() },
  ]);

  // Consumers subscribe to agent-mutation events (create/edit/start/stop) so each screen
  // can react in its own way (refresh the dashboard, close the modal, start a tutorial, …)
  // without the shared hook baking in one caller's callback.
  const mutationListeners = useRef<Set<MutationListener>>(new Set());
  const subscribeMutation = useCallback((listener: MutationListener) => {
    mutationListeners.current.add(listener);
    return () => { mutationListeners.current.delete(listener); };
  }, []);

  const [messages, setMessages] = useState<WireMessage[]>([]);
  const [streamingText, setStreamingText] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const [toolStatus, setToolStatus] = useState<Map<string, ToolStatusEntry>>(new Map());
  const [pendingApproval, setPendingApproval] = useState<InteractionRequest | null>(null);

  // batchId → settlers for the deferred approval promise. We keep `reject` too so a hard
  // stop can unwind a run that's parked at the human-approval gate.
  const pendingResolvers = useRef<Map<string, {
    resolve: (d: InteractionDecision) => void;
    reject: (e: unknown) => void;
  }>>(new Map());

  // Aborts the in-flight run. One controller per send(); stop() fires it.
  const abortRef = useRef<AbortController | null>(null);

  const syncMessages = useCallback(() => {
    // Expose everything except the system message; the component decides what to render.
    setMessages(wireRef.current.filter(m => m.role !== 'system'));
  }, []);

  const setStatus = useCallback((id: string, status: ToolCallStatus, meta?: { name: string; args: any }) => {
    setToolStatus(prev => {
      const next = new Map(prev);
      const existing = next.get(id);
      next.set(id, {
        status,
        name: meta?.name ?? existing?.name ?? '',
        args: meta?.args ?? existing?.args ?? {},
      });
      return next;
    });
  }, []);

  const requestInteraction = useCallback((req: InteractionRequest): Promise<InteractionDecision> => {
    return new Promise<InteractionDecision>((resolve, reject) => {
      pendingResolvers.current.set(req.batchId, { resolve, reject });
      setPendingApproval(req);
    });
  }, []);

  /** Resolve a pending approval batch from the UI. */
  const resolveInteraction = useCallback((batchId: string, decision: InteractionDecision) => {
    const settler = pendingResolvers.current.get(batchId);
    if (settler) {
      pendingResolvers.current.delete(batchId);
      settler.resolve(decision);
    }
    setPendingApproval(prev => (prev && prev.batchId === batchId ? null : prev));
  }, []);

  const send = useCallback(async (userText: string, images?: string[]) => {
    if (isRunning) return;

    // Build the user message (multimodal if images were attached).
    let userContent: any = userText;
    if (images && images.length > 0) {
      userContent = [
        { type: 'text', text: userText },
        ...images.map(img => ({
          type: 'image_url',
          image_url: { url: img.startsWith('data:') ? img : `data:image/png;base64,${img}` },
        })),
      ];
    }
    wireRef.current.push({ role: 'user', content: userContent });
    syncMessages();

    const controller = new AbortController();
    abortRef.current = controller;
    const { signal } = controller;
    setIsRunning(true);

    const sendToModel = async (
      wire: WireMessage[],
      onTextDelta?: (chunk: string) => void,
    ) => {
      setStreamingText('');
      try {
        if (signal.aborted) throw abortError();
        const token = isUsingObServer ? await getToken() : undefined;
        const modelCall = ModelManager.getInstance().sendToolMessages(
          modelName,
          wire,
          getToolSpecs(),
          token,
          true,
          onTextDelta,
        );
        // Race the streamed call against the abort signal so a hard stop unwinds the loop
        // immediately instead of waiting for the model to finish. The orphaned modelCall
        // settles in the background; its result is discarded (deltas are gated below).
        return await new Promise<Awaited<typeof modelCall>>((resolve, reject) => {
          const onAbort = () => reject(abortError());
          signal.addEventListener('abort', onAbort, { once: true });
          modelCall.then(resolve, reject).finally(() => signal.removeEventListener('abort', onAbort));
        });
      } finally {
        setStreamingText('');
      }
    };

    try {
      await runConversation(wireRef.current, {
        send: sendToModel,
        getTool,
        context: { getToken, signal },
        skipPermissions,
        signal,
        onWireUpdate: syncMessages,
        // Drop stream chunks from an orphaned (aborted) model call so a killed run can't
        // keep repopulating the live bubble.
        onAssistantDelta: chunk => { if (!signal.aborted) setStreamingText(prev => prev + chunk); },
        onStatus: (id, status, meta) => {
          setStatus(id, status, meta);
          if (status === 'done' && meta && MUTATING_TOOLS.has(meta.name)) {
            mutationListeners.current.forEach(l => l(meta.name));
          }
        },
        requestInteraction,
      });
    } catch (err) {
      if (isAbortError(err)) {
        // Hard stop: leave the conversation valid (no dangling tool_calls) and silent —
        // the user asked to stop, so no error bubble.
        sealDanglingToolCalls(wireRef.current);
        syncMessages();
      } else {
        const text = err instanceof Error ? err.message : 'An unknown error occurred.';
        wireRef.current.push({ role: 'assistant', content: `Sorry, I ran into an error: ${text}` });
        syncMessages();
      }
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      setIsRunning(false);
      setStreamingText('');
    }
  }, [isRunning, isUsingObServer, getToken, modelName, skipPermissions, syncMessages, setStatus, requestInteraction]);

  /** Hard-stop the in-flight run: kill the loop, abandon any model call, and unwind a
   *  run parked at the approval gate. Leaves the (sealed) conversation intact. */
  const stop = useCallback(() => {
    abortRef.current?.abort();
    // Reject any parked approval gate so the runner's await unwinds promptly.
    for (const [, settler] of pendingResolvers.current) settler.reject(abortError());
    pendingResolvers.current.clear();
    setPendingApproval(prev => {
      // Any tool calls still awaiting that gate are being abandoned — clear their spinners.
      if (prev) setToolStatus(s => {
        const next = new Map(s);
        for (const c of prev.calls) {
          const existing = next.get(c.id);
          if (existing && existing.status === 'pending') next.set(c.id, { ...existing, status: 'denied' });
        }
        return next;
      });
      return null;
    });
  }, []);

  /** Reset the conversation back to a fresh system message. No-op while a run is in flight. */
  const clear = useCallback(() => {
    if (isRunning) return;
    pendingResolvers.current.clear();
    wireRef.current = [{ role: 'system', content: getMcpSystemPrompt() }];
    setMessages([]);
    setToolStatus(new Map());
    setStreamingText('');
    setPendingApproval(null);
  }, [isRunning]);

  return {
    messages,
    streamingText,
    isRunning,
    toolStatus,
    pendingApproval,
    resolveInteraction,
    subscribeMutation,
    clear,
    stop,
    send,
  };
}

export type UseMCPReturn = ReturnType<typeof useMCP>;
