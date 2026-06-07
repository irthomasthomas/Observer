// src/mcp/runner.ts
//
// The agentic loop. FRAMEWORK-AGNOSTIC and pure (no React, no DOM): everything
// browser-bound is injected via deps. This is the portability line — the same loop runs
// in a future MCP server with only `send` and the registry's executors swapped.
//
//   send → tool_calls → run (auto) or await human gate (confirm) → append results → repeat
// until the model returns a turn with no tool calls, or MAX_ITERATIONS is hit.

import type {
  WireMessage,
  AssistantResponse,
  ToolDefinition,
  ToolContext,
  ToolCallStatus,
  ToolResult,
} from './types';
import { validateArgs } from './validate';

export const MAX_ITERATIONS = 10;

/** A validated, ready-to-run tool call. */
export interface PreparedCall {
  id: string;
  name: string;
  args: any;
  tool: ToolDefinition;
}

/** A batch of confirmable calls handed to the UI for a single approve/deny decision. */
export interface InteractionRequest {
  batchId: string;
  calls: Array<{ id: string; name: string; args: any }>;
}

export interface InteractionDecision {
  approved: boolean;
}

export interface RunnerDeps {
  /** Streamed model call. Resolves with the full assistant response for one turn. */
  send: (wire: WireMessage[], onTextDelta?: (chunk: string) => void) => Promise<AssistantResponse>;
  /** Registry lookup (injectable for testing). */
  getTool: (name: string) => ToolDefinition | undefined;
  /** Ambient context passed to executors (e.g. getToken). */
  context: ToolContext;
  /** Read live at each gate. When it returns true, confirmable tools run without a human
   *  gate ("yolo mode"). A getter (not a boolean) so a runtime toggle takes effect on the
   *  next batch without rebuilding the loop — same injection idiom as ToolContext.getToken. */
  skipPermissions?: () => boolean;
  /** Aborts the loop. Checked at each safe boundary; an in-flight `send`/gate should also
   *  reject when this fires so the loop unwinds promptly. */
  signal?: AbortSignal;
  /** Called whenever the wire changes (new assistant/tool message appended). */
  onWireUpdate?: (wire: WireMessage[]) => void;
  /** Streamed assistant prose for the live bubble. */
  onAssistantDelta?: (chunk: string) => void;
  /** Per-tool-call status transitions. */
  onStatus?: (toolCallId: string, status: ToolCallStatus, meta?: { name: string; args: any }) => void;
  /** Human gate: resolves from the UI (the deferred-promise pattern). */
  requestInteraction: (req: InteractionRequest) => Promise<InteractionDecision>;
}

let batchCounter = 0;
function nextBatchId(): string {
  batchCounter += 1;
  return `batch_${Date.now()}_${batchCounter}`;
}

/** Serialize a ToolResult into the string content of a `role: 'tool'` message. */
function toolResultContent(result: ToolResult): string {
  if (result.error) return JSON.stringify({ error: result.error });
  return JSON.stringify(result.data ?? {});
}

/**
 * Guarantee wire validity after an abort: the OpenAI API rejects a request where an
 * assistant `tool_calls` message isn't immediately followed by a `role: 'tool'` result
 * for every call. If a run is killed mid-turn, the most recent assistant turn can have
 * tool calls with no results — fill those with a synthetic "stopped" result so the
 * conversation can still be continued or cleared without a 400.
 */
export function sealDanglingToolCalls(wire: WireMessage[]): WireMessage[] {
  // Only the most recent assistant turn can be unanswered (the loop's invariant is that
  // every prior turn's calls already have results), so stop at the first assistant we hit.
  for (let i = wire.length - 1; i >= 0; i--) {
    if (wire[i].role !== 'assistant') continue;
    const calls = wire[i].tool_calls;
    if (calls && calls.length > 0) {
      const answered = new Set<string>();
      for (let j = i + 1; j < wire.length; j++) {
        const id = wire[j].tool_call_id;
        if (wire[j].role === 'tool' && id) answered.add(id);
      }
      for (const tc of calls) {
        if (!answered.has(tc.id)) {
          wire.push({ role: 'tool', tool_call_id: tc.id, name: tc.function.name, content: JSON.stringify({ error: 'Stopped by user.' }) });
        }
      }
    }
    return wire;
  }
  return wire;
}

/**
 * Run the agentic loop in place, mutating and returning `wire`.
 */
export async function runConversation(wire: WireMessage[], deps: RunnerDeps): Promise<WireMessage[]> {
  const pushTool = (id: string, result: ToolResult, name?: string) => {
    wire.push({ role: 'tool', tool_call_id: id, name, content: toolResultContent(result) });
    deps.onWireUpdate?.(wire);
  };

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    // Boundary 1: between turns the wire always ends in a user/tool/system message, so
    // it's already valid — just stop.
    if (deps.signal?.aborted) return wire;

    const assistant = await deps.send(wire, deps.onAssistantDelta);

    const toolCalls = assistant.tool_calls ?? [];
    const hasToolCalls = toolCalls.length > 0;
    // Gemini rejects empty-string content on assistant messages — use null when empty.
    // When there are no tool_calls, use a zero-width space so the message isn't blank.
    const rawContent = assistant.content;
    const assistantContent = rawContent
      ? rawContent
      : hasToolCalls ? null : '​';
    wire.push({
      role: 'assistant',
      content: assistantContent,
      tool_calls: assistant.tool_calls,
    });
    deps.onWireUpdate?.(wire);

    if (!hasToolCalls) {
      // Natural termination → final prose already on the wire.
      return wire;
    }

    // Boundary 2: aborted while the model was responding. We just pushed an assistant turn
    // with tool calls — seal it so the wire stays valid, then stop before running anything.
    if (deps.signal?.aborted) {
      sealDanglingToolCalls(wire);
      deps.onWireUpdate?.(wire);
      return wire;
    }

    // Validate + classify every requested call. Each tool_call MUST get a result.
    const executable: PreparedCall[] = [];
    for (const tc of toolCalls) {
      const tool = deps.getTool(tc.function.name);
      if (!tool) {
        deps.onStatus?.(tc.id, 'error', { name: tc.function.name, args: {} });
        pushTool(tc.id, { error: `Unknown tool: ${tc.function.name}` }, tc.function.name);
        continue;
      }
      const validation = validateArgs(tool, tc.function.arguments);
      if (!validation.ok) {
        deps.onStatus?.(tc.id, 'error', { name: tc.function.name, args: {} });
        pushTool(tc.id, { error: validation.error }, tc.function.name);
        continue;
      }
      deps.onStatus?.(tc.id, tool.requiresConfirmation ? 'pending' : 'approved', {
        name: tc.function.name,
        args: validation.value,
      });
      executable.push({ id: tc.id, name: tc.function.name, args: validation.value, tool });
    }

    // Collected across all calls this turn; injected as one follow-up user message.
    const pendingImages: string[] = [];

    const runOne = async (call: PreparedCall) => {
      deps.onStatus?.(call.id, 'running', { name: call.name, args: call.args });
      let result: ToolResult;
      try {
        result = await call.tool.execute(call.args, deps.context);
      } catch (e) {
        result = { error: e instanceof Error ? e.message : String(e) };
      }
      deps.onStatus?.(call.id, result.error ? 'error' : 'done', { name: call.name, args: call.args });
      pushTool(call.id, result, call.name);
      if (result.images && result.images.length > 0) pendingImages.push(...result.images);
    };

    const auto = executable.filter(c => !c.tool.requiresConfirmation);
    const confirm = executable.filter(c => c.tool.requiresConfirmation);

    // Auto (read/benign) tools run immediately.
    for (const call of auto) await runOne(call);

    // Confirmable tools: one batched human gate for the whole turn.
    if (confirm.length > 0) {
      if (deps.skipPermissions?.()) {
        for (const call of confirm) await runOne(call);
      } else {
        const batchId = nextBatchId();
        const decision = await deps.requestInteraction({
          batchId,
          calls: confirm.map(c => ({ id: c.id, name: c.name, args: c.args })),
        });
        for (const call of confirm) {
          if (decision.approved) {
            await runOne(call);
          } else {
            deps.onStatus?.(call.id, 'denied', { name: call.name, args: call.args });
            pushTool(call.id, { error: 'User denied this action.' }, call.name);
          }
        }
      }
    }

    // Multimodal results: OpenAI tool messages are text-only, so images ride in a
    // follow-up user message with image_url parts.
    if (pendingImages.length > 0) {
      wire.push({
        role: 'user',
        content: [
          { type: 'text', text: 'Images from the tool result(s) above:' },
          ...pendingImages.map(url => ({ type: 'image_url', image_url: { url } })),
        ],
      });
      deps.onWireUpdate?.(wire);
    }
  }

  // Cap hit.
  wire.push({
    role: 'assistant',
    content: 'I\'ve reached the maximum number of steps for this request. Let me know how you\'d like to proceed.',
  });
  deps.onWireUpdate?.(wire);
  return wire;
}
