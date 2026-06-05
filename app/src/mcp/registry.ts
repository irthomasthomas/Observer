// src/mcp/registry.ts
//
// The v1 Observer MCP tool set. Each tool is a JSON-Schema parameter spec plus a pure
// executor over existing app utilities. Executors are React-free and only touch the
// data layer (agent_database, IterationStore, main_loop, ModelManager, pullModelManager),
// so the same registry can later be served from a real MCP server with the transport swapped.

import type { ToolDefinition, ToolResult, WireToolSpec } from './types';
import {
  listAgents,
  getAgent,
  getAgentCode,
  saveAgent,
  type CompleteAgent,
} from '@utils/agent_database';
import {
  startAgentLoop,
  stopAgentLoop,
  getRunningAgentIds,
  isAgentLoopRunning,
} from '@utils/main_loop';
import { IterationStore, type IterationData } from '@utils/IterationStore';
import { ModelManager } from '@utils/ModelManager';
import pullModelManager from '@utils/pullModelManager';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Count images attached to an iteration without surfacing any base64 payloads. */
function countIterationImages(it: IterationData): number {
  let count = it.modelImages?.length || 0;
  for (const sensor of it.sensors) {
    if (sensor.type === 'screenshot' || sensor.type === 'camera') count += 1;
  }
  return count;
}

/** Base64-free summary of a single iteration. */
function summarizeIteration(it: IterationData) {
  return {
    id: it.id,
    sessionId: it.sessionId,
    sessionIterationNumber: it.sessionIterationNumber,
    startTime: it.startTime,
    duration: it.duration,
    modelResponse: it.modelResponse,
    tools: it.tools.map(t => ({ name: t.name, status: t.status })),
    hasError: it.hasError,
    isSkipped: it.isSkipped ?? false,
    sensorTypes: Array.from(new Set(it.sensors.map(s => s.type))),
    imageCount: countIterationImages(it),
  };
}

/** Find a full iteration by id across the in-memory current session and persisted history. */
async function findIteration(iterationId: string, agentId?: string): Promise<IterationData | undefined> {
  const inMemory = IterationStore.getIteration(iterationId);
  if (inMemory) return inMemory;

  // Search persisted history. If agentId is known, restrict to that agent; otherwise
  // we can't enumerate every agent cheaply, so require agentId for historical lookups.
  if (agentId) {
    const sessions = await IterationStore.getHistoricalSessions(agentId);
    for (const session of sessions) {
      const found = session.iterations.find(i => i.id === iterationId);
      if (found) return found;
    }
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Tool definitions
// ---------------------------------------------------------------------------

export const TOOLS: ToolDefinition[] = [
  // ---- READ TOOLS ----------------------------------------------------------
  {
    name: 'list_agents',
    description: 'List all Observer agents the user has saved, with their basic config (id, name, description, model, loop interval).',
    parameters: { type: 'object', properties: {} },
    requiresConfirmation: false,
    multimodal: false,
    execute: async (): Promise<ToolResult> => {
      const agents = await listAgents();
      return {
        data: agents.map(a => ({
          id: a.id,
          name: a.name,
          description: a.description,
          model_name: a.model_name,
          loop_interval_seconds: a.loop_interval_seconds,
          running: isAgentLoopRunning(a.id),
        })),
      };
    },
  },
  {
    name: 'get_agent',
    description: 'Get the full configuration of a single agent by id, including its system prompt and JavaScript code.',
    parameters: {
      type: 'object',
      properties: { id: { type: 'string', description: 'The agent id.' } },
      required: ['id'],
    },
    requiresConfirmation: false,
    multimodal: false,
    execute: async (args): Promise<ToolResult> => {
      const agent = await getAgent(args.id);
      if (!agent) return { error: `Agent '${args.id}' not found.` };
      const code = await getAgentCode(args.id);
      return { data: { agent, code: code ?? '' } };
    },
  },
  {
    name: 'get_status',
    description: 'Get which agents are currently running. Pass an id to check a single agent, or omit it to list all running agents.',
    parameters: {
      type: 'object',
      properties: { id: { type: 'string', description: 'Optional agent id to check.' } },
    },
    requiresConfirmation: false,
    multimodal: false,
    execute: async (args): Promise<ToolResult> => {
      if (args.id) {
        return { data: { id: args.id, running: isAgentLoopRunning(args.id) } };
      }
      return { data: { runningAgentIds: getRunningAgentIds() } };
    },
  },
  {
    name: 'get_runs',
    description: 'Get a summary of an agent\'s recent runs (iterations) across all sessions. Returns metadata only — model responses, tool calls, errors, sensor types, and image counts — with NO image data. Call get_iteration to actually view a screenshot.',
    parameters: {
      type: 'object',
      properties: {
        agent_id: { type: 'string', description: 'The agent id.' },
        limit: { type: 'integer', description: 'Max number of recent iterations to return (default 20).' },
      },
      required: ['agent_id'],
    },
    requiresConfirmation: false,
    multimodal: false,
    execute: async (args): Promise<ToolResult> => {
      const limit = typeof args.limit === 'number' && args.limit > 0 ? args.limit : 20;

      // Current (in-memory) session iterations + persisted history.
      const current = IterationStore.getIterationsForAgent(args.agent_id);
      const historicalSessions = await IterationStore.getHistoricalSessions(args.agent_id);
      const historical = historicalSessions.flatMap(s => s.iterations);

      // De-dupe by id (current session may also appear in history), newest first.
      const byId = new Map<string, IterationData>();
      for (const it of [...historical, ...current]) byId.set(it.id, it);
      const all = Array.from(byId.values()).sort(
        (a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime()
      );

      return {
        data: {
          agent_id: args.agent_id,
          total: all.length,
          iterations: all.slice(0, limit).map(summarizeIteration),
        },
      };
    },
  },
  {
    name: 'get_iteration',
    description: 'Get the full detail of a single iteration by its id, INCLUDING the screenshot/camera images that were captured. Use this when you need to actually see what an agent saw. Provide agent_id as well so historical iterations can be located.',
    parameters: {
      type: 'object',
      properties: {
        iteration_id: { type: 'string', description: 'The iteration id (from get_runs).' },
        agent_id: { type: 'string', description: 'The owning agent id (needed for historical iterations).' },
      },
      required: ['iteration_id'],
    },
    requiresConfirmation: false,
    multimodal: true,
    execute: async (args): Promise<ToolResult> => {
      const it = await findIteration(args.iteration_id, args.agent_id);
      if (!it) return { error: `Iteration '${args.iteration_id}' not found. For historical iterations, include agent_id.` };

      // Collect images (model images + screenshot/camera sensors) as data-URLs.
      const images: string[] = [];
      const toDataUrl = (raw: string) => raw.startsWith('data:') ? raw : `data:image/png;base64,${raw}`;
      if (it.modelImages) images.push(...it.modelImages.map(toDataUrl));
      for (const sensor of it.sensors) {
        if (sensor.type === 'screenshot' || sensor.type === 'camera') {
          const content: any = sensor.content;
          if (typeof content === 'string') images.push(toDataUrl(content));
          else if (content?.data) images.push(toDataUrl(content.data));
        }
      }

      return {
        data: {
          ...summarizeIteration(it),
          modelPrompt: it.modelPrompt,
          sensors: it.sensors.map(s => ({ type: s.type, timestamp: s.timestamp, source: s.source })),
        },
        images,
      };
    },
  },
  {
    name: 'list_models',
    description: 'List the inference models available to power agents, with their server and multimodal capability.',
    parameters: { type: 'object', properties: {} },
    requiresConfirmation: false,
    multimodal: false,
    execute: async (): Promise<ToolResult> => {
      const { models } = ModelManager.getInstance().listModels();
      return {
        data: models.map(m => ({
          name: m.name,
          multimodal: m.multimodal ?? false,
          pro: m.pro ?? false,
          server: m.server,
        })),
      };
    },
  },

  // ---- WRITE TOOLS ---------------------------------------------------------
  {
    name: 'create_agent',
    description: 'Create a new Observer agent (or overwrite one with the same id). The `code` field is JavaScript run after each model call; it uses the SEPARATE agent-code API (sendEmail, appendMemory, $SCREEN sensors in the system_prompt, etc.) — these are NOT function tools you can call here.',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Unique id — letters, numbers, and underscores only.' },
        name: { type: 'string', description: 'Human-readable agent name.' },
        description: { type: 'string', description: 'Short description of what the agent does.' },
        model_name: { type: 'string', description: 'Model to power the agent (see list_models).' },
        system_prompt: { type: 'string', description: 'The system prompt, including any $SENSOR placeholders ($SCREEN, $MEMORY, $CLIPBOARD, ...).' },
        loop_interval_seconds: { type: 'number', description: 'Seconds between agent iterations.' },
        code: { type: 'string', description: 'JavaScript run after each model response (agent-code API: response, sendEmail(), appendMemory(), overlay(), startAgent(), stopAgent(), ...).' },
      },
      required: ['id', 'name', 'model_name', 'system_prompt', 'loop_interval_seconds', 'code'],
    },
    requiresConfirmation: true,
    multimodal: false,
    execute: async (args): Promise<ToolResult> => {
      const agent: CompleteAgent = {
        id: args.id,
        name: args.name,
        description: args.description ?? '',
        model_name: args.model_name,
        system_prompt: args.system_prompt,
        loop_interval_seconds: args.loop_interval_seconds,
      };
      try {
        const saved = await saveAgent(agent, args.code);
        return { data: { saved: true, id: saved.id, name: saved.name } };
      } catch (e) {
        return { error: e instanceof Error ? e.message : String(e) };
      }
    },
  },
  {
    name: 'edit_agent',
    description: 'Edit an existing agent by id. Provide the complete updated configuration (same shape as create_agent). Fails if the agent does not exist.',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'The id of the existing agent to edit.' },
        name: { type: 'string', description: 'Human-readable agent name.' },
        description: { type: 'string', description: 'Short description of what the agent does.' },
        model_name: { type: 'string', description: 'Model to power the agent.' },
        system_prompt: { type: 'string', description: 'The system prompt.' },
        loop_interval_seconds: { type: 'number', description: 'Seconds between agent iterations.' },
        code: { type: 'string', description: 'JavaScript run after each model response (agent-code API).' },
      },
      required: ['id', 'name', 'model_name', 'system_prompt', 'loop_interval_seconds', 'code'],
    },
    requiresConfirmation: true,
    multimodal: false,
    execute: async (args): Promise<ToolResult> => {
      const existing = await getAgent(args.id);
      if (!existing) return { error: `Agent '${args.id}' does not exist. Use create_agent to make a new one.` };
      const agent: CompleteAgent = {
        id: args.id,
        name: args.name,
        description: args.description ?? '',
        model_name: args.model_name,
        system_prompt: args.system_prompt,
        loop_interval_seconds: args.loop_interval_seconds,
      };
      try {
        const saved = await saveAgent(agent, args.code);
        return { data: { saved: true, id: saved.id, name: saved.name } };
      } catch (e) {
        return { error: e instanceof Error ? e.message : String(e) };
      }
    },
  },
  {
    name: 'start_agent',
    description: 'Start an agent\'s run loop. This runs the agent\'s sandboxed code on a schedule (which may send emails/SMS, click, etc.), so it requires confirmation.',
    parameters: {
      type: 'object',
      properties: { id: { type: 'string', description: 'The agent id to start.' } },
      required: ['id'],
    },
    requiresConfirmation: true,
    multimodal: false,
    execute: async (args, ctx): Promise<ToolResult> => {
      const agent = await getAgent(args.id);
      if (!agent) return { error: `Agent '${args.id}' not found.` };
      try {
        await startAgentLoop(args.id, ctx.getToken);
        return { data: { started: true, id: args.id } };
      } catch (e) {
        return { error: e instanceof Error ? e.message : String(e) };
      }
    },
  },
  {
    name: 'stop_agent',
    description: 'Stop a running agent\'s loop. Always safe and reversible.',
    parameters: {
      type: 'object',
      properties: { id: { type: 'string', description: 'The agent id to stop.' } },
      required: ['id'],
    },
    requiresConfirmation: false,
    multimodal: false,
    execute: async (args): Promise<ToolResult> => {
      await stopAgentLoop(args.id);
      return { data: { stopped: true, id: args.id } };
    },
  },
  {
    name: 'pull_model',
    description: 'Download (pull) a model onto a local inference server (e.g. an Ollama server). Progress is shown in the UI.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'The model name to pull.' },
        server: { type: 'string', description: 'The inference server address to pull onto.' },
      },
      required: ['name', 'server'],
    },
    requiresConfirmation: false,
    multimodal: false,
    execute: async (args): Promise<ToolResult> => {
      // Fire-and-forget: pullModelManager broadcasts progress via its own subscription.
      pullModelManager.pullModel(args.name, args.server);
      return { data: { pulling: true, name: args.name, server: args.server } };
    },
  },
];

// ---------------------------------------------------------------------------
// Registry lookups
// ---------------------------------------------------------------------------

const TOOL_MAP: Record<string, ToolDefinition> = Object.fromEntries(
  TOOLS.map(t => [t.name, t])
);

export function getTool(name: string): ToolDefinition | undefined {
  return TOOL_MAP[name];
}

/** Build the OpenAI `tools` request payload from the registry. */
export function getToolSpecs(): WireToolSpec[] {
  return TOOLS.map(t => ({
    type: 'function' as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    },
  }));
}
