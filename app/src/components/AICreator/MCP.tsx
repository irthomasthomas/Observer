// src/components/AICreator/MCP.tsx
//
// Native tool-calling agent creator. Replaces MultiAgentCreator: instead of brittle
// $$$/%%%/&&& text delimiters, the model drives agent creation/management through real
// OpenAI function calls (see src/mcp/). This component is pure UI over the useMCP hook.

import React, { useState, useRef, useEffect } from 'react';
import { Send, Loader2, Plus, CheckCircle2, XCircle, Loader, Square, Download, Cpu, Sparkles, StopCircle, Mic, Trash2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import type { TokenProvider } from '@utils/main_loop';
import { type ToolStatusEntry } from '../../mcp/useMCP';
import { useMCPContext } from '../../mcp/MCPContext';
import type { WireMessage, ToolCall } from '../../mcp/types';
import { Logger, type WhitelistChannel } from '@utils/logging';
import { StreamManager } from '@utils/streamManager';
import { useSubscriberText } from '@hooks/useTranscriptionState';
import WhitelistInline from '@components/whitelist/WhitelistInline';
import { SensorSettings } from '@utils/settings';
import { isTauri } from '@utils/platform';
import { GemmaModelManager } from '@utils/localLlm/GemmaModelManager';
import { NativeLlmManager } from '@utils/localLlm/NativeLlmManager';
import type { GemmaModelState, NativeModelState } from '@utils/localLlm/types';
import { ModelManager, type Model } from '@utils/ModelManager';
import RecipeMini from './RecipeMini';

// Synthetic owner id for voice dictation. Mirrors SettingsTab's TEST_AGENT_ID pattern:
// StreamManager treats it like any agent, so transcription routes through the same
// TranscriptionRouter path and honors the user's global mode (cloud / local / self-hosted)
// for free — changing the mode in Settings changes dictation too.
const MCP_MIC_ID = 'mcp-creator-mic';

interface MCPProps {
  getToken: TokenProvider;
  isAuthenticated: boolean;
  isUsingObServer: boolean;
  onSignIn?: () => void;
  onSwitchToObServer?: () => void;
  onUpgrade?: () => void;
  onRefresh?: () => void;
  onSaveComplete?: () => void;
  /** Hide the built-in generic suggestion chips (e.g. when the RecipeBuilder hero is shown above). */
  hideSuggestions?: boolean;
  initialMessage?: string;
  /** Opens the full "When... Then..." recipe builder modal; renders a teaser chip when set. */
  onOpenRecipe?: () => void;
  /** Tailwind height classes for the chat container. Defaults to the hero/sheet sizing. */
  heightClass?: string;
  /** When false, renders unboxed/full-bleed (no bordered card, rounder pill input) for a
   *  permanently docked surface like the Observer tab. Defaults to true so existing callers
   *  (GetStarted, MCPPanel) are visually unaffected. */
  boxed?: boolean;
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
    case 'done': return <CheckCircle2 className="h-3 w-3 text-green-600" />;
    case 'error': return <XCircle className="h-3 w-3 text-red-500" />;
    case 'running': return <Loader className="h-3 w-3 text-gray-400 animate-spin" />;
    default: return <Loader className="h-3 w-3 text-gray-400 animate-spin" />;
  }
};

// Deliberately small and muted — a status caption, not a message. Tool calls aren't
// conversation content, so they shouldn't read like a chat bubble the user is meant to parse.
const ToolChip: React.FC<{ call: ToolCall; status?: ToolStatusEntry }> = ({ call, status }) => (
  <div className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-black/5 text-[10px] font-medium text-gray-500 mr-1 mt-1">
    <StatusIcon status={status?.status} />
    <span className="font-mono">{call.function.name}</span>
  </div>
);

// How long a `check_whitelist` call must stay 'running' before we show the QR pill. The
// executor's very first poll is often already a hit (number was whitelisted earlier), which
// resolves in one network round-trip — without this grace period the pill would mount then
// immediately unmount, flashing the QR codes for no reason.
const WHITELIST_PILL_DELAY_MS = 600;

/** Gates WhitelistInline behind WHITELIST_PILL_DELAY_MS of sustained 'running' status. */
const CheckWhitelistGate: React.FC<{
  toolCallId: string;
  status?: ToolStatusEntry;
  onCancel: () => void;
}> = ({ toolCallId, status, onCancel }) => {
  const isRunning = status?.status === 'running';
  const [showPill, setShowPill] = useState(false);

  useEffect(() => {
    if (!isRunning) {
      setShowPill(false);
      return;
    }
    const timer = setTimeout(() => setShowPill(true), WHITELIST_PILL_DELAY_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRunning, toolCallId]);

  if (!showPill) return null;
  const phoneNumber: string | undefined = status?.args?.phone_number;
  if (!phoneNumber) return null;
  const channel = status?.args?.channel as WhitelistChannel | undefined;
  // Show the persisted golden-path word-key code (same one ask_user_info's modal uses)
  // instead of a canned-greeting QR — the backend ties whichever number sends this code
  // to the whitelist, so scanning it from the user's own phone whitelists phoneNumber too.
  const code = SensorSettings.ensureWhitelistCode();
  return <WhitelistInline phoneNumber={code} channel={channel} onCancel={onCancel} mode="code" />;
};

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
 * Subscribes directly to the local-model managers (the same state the Models tab renders) to show
 * live progress for the in-flight `download_model` tool call. Renders nothing when idle.
 */
const DownloadShell: React.FC<{ icon: React.ReactNode; children: React.ReactNode; onCancel?: () => void }> = ({ icon, children, onCancel }) => (
  <div className="mt-2 w-full max-w-md p-3 rounded-lg border border-purple-200 bg-white/70">
    <div className="flex items-center gap-2 mb-2 text-xs font-semibold text-gray-700">
      {icon}<span>On-device model</span>
      {onCancel && (
        <button onClick={onCancel} className="ml-auto flex items-center gap-1 text-red-500 hover:text-red-700 font-medium">
          <StopCircle size={11} /> Cancel
        </button>
      )}
    </div>
    {children}
  </div>
);

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

  if (tauri) {
    const { status, modelId, downloadProgress, downloadedBytes, totalBytes, error } = native;
    if (status === 'downloading') {
      return (
        <DownloadShell icon={<Download className="h-4 w-4 text-purple-600 animate-bounce" />} onCancel={() => NativeLlmManager.getInstance().cancelDownload()}>
          <div className="flex justify-between text-[11px] text-gray-600 mb-1">
            <span className="truncate max-w-[60%]">{modelId ?? 'model'}.gguf</span>
            <span className="font-medium">
              {totalBytes > 0 ? `${formatBytes(downloadedBytes)} / ${formatBytes(totalBytes)}` : `${Math.round(downloadProgress)}%`}
            </span>
          </div>
          <Bar pct={downloadProgress} />
        </DownloadShell>
      );
    }
    if (status === 'loading') {
      return (
        <DownloadShell icon={<Cpu className="h-4 w-4 text-purple-600 animate-pulse" />} onCancel={() => NativeLlmManager.getInstance().unloadModel()}>
          <p className="text-xs text-gray-600">Loading model into memory…</p>
        </DownloadShell>
      );
    }
    if (status === 'loaded') {
      return <DownloadShell icon={<CheckCircle2 className="h-4 w-4 text-green-600" />}><p className="text-xs text-gray-600">Model ready on your device.</p></DownloadShell>;
    }
    if (status === 'error' && error) {
      return <DownloadShell icon={<XCircle className="h-4 w-4 text-red-500" />}><p className="text-xs text-red-600">{error}</p></DownloadShell>;
    }
    return null;
  }

  // transformers.js (browser): one shot that both downloads and loads
  if (gemma.status === 'loading') {
    return (
      <DownloadShell icon={<Sparkles className="h-4 w-4 text-purple-600 animate-pulse" />} onCancel={() => GemmaModelManager.getInstance().unloadModel()}>
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
      </DownloadShell>
    );
  }
  if (gemma.status === 'loaded') {
    return <DownloadShell icon={<CheckCircle2 className="h-4 w-4 text-green-600" />}><p className="text-xs text-gray-600">Model ready in your browser.</p></DownloadShell>;
  }
  if (gemma.status === 'error' && gemma.error) {
    return <DownloadShell icon={<XCircle className="h-4 w-4 text-red-500" />}><p className="text-xs text-red-600">{gemma.error}</p></DownloadShell>;
  }
  return null;
};

// ===================================================================================
//  MAIN COMPONENT
// ===================================================================================
const MCP: React.FC<MCPProps> = ({
  isAuthenticated,
  isUsingObServer,
  onRefresh,
  onSaveComplete,
  hideSuggestions,
  initialMessage,
  onOpenRecipe,
  heightClass = 'h-[350px] md:h-[450px]',
  boxed = true,
}) => {
  // Conversation state lives in the app-level MCPProvider, so it's shared across every
  // place the MCP UI is opened (GetStarted, the modal) and survives this component
  // unmounting mid-run.
  const {
    messages,
    streamingText,
    isRunning,
    toolStatus,
    subscribeMutation,
    stop,
    send,
    clear,
    modelName,
    setModelName,
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

  // --- Voice dictation -------------------------------------------------------
  // Reuses the exact transcription path agents use (StreamManager → TranscriptionRouter),
  // so it automatically honors the transcription mode chosen in Settings. The live
  // transcript streams into the input on top of whatever the user already typed.
  const { fullText: micTranscript } = useSubscriberText(MCP_MIC_ID, 'microphone');
  const [isRecording, setIsRecording] = useState(false);
  const [micStarting, setMicStarting] = useState(false);
  const micBaseRef = useRef('');
  // Bumped on every stop so an in-flight start (e.g. a slow local model load) knows it was
  // cancelled and tears down instead of flipping us back into recording.
  const micGenRef = useRef(0);

  // Mirror the streaming transcript into the input while recording.
  useEffect(() => {
    if (!isRecording) return;
    const base = micBaseRef.current;
    setUserInput(base && micTranscript ? `${base} ${micTranscript}` : base + micTranscript);
  }, [micTranscript, isRecording]);

  // Always tear the mic down on unmount so closing the modal mid-dictation can't leave a
  // hot mic / open WebSocket behind. Release + destroy are safe to call when already idle.
  useEffect(() => () => {
    StreamManager.releaseStreamsForAgent(MCP_MIC_ID);
    StreamManager.destroySubscribersForAgent(MCP_MIC_ID);
  }, []);

  const stopMic = () => {
    // Cancel any in-flight start, then flip the flag first so the reflect effect won't
    // overwrite the dictated text when the released service clears its subscriber.
    micGenRef.current++;
    setIsRecording(false);
    setMicStarting(false);
    StreamManager.releaseStreamsForAgent(MCP_MIC_ID);
    StreamManager.destroySubscribersForAgent(MCP_MIC_ID);
  };

  const startMic = async () => {
    micBaseRef.current = userInput.trim();
    setMicStarting(true);
    const gen = ++micGenRef.current;
    try {
      // Acquires the mic, starts the mode-appropriate service, wires PCM capture, and
      // creates our subscriber — all keyed on MCP_MIC_ID.
      await StreamManager.requestStreamsForAgent(MCP_MIC_ID, ['microphone']);
      // Stopped (or a message was sent) while we were still spinning up: tear down what we
      // just acquired instead of resurrecting recording.
      if (micGenRef.current !== gen) {
        StreamManager.releaseStreamsForAgent(MCP_MIC_ID);
        StreamManager.destroySubscribersForAgent(MCP_MIC_ID);
        return;
      }
      setIsRecording(true);
    } catch (e) {
      Logger.error('MCP', `Voice dictation failed to start: ${e}`);
      stopMic();
    } finally {
      if (micGenRef.current === gen) setMicStarting(false);
    }
  };

  const getCustomServerModels = (): Model[] =>
    ModelManager.getInstance().listModels().models.filter(m =>
      m.server !== ModelManager.BROWSER_LOCAL &&
      m.server !== ModelManager.LLAMA_CPP_LOCAL &&
      m.server !== ModelManager.SKIP_MODEL &&
      !m.server.includes('api.observer-ai.com')
    );

  const [customModels, setCustomModels] = useState<Model[]>(getCustomServerModels);

  useEffect(() => ModelManager.getInstance().onModelsChange(() => {
    setCustomModels(getCustomServerModels());
  }), []);

  useEffect(() => {
    if (customModels.length === 0) return;
    const stillAvailable = customModels.some(m => m.name === modelName);
    if (!stillAvailable && modelName !== 'gemini-2.5-flash-lite-free') {
      setModelName('gemini-2.5-flash-lite-free');
    }
  }, [customModels, modelName, setModelName]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingText]);

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
    // Stop dictation so the reflect effect can't re-populate the box we're about to clear.
    stopMic();
    micBaseRef.current = '';
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
          <div className={userBubbleClass}>
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
      <div key={idx} className="flex flex-col items-start">
        {content && <div className={assistantBubbleClass}><Markdown text={content} /></div>}
        {toolCalls.length > 0 && (
          <div className="flex flex-wrap mt-1">
            {toolCalls.map(tc => (
              <ToolChip key={tc.id} call={tc} status={toolStatus.get(tc.id)} />
            ))}
          </div>
        )}
        {toolCalls.some(tc => tc.function.name === 'download_model') && <DownloadModelProgress />}
        {toolCalls
          .filter(tc => tc.function.name === 'check_whitelist')
          .map(tc => (
            <CheckWhitelistGate key={tc.id} toolCallId={tc.id} status={toolStatus.get(tc.id)} onCancel={stop} />
          ))}
      </div>
    );
  };

  const SUGGESTIONS = [
    'Call me when my download is finished',
    'WhatsApp me when my video finishes rendering',
    'Log my screen activity every hour',
    'Notify me when my battery is low',
  ];

  const isInputDisabled = isRunning || (isUsingObServer && !isAuthenticated);
  const isSendDisabled = isInputDisabled || (!userInput.trim() && previewImages.length === 0);
  const showSuggestions = !hideSuggestions && messages.length === 0 && !isRunning;

  const getPlaceholder = () => {
    if (isUsingObServer && !isAuthenticated) return 'Enable Ob-Server and log in to use Observer';
    return 'Describe what you want monitored…';
  };

  // "Girth" pass for the unboxed (boxed=false) surface: rounder, roomier bubbles and a plain
  // background instead of the default boxed card's tighter, bordered look. Existing callers
  // never pass boxed=false, so their rendering is untouched.
  const assistantBubbleClass = boxed
    ? 'max-w-xs md:max-w-md p-2 md:p-3 rounded-lg text-sm md:text-base bg-gradient-to-br from-purple-50 to-indigo-50 text-gray-800 shadow-sm'
    : 'max-w-md md:max-w-2xl p-3 md:p-4 rounded-2xl text-sm md:text-base bg-gray-100 text-gray-800';
  const userBubbleClass = boxed
    ? 'max-w-xs md:max-w-md p-2 md:p-3 rounded-lg text-sm md:text-base bg-purple-600 text-white'
    : 'max-w-md md:max-w-2xl p-3 md:p-4 rounded-2xl text-sm md:text-base bg-purple-600 text-white';

  return (
    <div className={`flex flex-col ${heightClass} relative ${boxed ? 'bg-white rounded-lg border border-purple-200' : 'bg-transparent'}`}>
      {!boxed && messages.length > 0 && (
        <button
          onClick={clear}
          disabled={isRunning}
          title="Clear conversation"
          className="absolute top-2 right-2 z-10 inline-flex items-center gap-1 px-2 py-1.5 text-xs text-gray-400 rounded-full bg-white/80 hover:bg-gray-100 hover:text-gray-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      )}
      {/* Chat Messages */}
      <div className={boxed ? 'flex-1 p-3 md:p-4 space-y-3 md:space-y-4 overflow-y-auto' : 'flex-1 p-4 md:p-6 space-y-3 md:space-y-4 overflow-y-auto'}>
        {messages.length === 0 && (
          <div className="flex justify-start">
            <div className={assistantBubbleClass}>
              <Markdown text={`Hi! I'm **Observer**! I can create and run micro-agents. `} />
            </div>
          </div>
        )}

        {messages.map(renderMessage)}

        {streamingText && (
          <div className="flex justify-start">
            <div className={`${assistantBubbleClass} animate-pulse`}>
              <Markdown text={streamingText} />
            </div>
          </div>
        )}

        {isRunning && !streamingText && (
          <div className="flex justify-start">
            <div className={`text-gray-800 p-2 md:p-3 inline-flex items-center ${boxed ? 'bg-gradient-to-br from-purple-50 to-indigo-50 rounded-lg shadow-sm' : 'bg-gray-100 rounded-2xl'}`}>
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

      {/* Suggestion chips */}
      {showSuggestions && (
        <div className="px-3 pt-2 pb-1 flex flex-wrap justify-center gap-2">
          {onOpenRecipe && <RecipeMini onClick={onOpenRecipe} />}
          {SUGGESTIONS.map(s => (
            <button
              key={s}
              type="button"
              onClick={() => send(s)}
              className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-gray-500 hover:text-gray-700 hover:border-gray-300 transition-colors whitespace-nowrap"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {/* Input Area */}
      <div className={boxed ? 'p-2 border-t border-purple-200 bg-white/80 backdrop-blur-sm rounded-b-lg' : 'p-3 md:p-4'}>
        {customModels.length > 0 && (
          <div className="flex items-center gap-1.5 px-1 pb-1.5">
            <Cpu className="h-3.5 w-3.5 text-purple-400 flex-shrink-0" />
            <select
              value={modelName}
              onChange={e => setModelName(e.target.value)}
              disabled={isRunning}
              className="flex-1 text-xs text-gray-600 bg-transparent border-0 focus:ring-0 focus:outline-none cursor-pointer disabled:cursor-not-allowed truncate"
            >
              <option value="gemini-2.5-flash-lite-free">Default (cloud)</option>
              {customModels.map(m => <option key={m.name} value={m.name}>{m.name}</option>)}
            </select>
          </div>
        )}
        {(isRecording || micStarting) && (
          <div className="flex items-center gap-2 px-1 pb-1.5 text-xs font-medium text-red-600">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
            </span>
            <span>{micStarting ? 'Starting microphone…' : 'Listening… tap the mic to stop'}</span>
          </div>
        )}
        <form onSubmit={handleSubmit} className="flex items-center gap-1.5 md:gap-2">
          <input
            type="text"
            value={userInput}
            onChange={(e) => setUserInput(e.target.value)}
            placeholder={getPlaceholder()}
            disabled={isInputDisabled}
            className={`flex-1 min-w-0 text-sm md:text-base text-gray-700 disabled:bg-gray-100 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
              boxed
                ? 'p-2 md:p-3 border border-gray-200 rounded-lg'
                : 'p-3 md:p-4 border border-gray-200 rounded-full bg-white shadow-sm'
            }`}
          />

          <input ref={fileInputRef} type="file" accept="image/*" multiple onChange={handleFileChange} className="hidden" />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isInputDisabled}
            className={`bg-purple-600 text-white hover:bg-purple-700 disabled:bg-gray-300 transition-colors flex items-center flex-shrink-0 ${boxed ? 'p-2 md:p-3 rounded-md' : 'p-3 md:p-4 rounded-full'}`}
            title="Upload Image"
          >
            <Plus className="h-5 w-5" />
          </button>

          <button
            type="button"
            onClick={() => (isRecording ? stopMic() : startMic())}
            disabled={micStarting || (!isRecording && isInputDisabled)}
            className={`flex items-center justify-center flex-shrink-0 transition-colors ${boxed ? 'p-2 md:p-3 rounded-lg' : 'p-3 md:p-4 rounded-full'} ${
              isRecording
                ? 'bg-red-600 text-white hover:bg-red-700 animate-pulse'
                : 'bg-purple-600 text-white hover:bg-purple-700 disabled:bg-gray-300 disabled:cursor-not-allowed'
            }`}
            title={isRecording ? 'Stop voice input' : 'Speak to fill the message'}
            aria-label={isRecording ? 'Stop voice input' : 'Start voice input'}
          >
            {micStarting
              ? <Loader2 className="h-5 w-5 animate-spin" />
              : <Mic className="h-5 w-5" />}
          </button>

          {isRunning ? (
            <button
              type="button"
              onClick={stop}
              className={`bg-red-600 text-white hover:bg-red-700 transition-colors flex items-center flex-shrink-0 ${boxed ? 'p-2 md:p-3 rounded-lg' : 'p-3 md:p-4 rounded-full'}`}
              title="Stop"
            >
              <Square className="h-4 w-4" fill="currentColor" />
            </button>
          ) : (
            <button
              type="submit"
              disabled={isSendDisabled}
              className={`bg-purple-600 text-white hover:bg-purple-700 disabled:bg-gray-300 transition-colors flex items-center flex-shrink-0 ${boxed ? 'p-2 md:p-3 rounded-lg' : 'p-3 md:p-4 rounded-full'}`}
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
