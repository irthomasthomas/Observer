// src/mcp/types.ts
//
// Transport-agnostic wire + tool types for the Observer MCP core.
//
// These types are intentionally framework-free (no React, no IndexedDB). They model
// the OpenAI function-calling wire format so that the same registry + runner can later
// drop into a real MCP server with only the transport swapped.

/**
 * A single tool call requested by the model, in OpenAI shape.
 * `arguments` is a raw JSON string (as the API returns it); the runner parses + validates it.
 */
export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

/**
 * A message on the wire. Mirrors the OpenAI chat-completions message shape:
 * - system / user / assistant text
 * - assistant messages may carry `tool_calls`
 * - tool results are `role: 'tool'` keyed by `tool_call_id`
 *
 * `content` is `any` because user messages may be multimodal content-part arrays
 * (text + image_url parts), matching what the rest of the app already sends.
 */
export interface WireMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: any;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  name?: string;
}

/**
 * The model's response for a single turn. Returned by the tools-aware send path.
 */
export interface AssistantResponse {
  content: string;
  tool_calls?: ToolCall[];
  finish_reason?: string;
}

/**
 * Result of executing a tool. `images` are optional base64 data-URLs that the runner
 * injects as a follow-up multimodal user message (OpenAI tool results are text-only).
 */
export interface ToolResult {
  // Arbitrary JSON-serializable payload (object, array, string, …). Serialized into the
  // `role: 'tool'` message content by the runner.
  data?: any;
  error?: string;
  images?: string[]; // data-URL strings, e.g. "data:image/png;base64,..."
}

/**
 * A JSON-Schema object describing a tool's parameters (the `parameters` field of an
 * OpenAI function definition).
 */
export interface JsonSchema {
  type: 'object';
  properties: Record<string, any>;
  required?: string[];
  additionalProperties?: boolean;
}

/**
 * A tool definition. The `execute` body is the only browser-bound part; everything else
 * (name, description, schema) is pure data that serializes onto the wire.
 */
export interface ToolDefinition {
  name: string;
  description: string;
  parameters: JsonSchema;
  /** Confirmable (write/side-effecting) tools require a human gate before executing. */
  requiresConfirmation: boolean;
  /** Whether this tool may return images in its ToolResult. */
  multimodal: boolean;
  execute: (args: any, ctx: ToolContext) => Promise<ToolResult>;
}

/**
 * Ambient context handed to executors that need it (e.g. an auth token provider for
 * starting agents against the Observer API).
 */
export interface ToolContext {
  getToken?: () => Promise<string | undefined>;
  /** Aborts a long-running/blocking executor (e.g. check_whitelist waiting for the user). */
  signal?: AbortSignal;
}

/**
 * Lifecycle status of a single tool call, surfaced to the UI.
 */
export type ToolCallStatus =
  | 'pending'   // awaiting human approval
  | 'approved'  // human approved, about to run
  | 'denied'    // human denied
  | 'running'   // executor in flight
  | 'done'      // executor resolved
  | 'error';    // executor threw / returned error

/**
 * The OpenAI "function tool" wire shape, built from a ToolDefinition for the request body.
 */
export interface WireToolSpec {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: JsonSchema;
  };
}
