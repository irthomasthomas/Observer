// src/mcp/registry.ts
//
// The v1 Observer MCP tool set. Each tool is a JSON-Schema parameter spec plus a pure
// executor over existing app utilities. Executors are React-free and only touch the
// data layer (agent_database, IterationStore, main_loop, ModelManager, local model managers),
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
import { checkPhoneWhitelist } from '@utils/pre-flight';
import { downloadDefaultLocalModel } from './localModel';
import { tauriStreamCapture } from '@utils/tauriStreamCapture';
import { setAgentCrop } from '@utils/screenCapture';
import { isDesktop, isWeb } from '@utils/platform';
import { browserStreamCapture } from '@utils/browserStreamCapture';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** How often check_whitelist re-checks, and how long it waits before giving up. */
const WHITELIST_POLL_MS = 5000;
const WHITELIST_WAIT_MS = 15 * 60 * 1000;

/** Resolve after `ms`, or reject as soon as `signal` aborts (so a blocking wait is cancellable). */
function sleepOrAbort(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException('Aborted', 'AbortError'));
    const onAbort = () => { clearTimeout(timer); reject(new DOMException('Aborted', 'AbortError')); };
    const timer = setTimeout(() => { signal?.removeEventListener('abort', onAbort); resolve(); }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

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
// capture_screen helpers — return one preview frame and leave a live stream that
// start_agent reuses. The platform split mirrors StreamManager (streamManager.ts):
// isWeb() → browser getDisplayMedia; Tauri → the native screen-capture plugin, which
// is itself platform-agnostic (iOS broadcast vs Android MediaProjection handled behind
// one `start_capture_cmd`), so this layer needs no iOS/Android branching.
// ---------------------------------------------------------------------------

/** Web / mobile web: getDisplayMedia picker, grab one frame via a hidden <video>. */
async function captureScreenWeb(): Promise<ToolResult> {
  if (!navigator?.mediaDevices?.getDisplayMedia) {
    return { error: 'Screen capture is not supported in this browser. Screen monitoring agents cannot be created here.' };
  }
  try {
    await browserStreamCapture.acquireMasterStream('display');
    const streams = browserStreamCapture.getStreams();
    const videoTrack = streams.screenVideoStream?.getVideoTracks()[0];
    if (!videoTrack) return { error: 'No video track acquired from screen share.' };

    // Grab one frame via a hidden video element (works across all browsers).
    const video = document.createElement('video');
    video.srcObject = streams.screenVideoStream!;
    video.muted = true;
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error('Video metadata load failed'));
      video.play().catch(reject);
    });
    // Give the first frame a moment to render.
    await new Promise(r => setTimeout(r, 150));

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    canvas.getContext('2d')!.drawImage(video, 0, 0);
    video.pause();

    const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
    const settings = videoTrack.getSettings();
    return {
      data: {
        captured: true,
        width: settings.width ?? canvas.width,
        height: settings.height ?? canvas.height,
        note: 'Stream is live and will be reused by start_agent — no second picker prompt.',
      },
      images: [dataUrl],
    };
  } catch (e) {
    // User cancelled the picker or permission was denied.
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes('Permission denied') || msg.includes('NotAllowed') || msg.includes('user gesture')) {
      return { error: 'Screen share was cancelled or denied. Ask the user if they want to try again.' };
    }
    return { error: msg };
  }
}

/**
 * Mobile app (Tauri iOS/Android): trigger the native picker via tauriStreamCapture — the
 * same singleton the agent loop acquires, so the live stream is reused by start_agent.
 * Frames arrive asynchronously (on iOS the user taps "Start Broadcast" + a short countdown),
 * so poll the latest raw frame until one lands or we time out, rather than grabbing
 * synchronously like the browser path.
 */
async function captureScreenTauri(): Promise<ToolResult> {
  try {
    await tauriStreamCapture.acquireMasterStream('display');
  } catch (e) {
    // Android surfaces a real rejection on denial; iOS dismissal just yields no frames.
    const msg = e instanceof Error ? e.message : String(e);
    if (/denied|cancel|NotAllowed/i.test(msg)) {
      return { error: 'Screen capture was cancelled or denied. Ask the user if they want to try again.' };
    }
    return { error: msg };
  }

  const FRAME_TIMEOUT_MS = 15000;
  const POLL_MS = 200;
  const deadline = Date.now() + FRAME_TIMEOUT_MS;
  let raw: string | null = null;
  while (Date.now() < deadline) {
    raw = tauriStreamCapture.getLatestBase64Frame();
    if (raw) break;
    await new Promise(r => setTimeout(r, POLL_MS));
  }

  if (!raw) {
    return { error: 'Screen capture started but no frame has arrived yet. On iOS, make sure you tapped "Start Broadcast" in the system sheet, then call capture_screen again.' };
  }

  return {
    data: {
      captured: true,
      note: 'Native screen capture is live (whole screen) and will be reused by start_agent — no second prompt.',
    },
    images: [`data:image/jpeg;base64,${raw}`],
  };
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
        id: { type: 'string', description: 'Unique id letters, numbers, and underscores only, no dashes.' },
        name: { type: 'string', description: 'Human-readable agent name.' },
        description: { type: 'string', description: 'Short description of what the agent does.' },
        model_name: { type: 'string', description: 'Model to power the agent (see list_models).' },
        system_prompt: { type: 'string', description: 'The system prompt, including any $SENSOR placeholders ($SCREEN, $MEMORY, $CLIPBOARD, ...).' },
        loop_interval_seconds: { type: 'number', description: 'Seconds between agent iterations. Optional — defaults to 30. Use shorter (~5–15s) for live screen/camera watchers, longer for periodic checks.' },
        code: { type: 'string', description: 'JavaScript run after each model response (agent-code API: response, sendEmail(), appendMemory(), overlay(), startAgent(), stopAgent(), ...).' },
      },
      required: ['id', 'name', 'model_name', 'system_prompt', 'code'],
    },
    requiresConfirmation: true,
    multimodal: false,
    execute: async (args): Promise<ToolResult> => {
      if (!/\$(?:SCREEN|CAMERA|MICROPHONE|CLIPBOARD|MEMORY|LOCATION)\b/.test(args.system_prompt)) {
        return { error: 'The system_prompt must include at least one sensor placeholder (e.g. $SCREEN, $CAMERA, $MICROPHONE, $CLIPBOARD, $MEMORY, $LOCATION). Agents without a sensor have no perception — add one and try again.' };
      }
      const agent: CompleteAgent = {
        id: args.id,
        name: args.name,
        description: args.description ?? '',
        model_name: args.model_name,
        system_prompt: args.system_prompt,
        loop_interval_seconds: args.loop_interval_seconds ?? 30,
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
        loop_interval_seconds: { type: 'number', description: 'Seconds between agent iterations. Optional — omit to keep the agent\'s current interval.' },
        code: { type: 'string', description: 'JavaScript run after each model response (agent-code API).' },
      },
      required: ['id', 'name', 'model_name', 'system_prompt', 'code'],
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
        loop_interval_seconds: args.loop_interval_seconds ?? existing.loop_interval_seconds ?? 30,
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
    name: 'check_whitelist',
    description: 'Pre-flight gate for the phone-based notification tools (sendSms, call, sendWhatsapp). These tools ONLY deliver to whitelisted numbers, and start_agent FAILS with a whitelist error otherwise — so call this BEFORE start_agent for any agent that uses a phone tool. Pass the phone_number (E.164, e.g. +18632085341) and the channel it will be used for. This BLOCKS: if the number is already whitelisted it returns immediately; if not, the user is shown an inline prompt (with QR codes) and this WAITS until they finish whitelisting, then returns success. Do NOT announce that the number is unwhitelisted or ask the user to whitelist it — the inline prompt handles that. Once this returns, go straight to start_agent.',
    parameters: {
      type: 'object',
      properties: {
        phone_number: { type: 'string', description: 'The phone number to check, in E.164 format (e.g. +18632085341).' },
        channel: { type: 'string', enum: ['sms', 'voice', 'whatsapp'], description: 'Which channel the number will be used for: sms (sendSms), voice (call), or whatsapp (sendWhatsapp). WhatsApp has a separate whitelist; sms and voice share one. Defaults to sms.' },
      },
      required: ['phone_number'],
    },
    requiresConfirmation: false,
    multimodal: false,
    execute: async (args, ctx): Promise<ToolResult> => {
      if (!args.phone_number) return { error: 'Provide a phone_number to check.' };
      if (args.phone_number === '+18632085341') {
        return { error: "🚫 That's Observer's own phone number, not the user's. Ask the user for their phone number and check the whitelist for that instead." };
      }

      // Funnel through the same checkPhoneWhitelist gate start_agent uses by handing it a
      // one-line snippet — keeps channel handling + the API call in a single place.
      const fn = args.channel === 'whatsapp' ? 'sendWhatsapp'
        : args.channel === 'voice' ? 'call'
        : 'sendSms';
      const code = `${fn}("${args.phone_number}")`;
      const channel = args.channel ?? 'sms';

      // Block until the number is whitelisted (the inline pill guides the user), the run is
      // aborted (Stop), or we give up after WHITELIST_WAIT_MS. Waiting here — instead of
      // returning "not whitelisted" — is what lets the run resume silently once whitelisting
      // is done, with no extra model/user messages.
      const deadline = Date.now() + WHITELIST_WAIT_MS;
      while (true) {
        if (ctx.signal?.aborted) return { error: 'Cancelled.' };
        try {
          const { phoneNumbers } = await checkPhoneWhitelist(code, ctx.getToken);
          if (phoneNumbers.length > 0 && phoneNumbers.every(p => p.isWhitelisted)) {
            return { data: { phoneNumber: args.phone_number, channel, whitelisted: true } };
          }
        } catch (e) {
          return { error: e instanceof Error ? e.message : String(e) };
        }
        if (Date.now() >= deadline) {
          return {
            data: {
              phoneNumber: args.phone_number,
              channel,
              whitelisted: false,
              timedOut: true,
              note: 'Still not whitelisted after a long wait. Ask the user whether to keep waiting or skip starting the agent.',
            },
          };
        }
        try {
          await sleepOrAbort(WHITELIST_POLL_MS, ctx.signal);
        } catch {
          return { error: 'Cancelled.' };
        }
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
    name: 'list_screen_targets',
    description: 'List the screens (monitors) and windows available to capture for a $SCREEN agent, as a text-only catalog (NO images — a desktop can have many windows, so thumbnails are fetched one at a time with see_screen_target). Call this on desktop BEFORE start_agent for any agent whose system_prompt uses $SCREEN: read the list, see_screen_target the few that plausibly match what the user wants to watch, then select_screen_target the best one. On the web/mobile app this returns a note instead — there the OS picker appears automatically when the agent starts, so just go straight to start_agent. Each target has an id (for see_screen_target / select_screen_target), kind (monitor/window), name, appName, and width/height in pixels (for context; set_screen_crop takes a normalized box_2d, not these pixels).',
    parameters: { type: 'object', properties: {} },
    requiresConfirmation: false,
    multimodal: false,
    execute: async (): Promise<ToolResult> => {
      if (!isDesktop()) {
        return {
          data: {
            platform: 'web',
            targets: [],
            note: 'You are on Observer web — there is nothing to list or select here. Screen selection is handled by the OS picker, which pops automatically at start_agent. Do NOT stop, summarize, or wait for the user: continue the flow in this same run and proceed to start_agent now (it will surface its own approval card). Skip see_screen_target / select_screen_target / set_screen_crop entirely.',
          },
        };
      }
      try {
        const targets = await tauriStreamCapture.getTargets(false);
        return {
          data: {
            platform: 'desktop',
            targets: targets.map(t => ({
              id: t.id,
              kind: t.kind,
              name: t.name,
              appName: t.appName,
              width: t.width,
              height: t.height,
              isPrimary: t.isPrimary,
            })),
          },
        };
      } catch (e) {
        return { error: e instanceof Error ? e.message : String(e) };
      }
    },
  },
  {
    name: 'see_screen_target',
    description: 'Fetch a thumbnail image of ONE capture target so you can actually SEE what is on that monitor/window before committing to it. Pass a target_id from list_screen_targets. Desktop only. Use this to check the one or few candidates that match what the user wants to watch, then select_screen_target the right one. Cheaper than dumping every window\'s image at once — call it per target as needed. If the target has since closed, this fails; re-run list_screen_targets.',
    parameters: {
      type: 'object',
      properties: {
        target_id: { type: 'string', description: 'The id of the target to preview (from list_screen_targets).' },
      },
      required: ['target_id'],
    },
    requiresConfirmation: false,
    multimodal: true,
    execute: async (args): Promise<ToolResult> => {
      if (!isDesktop()) {
        return { error: 'see_screen_target is desktop-only; on web the OS picker shows the screens at start_agent.' };
      }
      try {
        const targets = await tauriStreamCapture.getTargets(true);
        const match = targets.find(t => t.id === args.target_id);
        if (!match) {
          return { error: `Target '${args.target_id}' is no longer available (window may have closed). Re-run list_screen_targets.` };
        }
        const raw = match.thumbnail;
        const url = !raw ? undefined : raw.startsWith('data:') ? raw : `data:image/png;base64,${raw}`;
        return {
          data: {
            id: match.id,
            kind: match.kind,
            name: match.name,
            appName: match.appName,
            width: match.width,
            height: match.height,
            hasThumbnail: !!url,
          },
          images: url ? [url] : undefined,
        };
      } catch (e) {
        return { error: e instanceof Error ? e.message : String(e) };
      }
    },
  },
  {
    name: 'select_screen_target',
    description: 'Pre-select which screen or window a $SCREEN agent will capture, so start_agent runs without popping the desktop screen-selector. Pass a target_id from list_screen_targets. Desktop only. Call this (optionally with set_screen_crop) right before start_agent. If the chosen window has since closed, this fails — re-run list_screen_targets and pick again.',
    parameters: {
      type: 'object',
      properties: {
        target_id: { type: 'string', description: 'The id of the target to capture (from list_screen_targets).' },
      },
      required: ['target_id'],
    },
    requiresConfirmation: true,
    multimodal: false,
    execute: async (args): Promise<ToolResult> => {
      if (!isDesktop()) {
        return { error: 'select_screen_target is desktop-only; on web the OS picker handles selection at start_agent.' };
      }
      try {
        const targets = await tauriStreamCapture.getTargets(false);
        const match = targets.find(t => t.id === args.target_id);
        if (!match) {
          return { error: `Target '${args.target_id}' is no longer available (window may have closed). Re-run list_screen_targets and pick again.` };
        }
        tauriStreamCapture.setPreselectedTarget(match.id);
        return { data: { selected: true, id: match.id, kind: match.kind, name: match.name, width: match.width, height: match.height } };
      } catch (e) {
        return { error: e instanceof Error ? e.message : String(e) };
      }
    },
  },
  {
    name: 'set_screen_crop',
    description: 'OPTIONAL. Crop a $SCREEN agent\'s capture to a rectangular sub-region of its target, so the model only sees (and only spends tokens on) the part that matters — e.g. a download progress bar. Skip this entirely to watch the whole screen/window (the default). Give the region as box_2d = [ymin, xmin, ymax, xmax] in the SAME normalized 0–1000 coordinate space you use for object detection: top-left origin, y first, every value 0–1000 regardless of the screen\'s real resolution. Read box_2d straight off the image you saw in see_screen_target / capture_screen — do NOT convert to pixels yourself, and do NOT pass the target\'s resolution; the crop is stored normalized and resolved against the live frame at capture time. Pass clear:true to remove an existing crop and capture the full target.',
    parameters: {
      type: 'object',
      properties: {
        agent_id: { type: 'string', description: 'The agent whose screen capture to crop.' },
        box_2d: {
          type: 'array',
          items: { type: 'number' },
          minItems: 4,
          maxItems: 4,
          description: 'The crop region as [ymin, xmin, ymax, xmax], normalized to 0–1000 (top-left origin, y first) — the same format you emit for bounding boxes.',
        },
        clear: { type: 'boolean', description: 'If true, remove any existing crop and capture the full target. Ignores box_2d.' },
      },
      required: ['agent_id'],
    },
    requiresConfirmation: true,
    multimodal: false,
    execute: async (args): Promise<ToolResult> => {
      if (args.clear) {
        setAgentCrop(args.agent_id, 'screen', null);
        return { data: { agent_id: args.agent_id, cropped: false } };
      }

      const box = args.box_2d;
      if (!Array.isArray(box) || box.length !== 4 || box.some((v: unknown) => typeof v !== 'number')) {
        return { error: 'Provide box_2d as four numbers [ymin, xmin, ymax, xmax] normalized 0–1000 (or clear:true to remove the crop).' };
      }
      const [ymin, xmin, ymax, xmax] = box as number[];
      if ([ymin, xmin, ymax, xmax].some(v => v < 0 || v > 1000)) {
        return { error: 'box_2d values must be normalized to 0–1000.' };
      }
      if (xmax <= xmin || ymax <= ymin) {
        return { error: 'box_2d must satisfy xmax > xmin and ymax > ymin (it is [ymin, xmin, ymax, xmax]).' };
      }

      // Store the crop as fractions of the frame (0–1) — resolution-independent.
      // It is resolved to pixels against the real capture frame at capture time, so it
      // stays correct regardless of the target's resolution or the capture pipeline's
      // scaling (the previous descale-to-target-pixels step mismatched the actual frame).
      const crop = {
        x: xmin / 1000,
        y: ymin / 1000,
        width: (xmax - xmin) / 1000,
        height: (ymax - ymin) / 1000,
      };

      setAgentCrop(args.agent_id, 'screen', crop);
      return { data: { agent_id: args.agent_id, cropped: true, box_2d: [ymin, xmin, ymax, xmax], crop } };
    },
  },
  {
    name: 'capture_screen',
    description: 'Trigger a screen-share preview so you can SEE what will be monitored before building the agent, then return one captured frame as an image. On web / mobile web this opens the browser screen-share picker (pick a screen, window, or tab). On the mobile app it triggers the OS screen-capture picker and captures the WHOLE screen (iOS broadcast / Android screen-record permission): the user must approve the system prompt, and on iOS there can be a few seconds of delay before the first frame — if this returns a "no frame yet" message, just call it again. The stream stays live — start_agent reuses it without prompting again. Use this on web and mobile app instead of list_screen_targets/see_screen_target/select_screen_target. Call it BEFORE create_agent for any agent whose system_prompt uses $SCREEN.',
    parameters: { type: 'object', properties: {} },
    requiresConfirmation: false,
    multimodal: true,
    // Same platform split as StreamManager: browser → getDisplayMedia; Tauri → native plugin.
    execute: async (): Promise<ToolResult> => isWeb() ? captureScreenWeb() : captureScreenTauri(),
  },
  {
    name: 'download_model',
    description: 'Download and load the default on-device model so agents can run locally with NO cloud and NO API key. Takes no arguments — Observer picks the right Gemma 4 E2B build for the platform (a transformers.js ONNX model in the browser, a llama.cpp GGUF in the desktop app). This BLOCKS while it downloads (a few GB) and loads; progress bars are shown to the user. When it resolves, the returned `model_name` is immediately usable as a `create_agent` model_name. Only one local model is needed; call list_models afterward to confirm. Asks the user to approve.',
    parameters: { type: 'object', properties: {} },
    requiresConfirmation: true,
    multimodal: false,
    execute: async (): Promise<ToolResult> => {
      try {
        const result = await downloadDefaultLocalModel();
        return { data: result };
      } catch (e) {
        return { error: e instanceof Error ? e.message : String(e) };
      }
    },
  },
];

// ---------------------------------------------------------------------------
// Registry lookups
// ---------------------------------------------------------------------------

/** Desktop-only screen tools — replaced by capture_screen on all other surfaces. */
const DESKTOP_ONLY_TOOLS = new Set(['list_screen_targets', 'see_screen_target', 'select_screen_target']);
/** Sub-agentic screen tool — only exposed on web / mobile app / mobile web. */
const WEB_ONLY_TOOLS = new Set(['capture_screen']);

function getPlatformTools(): ToolDefinition[] {
  if (isDesktop()) {
    return TOOLS.filter(t => !WEB_ONLY_TOOLS.has(t.name));
  }
  // Web, mobile app, mobile web — sub-agentic: browser picker flow.
  return TOOLS.filter(t => !DESKTOP_ONLY_TOOLS.has(t.name));
}

export function getTool(name: string): ToolDefinition | undefined {
  return getPlatformTools().find(t => t.name === name);
}

/** Build the OpenAI `tools` request payload for the current platform. */
export function getToolSpecs(): WireToolSpec[] {
  return getPlatformTools().map(t => ({
    type: 'function' as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    },
  }));
}
