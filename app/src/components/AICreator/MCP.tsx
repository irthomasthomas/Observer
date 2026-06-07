// src/components/AICreator/MCP.tsx
//
// Native tool-calling agent creator. Replaces MultiAgentCreator: instead of brittle
// $$$/%%%/&&& text delimiters, the model drives agent creation/management through real
// OpenAI function calls (see src/mcp/). This component is pure UI over the useMCP hook.

import React, { useState, useRef, useEffect } from 'react';
import { Send, Loader2, Users, Plus, CheckCircle2, XCircle, Loader, Play, Square, Save, Download, Cpu, Sparkles } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import type { TokenProvider } from '@utils/main_loop';
import { type ToolStatusEntry } from '../../mcp/useMCP';
import { useMCPContext } from '../../mcp/MCPContext';
import type { WireMessage, ToolCall } from '../../mcp/types';
import type { WhitelistChannel } from '@utils/logging';
import WhitelistInline from '@components/whitelist/WhitelistInline';
import { isTauri } from '@utils/platform';
import { tauriStreamCapture, type CaptureTarget } from '@utils/tauriStreamCapture';
import { Monitor } from 'lucide-react';
import { GemmaModelManager } from '@utils/localLlm/GemmaModelManager';
import { NativeLlmManager } from '@utils/localLlm/NativeLlmManager';
import type { GemmaModelState, NativeModelState } from '@utils/localLlm/types';

interface MCPProps {
  getToken: TokenProvider;
  isAuthenticated: boolean;
  isUsingObServer: boolean;
  onSignIn?: () => void;
  onSwitchToObServer?: () => void;
  onUpgrade?: () => void;
  onRefresh?: () => void;
  onSaveComplete?: () => void;
  initialMessage?: string;
  /** Tailwind height classes for the chat container. Defaults to the hero/sheet sizing. */
  heightClass?: string;
}

// ===================================================================================
//  MARKDOWN BUBBLE
// ===================================================================================
const Markdown: React.FC<{ text: string }> = ({ text }) => (
  <div className="prose prose-sm max-w-none">
    <ReactMarkdown
      components={{
        ul: ({ children }) => <ul className="list-disc pl-4 space-y-1 mb-2">{children}</ul>,
        ol: ({ children }) => <ol className="list-decimal pl-4 space-y-1 mb-2">{children}</ol>,
        li: ({ children }) => <li className="text-inherit">{children}</li>,
        strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
        code: ({ children }) => <code className="bg-gray-100 px-1 py-0.5 rounded text-sm font-mono">{children}</code>,
        p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
      }}
    >
      {text}
    </ReactMarkdown>
  </div>
);

// ===================================================================================
//  TOOL-CALL STATUS CHIP
// ===================================================================================
const StatusIcon: React.FC<{ status?: string }> = ({ status }) => {
  switch (status) {
    case 'done': return <CheckCircle2 className="h-4 w-4 text-green-600" />;
    case 'error':
    case 'denied': return <XCircle className="h-4 w-4 text-red-500" />;
    case 'running': return <Loader className="h-4 w-4 text-purple-600 animate-spin" />;
    default: return <Loader className="h-4 w-4 text-gray-400 animate-spin" />;
  }
};

const ToolChip: React.FC<{ call: ToolCall; status?: ToolStatusEntry }> = ({ call, status }) => (
  <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-gray-100 border border-gray-200 text-xs font-medium text-gray-700 mr-1.5 mt-1.5">
    <StatusIcon status={status?.status} />
    <span className="font-mono">{call.function.name}</span>
  </div>
);

// ===================================================================================
//  DOWNLOAD-MODEL PROGRESS  (live bars while download_model runs)
// ===================================================================================
const formatBytes = (bytes: number) => {
  if (!+bytes) return '0 B';
  const k = 1024, sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
};

const Bar: React.FC<{ pct: number; done?: boolean }> = ({ pct, done }) => (
  <div className="w-full bg-gray-200 rounded-full h-1.5">
    <div
      className={`h-1.5 rounded-full transition-all duration-300 ${done ? 'bg-green-500' : 'bg-purple-600'}`}
      style={{ width: `${Math.max(0, Math.min(100, pct))}%` }}
    />
  </div>
);

/**
 * Subscribes directly to the local-model managers (the same state ModelHub renders) to show
 * live progress for the in-flight `download_model` tool call. Renders nothing when idle.
 */
const DownloadModelProgress: React.FC = () => {
  const tauri = isTauri();
  const [gemma, setGemma] = useState<GemmaModelState>(() => GemmaModelManager.getInstance().getState());
  const [native, setNative] = useState<NativeModelState>(() => NativeLlmManager.getInstance().getState());

  useEffect(() => {
    const unsubGemma = GemmaModelManager.getInstance().onStateChange(setGemma);
    if (!tauri) return unsubGemma;
    const unsubNative = NativeLlmManager.getInstance().onStateChange(setNative);
    return () => { unsubGemma(); unsubNative(); };
  }, [tauri]);

  const Shell: React.FC<{ icon: React.ReactNode; children: React.ReactNode }> = ({ icon, children }) => (
    <div className="mt-2 w-full max-w-md p-3 rounded-lg border border-purple-200 bg-white/70">
      <div className="flex items-center gap-2 mb-2 text-xs font-semibold text-gray-700">
        {icon}<span>On-device model</span>
      </div>
      {children}
    </div>
  );

  if (tauri) {
    const { status, modelId, downloadProgress, downloadedBytes, totalBytes, error } = native;
    if (status === 'downloading') {
      return (
        <Shell icon={<Download className="h-4 w-4 text-purple-600 animate-bounce" />}>
          <div className="flex justify-between text-[11px] text-gray-600 mb-1">
            <span className="truncate max-w-[60%]">{modelId ?? 'model'}.gguf</span>
            <span className="font-medium">
              {totalBytes > 0 ? `${formatBytes(downloadedBytes)} / ${formatBytes(totalBytes)}` : `${Math.round(downloadProgress)}%`}
            </span>
          </div>
          <Bar pct={downloadProgress} />
        </Shell>
      );
    }
    if (status === 'loading') {
      return <Shell icon={<Cpu className="h-4 w-4 text-purple-600 animate-pulse" />}><p className="text-xs text-gray-600">Loading model into memory…</p></Shell>;
    }
    if (status === 'loaded') {
      return <Shell icon={<CheckCircle2 className="h-4 w-4 text-green-600" />}><p className="text-xs text-gray-600">Model ready on your device.</p></Shell>;
    }
    if (status === 'error' && error) {
      return <Shell icon={<XCircle className="h-4 w-4 text-red-500" />}><p className="text-xs text-red-600">{error}</p></Shell>;
    }
    return null;
  }

  // transformers.js (browser): one shot that both downloads and loads
  if (gemma.status === 'loading') {
    return (
      <Shell icon={<Sparkles className="h-4 w-4 text-purple-600 animate-pulse" />}>
        {gemma.progress.length > 0 ? (
          <div className="space-y-1.5">
            {gemma.progress.map(item => (
              <div key={item.file}>
                <div className="flex justify-between text-[11px] text-gray-600 mb-1">
                  <span className="truncate max-w-[60%]">{item.file}</span>
                  <span className="font-medium">
                    {item.status === 'done' ? 'Done' : item.total > 0 ? `${formatBytes(item.loaded)} / ${formatBytes(item.total)}` : `${Math.round(item.progress)}%`}
                  </span>
                </div>
                <Bar pct={item.progress} done={item.status === 'done'} />
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-gray-600">Downloading & loading…</p>
        )}
      </Shell>
    );
  }
  if (gemma.status === 'loaded') {
    return <Shell icon={<CheckCircle2 className="h-4 w-4 text-green-600" />}><p className="text-xs text-gray-600">Model ready in your browser.</p></Shell>;
  }
  if (gemma.status === 'error' && gemma.error) {
    return <Shell icon={<XCircle className="h-4 w-4 text-red-500" />}><p className="text-xs text-red-600">{gemma.error}</p></Shell>;
  }
  return null;
};

// ===================================================================================
//  AGENT APPROVAL CARD  (the human gate — a tool whose promise resolves from the UI)
// ===================================================================================
interface ApprovalCall { id: string; name: string; args: any; }

/**
 * Preview for select_screen_target / set_screen_crop calls: shows the chosen monitor/window
 * thumbnail (fetched live from the same source of truth the capture path reads) with the
 * proposed crop drawn as an overlay box, so the user sees exactly what will be captured.
 */
const ScreenCaptureApproval: React.FC<{
  targetId?: string;
  crop?: { x: number; y: number; width: number; height: number };
  clearCrop?: boolean;
}> = ({ targetId, crop, clearCrop }) => {
  const [target, setTarget] = useState<CaptureTarget | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    tauriStreamCapture.getTargets(true)
      .then(targets => { if (!cancelled) setTarget(targets.find(t => t.id === targetId) ?? null); })
      .catch(e => { if (!cancelled) setError(e instanceof Error ? e.message : String(e)); });
    return () => { cancelled = true; };
  }, [targetId]);

  const thumb = target?.thumbnail
    ? (target.thumbnail.startsWith('data:') ? target.thumbnail : `data:image/png;base64,${target.thumbnail}`)
    : null;

  // Crop overlay expressed as % of the target's pixel space, so it tracks the scaled thumbnail.
  const overlay = crop && target
    ? {
        left: `${(crop.x / target.width) * 100}%`,
        top: `${(crop.y / target.height) * 100}%`,
        width: `${(crop.width / target.width) * 100}%`,
        height: `${(crop.height / target.height) * 100}%`,
      }
    : null;

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-3">
      <div className="flex items-center mb-2">
        <Monitor className="h-4 w-4 text-blue-600 mr-2" />
        <span className="text-sm text-gray-800">
          Capture {target ? <strong>{target.name}</strong> : <code className="font-mono text-xs">{targetId}</code>}
          {target?.appName && target.appName !== target.name ? ` (${target.appName})` : ''}
          {clearCrop ? ' · full screen' : crop ? ` · cropped to ${crop.width}×${crop.height}` : ''}
        </span>
      </div>
      {error && <p className="text-xs text-red-500">{error}</p>}
      {thumb && (
        <div className="relative inline-block max-w-full rounded overflow-hidden border border-gray-200">
          <img src={thumb} alt={target?.name ?? 'screen'} className="block max-h-48 w-auto" />
          {overlay && (
            <div
              className="absolute border-2 border-blue-500 bg-blue-500/20"
              style={overlay}
            />
          )}
        </div>
      )}
    </div>
  );
};

const AgentApprovalCard: React.FC<{
  calls: ApprovalCall[];
  onDecision: (approved: boolean) => void;
}> = ({ calls, onDecision }) => {
  const agentBuilds = calls.filter(c => c.name === 'create_agent' || c.name === 'edit_agent');
  const lifecycle = calls.filter(c => c.name === 'start_agent' || c.name === 'stop_agent');
  const targetSelect = calls.find(c => c.name === 'select_screen_target');
  const cropCalls = calls.filter(c => c.name === 'set_screen_crop');
  // Pair a crop with its target so the overlay can be drawn on the right thumbnail.
  const cropForTarget = cropCalls.find(c => !c.args.clear)?.args;
  const showScreenCapture = !!targetSelect || cropCalls.length > 0;

  return (
    <div className="w-full bg-gradient-to-r from-purple-50 to-indigo-50 border border-purple-200 rounded-lg p-4 md:p-6">
      <div className="flex items-center justify-center mb-4">
        <Users className="h-6 w-6 text-purple-600 mr-2" />
        <h3 className="text-lg font-bold text-purple-800">
          {agentBuilds.length > 0
            ? `Review ${agentBuilds.length} proposed agent${agentBuilds.length === 1 ? '' : 's'}`
            : 'Confirm action'}
        </h3>
      </div>

      {agentBuilds.length > 0 && (
        <div className="space-y-4 mb-4">
          {agentBuilds.map((c, index) => (
            <div key={c.id} className="bg-white border border-gray-200 rounded-lg p-4">
              <div className="flex items-center mb-3">
                <div className="w-8 h-8 bg-purple-100 rounded-full flex items-center justify-center mr-3">
                  <span className="text-purple-600 font-bold text-sm">{index + 1}</span>
                </div>
                <div>
                  <h4 className="font-semibold text-gray-900">{c.args.name || c.args.id}</h4>
                  <p className="text-sm text-gray-600">{c.args.description}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {c.name === 'edit_agent' ? 'edit' : 'create'} · {c.args.model_name} · every {c.args.loop_interval_seconds ?? 30}s
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                <div>
                  <h5 className="font-medium text-gray-700 mb-2">System Prompt:</h5>
                  <div className="bg-gray-50 border rounded p-2 max-h-24 overflow-y-auto">
                    <code className="text-gray-600 whitespace-pre-wrap text-xs">{c.args.system_prompt}</code>
                  </div>
                </div>
                <div>
                  <h5 className="font-medium text-gray-700 mb-2">Code:</h5>
                  <div className="bg-gray-50 border rounded p-2 max-h-24 overflow-y-auto">
                    <code className="text-gray-600 whitespace-pre-wrap text-xs">{c.args.code}</code>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showScreenCapture && (
        <div className="space-y-2 mb-4">
          {targetSelect ? (
            <ScreenCaptureApproval
              targetId={targetSelect.args.target_id}
              crop={cropForTarget ? { x: cropForTarget.x, y: cropForTarget.y, width: cropForTarget.width, height: cropForTarget.height } : undefined}
            />
          ) : (
            // Crop without a target in the same batch (e.g. re-cropping a running agent).
            cropCalls.map(c => (
              <div key={c.id} className="bg-white border border-gray-200 rounded-lg p-3 flex items-center">
                <Monitor className="h-4 w-4 text-blue-600 mr-2" />
                <span className="text-sm text-gray-800">
                  {c.args.clear
                    ? <>Remove screen crop for <code className="font-mono">{c.args.agent_id}</code></>
                    : <>Crop <code className="font-mono">{c.args.agent_id}</code> to {c.args.width}×{c.args.height} at ({c.args.x}, {c.args.y})</>}
                </span>
              </div>
            ))
          )}
        </div>
      )}

      {lifecycle.length > 0 && (
        <div className="space-y-2 mb-4">
          {lifecycle.map(c => (
            <div key={c.id} className="bg-white border border-gray-200 rounded-lg p-3 flex items-center">
              {c.name === 'start_agent'
                ? <Play className="h-4 w-4 text-green-600 mr-2" />
                : <Square className="h-4 w-4 text-red-500 mr-2" />}
              <span className="text-sm text-gray-800">
                {c.name === 'start_agent' ? 'Start' : 'Stop'} agent <code className="font-mono">{c.args.id}</code>
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center justify-center gap-3">
        <button
          onClick={() => onDecision(false)}
          className="px-5 py-2.5 text-base bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium transition-colors"
        >
          Deny
        </button>
        <button
          onClick={() => onDecision(true)}
          className="px-6 py-2.5 text-base bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-lg hover:from-purple-700 hover:to-indigo-700 font-medium transition-colors flex items-center shadow-lg"
        >
          <Save className="h-5 w-5 mr-2" />
          Approve
        </button>
      </div>
    </div>
  );
};

// ===================================================================================
//  MAIN COMPONENT
// ===================================================================================
const MCP: React.FC<MCPProps> = ({
  isAuthenticated,
  isUsingObServer,
  onUpgrade,
  onRefresh,
  onSaveComplete,
  initialMessage,
  heightClass = 'h-[350px] md:h-[450px]',
}) => {
  // Conversation state lives in the app-level MCPProvider, so it's shared across every
  // place the MCP UI is opened (GetStarted, the modal) and survives this component
  // unmounting mid-run.
  const {
    messages,
    streamingText,
    isRunning,
    toolStatus,
    pendingApproval,
    resolveInteraction,
    subscribeMutation,
    stop,
    send,
  } = useMCPContext();

  // Each screen reacts to agent mutations in its own way; register this screen's reaction.
  useEffect(() => subscribeMutation((toolName) => {
    onRefresh?.();
    // Mirror the old "Save → close modal" UX once an agent is actually persisted.
    if (toolName === 'create_agent' || toolName === 'edit_agent') {
      onSaveComplete?.();
    }
  }), [subscribeMutation, onRefresh, onSaveComplete]);

  const [userInput, setUserInput] = useState('');
  const [previewImages, setPreviewImages] = useState<string[]>([]);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const hasInitialMessageSet = useRef(false);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingText, pendingApproval]);

  useEffect(() => {
    if (initialMessage && !hasInitialMessageSet.current) {
      hasInitialMessageSet.current = true;
      setUserInput(initialMessage);
    }
  }, [initialMessage]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((!userInput.trim() && previewImages.length === 0) || isRunning) return;
    const text = userInput.trim() || `[${previewImages.length} image${previewImages.length > 1 ? 's' : ''}]`;
    const images = previewImages;
    setUserInput('');
    setPreviewImages([]);
    await send(text, images.length > 0 ? images : undefined);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    files.forEach(file => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        const base64 = result.split(',')[1] || result;
        setPreviewImages(prev => [...prev, base64]);
      };
      reader.readAsDataURL(file);
    });
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleApproval = (approved: boolean) => {
    if (!pendingApproval) return;
    // onSaveComplete / onRefresh fire from useMCP's onAgentMutated once the save resolves.
    resolveInteraction(pendingApproval.batchId, { approved });
  };

  const renderMessage = (msg: WireMessage, idx: number) => {
    // Hide internal tool-result messages and the runner's image-injection user message.
    if (msg.role === 'tool') return null;
    if (msg.role === 'user' && Array.isArray(msg.content)
      && msg.content[0]?.text?.startsWith('Images from the tool result')) {
      return null;
    }

    if (msg.role === 'user') {
      const text = typeof msg.content === 'string'
        ? msg.content
        : (msg.content.find((p: any) => p.type === 'text')?.text ?? '');
      const imageParts = Array.isArray(msg.content)
        ? msg.content.filter((p: any) => p.type === 'image_url')
        : [];
      return (
        <div key={idx} className="flex justify-end">
          <div className="max-w-xs md:max-w-md p-2 md:p-3 rounded-lg text-sm md:text-base bg-purple-600 text-white">
            {text && <p className="whitespace-pre-wrap">{text}</p>}
            {imageParts.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {imageParts.map((p: any, i: number) => (
                  <img key={i} src={p.image_url.url} alt="" className="max-w-[120px] h-auto rounded-lg" />
                ))}
              </div>
            )}
          </div>
        </div>
      );
    }

    // assistant
    const content = typeof msg.content === 'string' ? msg.content : '';
    const toolCalls = msg.tool_calls || [];
    if (!content && toolCalls.length === 0) return null;
    return (
      <div key={idx} className="flex justify-start">
        <div className="max-w-xs md:max-w-md p-2 md:p-3 rounded-lg text-sm md:text-base bg-gradient-to-br from-purple-50 to-indigo-50 text-gray-800 shadow-sm">
          {content && <Markdown text={content} />}
          {toolCalls.length > 0 && (
            <div className="flex flex-wrap">
              {toolCalls.map(tc => (
                <ToolChip key={tc.id} call={tc} status={toolStatus.get(tc.id)} />
              ))}
            </div>
          )}
          {toolCalls.some(tc => tc.function.name === 'download_model') && <DownloadModelProgress />}
          {toolCalls
            .filter(tc => tc.function.name === 'check_whitelist')
            .map(tc => {
              // The check_whitelist executor BLOCKS while the number isn't whitelisted, so the
              // pill is shown exactly while that call is in flight ('running'); it unmounts on
              // its own once the gate resolves and the run continues to start_agent. Args carry
              // the number/channel (no result exists yet while it's still waiting).
              const st = toolStatus.get(tc.id);
              if (st?.status !== 'running') return null;
              const phoneNumber: string | undefined = st.args?.phone_number;
              if (!phoneNumber) return null;
              const channel = st.args?.channel as WhitelistChannel | undefined;
              return <WhitelistInline key={tc.id} phoneNumber={phoneNumber} channel={channel} />;
            })}
        </div>
      </div>
    );
  };

  const isInputDisabled = isRunning || (isUsingObServer && !isAuthenticated) || !!pendingApproval;
  const isSendDisabled = isInputDisabled || (!userInput.trim() && previewImages.length === 0);

  const getPlaceholder = () => {
    if (isUsingObServer && !isAuthenticated) return 'Enable Ob-Server and log in to use MCP';
    if (pendingApproval) return 'Approve or deny the proposed action above…';
    return 'Describe the agent you want to build…';
  };

  return (
    <div className={`flex flex-col ${heightClass} bg-white rounded-lg border border-purple-200 relative`}>
      {/* Chat Messages */}
      <div className="flex-1 p-3 md:p-4 space-y-3 md:space-y-4 overflow-y-auto">
        {messages.length === 0 && (
          <div className="flex justify-start">
            <div className="max-w-xs md:max-w-md p-2 md:p-3 rounded-lg text-sm md:text-base bg-gradient-to-br from-purple-50 to-indigo-50 text-gray-800 shadow-sm">
              <Markdown text={`Hi! I'm **Observer's MCP**. I can build, edit, run, and inspect your agents.\n\nTry: *"Create an agent that emails me when the Observer logo is on screen"* or *"What has my screen_watcher agent done recently?"*`} />
            </div>
          </div>
        )}

        {messages.map(renderMessage)}

        {streamingText && (
          <div className="flex justify-start">
            <div className="max-w-xs md:max-w-md p-2 md:p-3 rounded-lg text-sm md:text-base bg-gradient-to-br from-purple-50 to-indigo-50 text-gray-800 shadow-sm animate-pulse">
              <Markdown text={streamingText} />
            </div>
          </div>
        )}

        {pendingApproval && (
          <div className="flex justify-start w-full">
            <AgentApprovalCard calls={pendingApproval.calls} onDecision={handleApproval} />
          </div>
        )}

        {isRunning && !streamingText && !pendingApproval && (
          <div className="flex justify-start">
            <div className="bg-gradient-to-br from-purple-50 to-indigo-50 text-gray-800 p-2 md:p-3 rounded-lg inline-flex items-center shadow-sm">
              <Loader2 className="h-4 w-4 md:h-5 md:w-5 animate-spin" />
            </div>
          </div>
        )}

        <div ref={chatEndRef} />
      </div>

      {/* Image previews */}
      {previewImages.length > 0 && (
        <div className="px-3 pb-1 flex flex-wrap gap-2">
          {previewImages.map((img, i) => (
            <div key={i} className="relative">
              <img src={`data:image/png;base64,${img}`} alt="" className="h-12 w-12 object-cover rounded border" />
              <button
                onClick={() => setPreviewImages(prev => prev.filter((_, idx) => idx !== i))}
                className="absolute -top-1.5 -right-1.5 bg-gray-700 text-white rounded-full p-0.5"
              >
                <XCircle className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Input Area */}
      <div className="p-2 border-t border-purple-200 bg-white/80 backdrop-blur-sm rounded-b-lg">
        <form onSubmit={handleSubmit} className="flex items-center gap-2">
          <input
            type="text"
            value={userInput}
            onChange={(e) => setUserInput(e.target.value)}
            placeholder={getPlaceholder()}
            disabled={isInputDisabled}
            className="flex-1 p-2 md:p-3 border border-purple-300 rounded-lg text-sm md:text-base text-gray-700 disabled:bg-gray-100 disabled:cursor-not-allowed focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
          />

          <input ref={fileInputRef} type="file" accept="image/*" multiple onChange={handleFileChange} className="hidden" />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isInputDisabled}
            className="p-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 disabled:bg-gray-300 transition-colors flex items-center"
            title="Upload Image"
          >
            <Plus className="h-5 w-5" />
          </button>

          {isRunning ? (
            <button
              type="button"
              onClick={stop}
              className="p-2 md:p-3 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors flex items-center flex-shrink-0"
              title="Stop"
            >
              <Square className="h-4 w-4" fill="currentColor" />
            </button>
          ) : (
            <button
              type="submit"
              disabled={isSendDisabled}
              className="p-2 md:p-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:bg-gray-300 transition-colors flex items-center flex-shrink-0"
              title="Send"
            >
              <Send className="h-4 w-4" />
            </button>
          )}
        </form>
      </div>
    </div>
  );
};

export default MCP;
