import React, {
  Suspense, useState, useEffect, useRef,
} from 'react';
import Modal from '@components/EditAgent/Modal';
import { CompleteAgent, importAgentsFromFiles } from '@utils/agent_database';
import {
  Download,
  ChevronDown, ChevronUp,
  Eye,
  ScanText,
  Play,
  X,
  Zap,
  Monitor,
  Brain,
  Save,
  Activity,
  Edit3,
  Tag,
  Server,
  Terminal,
  FileUp,
  Clipboard,
  Mic,
  Camera,
  AlertTriangle,
  Volume2,
  Blend,
  Images
} from 'lucide-react';
import { Logger } from '@utils/logging';
import JupyterServerModal from '@components/JupyterServerModal';
import { useEditAgentModalLogic } from './useEditAgentModalLogic';

import LazyCodeMirror from '@uiw/react-codemirror';
import { javascript } from '@codemirror/lang-javascript';
import { python } from '@codemirror/lang-python';
import { vscodeDark } from '@uiw/codemirror-theme-vscode';

import type { TokenProvider } from '@utils/main_loop';

/* ───────────────────────── props ───────────────────────── */
interface EditAgentModalProps {
  isOpen: boolean;
  onClose: () => void;
  createMode: boolean;
  agent?: CompleteAgent;
  code?: string;
  onSave: (agent: CompleteAgent, code: string) => void;
  onImportComplete?: () => Promise<void>;
  setError?: (message: string | null) => void;
  getToken: TokenProvider;
  isProUser?: boolean;
}

// --- HELPER COMPONENTS (Unchanged) ---
interface MobileTabNavProps {
  activeTab: 'config' | 'prompt' | 'code';
  setActiveTab: (tab: 'config' | 'prompt' | 'code') => void;
}
const MobileTabNav: React.FC<MobileTabNavProps> = ({ activeTab, setActiveTab }) => {
  const tabs = [
    { id: 'config', label: 'Config', icon: Brain },
    { id: 'prompt', label: 'Prompt', icon: ScanText },
    { id: 'code', label: 'Code', icon: Zap },
  ] as const;

  return (
    <div className="md:hidden flex-shrink-0 flex border-b border-gray-200 bg-gray-50">
      {tabs.map(tab => (
        <button
          key={tab.id}
          onClick={() => setActiveTab(tab.id)}
          className={`flex-1 flex justify-center items-center p-3 text-sm font-medium transition-colors ${
            activeTab === tab.id
              ? 'border-b-2 border-indigo-600 text-indigo-600 bg-white'
              : 'text-gray-500 hover:bg-gray-100'
          }`}
        >
          <tab.icon size={16} className="mr-2" />
          {tab.label}
        </button>
      ))}
    </div>
  );
};

interface AccordionProps {
  title: string;
  icon: React.ElementType;
  children: React.ReactNode;
  rightContent?: React.ReactNode;
}
const Accordion: React.FC<AccordionProps> = ({ title, icon: Icon, children, rightContent }) => {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <div className="border border-gray-200 rounded-lg bg-white shadow-sm overflow-hidden">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex justify-between items-center p-4 text-left"
      >
        <div className="flex items-center">
          <Icon className="h-5 w-5 mr-3 text-indigo-600" />
          <h3 className="text-lg font-semibold text-indigo-700">{title}</h3>
        </div>
        <div className="flex items-center space-x-4">
            {rightContent && <div onClick={e => e.stopPropagation()}>{rightContent}</div>}
            {isOpen ? <ChevronUp className="h-5 w-5 text-gray-500" /> : <ChevronDown className="h-5 w-5 text-gray-500" />}
        </div>
      </button>
      {isOpen && <div className="p-4 border-t border-gray-200">{children}</div>}
    </div>
  );
};

// --- NEW HELPER COMPONENT: Sensor Button ---
const SensorButton = ({ icon: Icon, label, colorClass, onClick }: { icon: React.ElementType, label: string, colorClass?: string, onClick: () => void }) => (
  <button onClick={onClick} className={`flex-grow md:flex-grow-0 flex items-center justify-center space-x-2 px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors ${colorClass || 'text-gray-700'}`}>
    <Icon className="h-5 w-5" />
    <span className="text-sm font-medium">{label}</span>
  </button>
);


/* ───────────────────────── REFACTORED CONTENT COMPONENTS ───────────────────────── */

// --- Config Content Component ---
interface ConfigContentProps {
  name: string;
  setName: (name: string) => void;
  agentId: string;
  setAgentId: (id: string) => void;
  createMode: boolean;
  currentModel: string;
  setCurrentModel: (model: string) => void;
  isModelDropdownOpen: boolean;
  setIsModelDropdownOpen: (isOpen: boolean) => void;
  loadingModels: boolean;
  modelsError: string | null;
  // FIX: Changed `multimodal: boolean | undefined` to `multimodal?: boolean` to make it optional
  availableModels: { name: string; multimodal?: boolean; pro?: boolean; server: string; }[];
  loopInterval: number;
  setLoopInterval: (interval: number) => void;
  description: string;
  setDescription: (desc: string) => void;
  isProUser?: boolean;
}
const ConfigContent: React.FC<ConfigContentProps> = ({
  name, setName, agentId, setAgentId, createMode, currentModel, setCurrentModel,
  isModelDropdownOpen, setIsModelDropdownOpen, loadingModels, modelsError,
  availableModels, loopInterval, setLoopInterval, description, setDescription, isProUser = false,
}) => (
  <div className="p-4 bg-white rounded-lg border border-gray-200 shadow-sm">
    <h3 className="text-lg font-semibold text-indigo-700 mb-4 md:hidden">Agent Configuration</h3>
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
      <div>
        <label className="block text-gray-600 mb-1 flex items-center"><Edit3 size={14} className="mr-1.5 text-gray-500" />Name <span className="text-red-500">*</span></label>
        <input value={name} onChange={(e) => setName(e.target.value)} className="w-full p-2 bg-gray-100 border-gray-300 rounded-md" placeholder="Agent name" />
      </div>
      <div>
        <label className="block text-gray-600 mb-1 flex items-center"><Tag size={14} className="mr-1.5 text-gray-500" />ID {createMode && <span className="text-red-500">*</span>}</label>
        <input value={agentId} onChange={(e) => { if (createMode) { setAgentId(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '')); } }} readOnly={!createMode} className={`w-full p-2 bg-gray-100 border-gray-300 rounded-md ${createMode ? 'focus:ring-indigo-500' : 'opacity-70 cursor-not-allowed bg-gray-200'}`} placeholder="my_agent_id" />
      </div>
      <div>
        <label className="block text-gray-600 mb-1 flex items-center"><Brain size={14} className="mr-1.5 text-gray-500" />Model <span className="text-red-500">*</span></label>
        <div className="relative">
          <button onClick={() => setIsModelDropdownOpen(!isModelDropdownOpen)} disabled={loadingModels} className="w-full p-2 bg-gray-100 border-gray-300 rounded-md flex justify-between items-center text-left">
            <span className="truncate">{currentModel || (loadingModels ? 'Loading…' : 'Select model')}</span>
            <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform ${isModelDropdownOpen ? 'rotate-180' : ''}`} />
          </button>
          {isModelDropdownOpen && (
            <div className="absolute z-20 mt-1 w-full max-h-40 bg-white border border-gray-300 rounded-md shadow-lg overflow-y-auto">
              {loadingModels && <div className="px-3 py-2 text-sm text-gray-500">Loading…</div>}
              {modelsError && <div className="px-3 py-2 text-sm text-red-600">{modelsError}</div>}
              {!loadingModels && !modelsError && availableModels.length === 0 && <div className="px-3 py-2 text-sm text-gray-500">No models. Ensure Ollama is running.</div>}
              {!loadingModels && !modelsError && availableModels.map((m) => (
                  <button
                    key={m.name}
                    onClick={() => {
                      if (m.pro && !isProUser) return; // Prevent selection of pro models for non-pro users
                      setCurrentModel(m.name);
                      setIsModelDropdownOpen(false);
                    }}
                    disabled={m.pro && !isProUser}
                    className={`w-full text-left px-3 py-2 text-xs flex justify-between items-center ${
                      currentModel === m.name
                        ? 'bg-indigo-500 text-white'
                        : 'hover:bg-gray-100'
                    } ${m.pro && !isProUser ? 'opacity-50 select-none cursor-not-allowed' : ''}`}
                  >
                    <div className="flex items-center truncate pr-2">
                      <span className="truncate">{m.name}</span>
                      {m.pro && !isProUser && (
                        <span className="ml-2 text-xs font-bold text-purple-600 bg-purple-100 px-1.5 py-0.5 rounded-full">
                          PRO
                        </span>
                      )}
                    </div>
                    <div className="flex items-center space-x-1">
                      {m.multimodal && (
                        <span title="Supports Vision" className={`inline-flex items-center text-xs font-medium px-2 py-0.5 rounded ${currentModel === m.name ? 'bg-indigo-400 text-white' : 'text-purple-600 bg-purple-100'}`}>
                          <Eye className="h-3.5 w-3.5 mr-1" />
                          Vision
                        </span>
                      )}
                      {(m.server.includes('localhost') || m.server.includes('http://')) && (
                        <span title="Running Locally" className={`inline-flex items-center text-xs font-medium px-2 py-0.5 rounded ${currentModel === m.name ? 'bg-indigo-400 text-white' : 'text-gray-600 bg-gray-100'}`}>
                          <Server className="h-3.5 w-3.5 mr-1" />
                          Local
                        </span>
                      )}
                    </div>
                  </button>
              ))}
              {!loadingModels && (modelsError || availableModels.length === 0) && (
                <div className="p-2 border-t">
                  <input value={currentModel} onChange={(e) => setCurrentModel(e.target.value)} className="w-full p-1.5 bg-gray-100 border-gray-300 rounded-md text-xs" placeholder="Custom model name" onClick={(e) => e.stopPropagation()} />
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      <div>
        <label className="block text-gray-600 mb-1 flex items-center"><Activity size={14} className="mr-1.5 text-gray-500" />Loop (s)</label>
        <input type="number" min="1" step="1" value={loopInterval} onChange={(e) => setLoopInterval(Math.max(1, parseFloat(e.target.value) || 30))} className="w-full p-2 bg-gray-100 border-gray-300 rounded-md" />
      </div>
      <div className="col-span-1 sm:col-span-2">
        <label className="block text-gray-600 mb-1 flex items-center"><Edit3 size={14} className="mr-1.5 text-gray-500" />Description</label>
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4} className="w-full p-2 bg-gray-100 border-gray-300 rounded-md" placeholder="Optional description" />
      </div>
    </div>
  </div>
);

// --- Prompt Content Component (UPDATED) ---
interface PromptContentProps {
  systemPromptRef: React.RefObject<HTMLTextAreaElement>;
  systemPrompt: string;
  setSystemPrompt: (prompt: string) => void;
  insertSystemPromptText: (text: string) => void;
  availableAgentsForBlocks: { id: string; name: string }[];
  visionValidationError: string | null;
}
const PromptContent: React.FC<PromptContentProps> = ({
  systemPromptRef, systemPrompt, setSystemPrompt, insertSystemPromptText,
  availableAgentsForBlocks, visionValidationError
}) => (
  <div className="p-4 bg-white rounded-lg border border-gray-200 shadow-sm flex-grow flex flex-col h-full">
    <div className="flex justify-between items-center mb-3">
      <div>
        <h3 className="text-lg font-semibold text-indigo-700">System Prompt</h3>
        <p className="text-xs text-gray-500">Define instructions for the agent</p>
      </div>
    </div>
    <textarea ref={systemPromptRef} value={systemPrompt} onChange={(e) => setSystemPrompt(e.target.value)} rows={10} className="w-full flex-grow p-3 bg-gray-50 border border-gray-300 rounded-md font-mono text-sm" placeholder="Enter system prompt…" />

    {/* --- NEW: Static Sensor Button Grid --- */}
    <div className="mt-4">
        <label className="block text-xs text-gray-500 mb-2 font-medium">INSERT SENSOR:</label>
        <div className="flex flex-wrap gap-2">
            <SensorButton icon={ScanText} label="Screen Text" onClick={() => insertSystemPromptText('$SCREEN_OCR')} />
            <SensorButton icon={Monitor} label="Screen Image" onClick={() => insertSystemPromptText('$SCREEN_64')} colorClass="text-purple-600" />
            <SensorButton icon={Camera} label="Camera" onClick={() => insertSystemPromptText('$CAMERA')} colorClass="text-purple-600" />
            <SensorButton icon={Clipboard} label="Clipboard" onClick={() => insertSystemPromptText('$CLIPBOARD_TEXT')} />
            <SensorButton icon={Mic} label="Microphone" onClick={() => insertSystemPromptText('$MICROPHONE')} colorClass="text-slate-600" />
            <SensorButton icon={Volume2} label="Screen Audio" onClick={() => insertSystemPromptText('$SCREEN_AUDIO')} colorClass="text-slate-600" />
            <SensorButton icon={Blend} label="All Audio" onClick={() => insertSystemPromptText('$ALL_AUDIO')} colorClass="text-slate-600" />

            {availableAgentsForBlocks.map(agent => (
                <SensorButton
                  key={agent.id}
                  icon={Save}
                  label={`Memory: ${agent.name}`}
                  onClick={() => insertSystemPromptText(`$MEMORY@${agent.id}`)}
                  colorClass="text-green-600"
                />
            ))}
            
            {availableAgentsForBlocks.map(agent => (
                <SensorButton
                  key={`imemory-${agent.id}`}
                  icon={Images}
                  label={`Image Memory: ${agent.name}`}
                  onClick={() => insertSystemPromptText(`$IMEMORY@${agent.id}`)}
                  colorClass="text-purple-600"
                />
            ))}
        </div>
    </div>

    {visionValidationError && (
        <div className="mt-2 p-2 bg-yellow-50 border border-yellow-200 rounded-md flex items-center text-sm">
            <AlertTriangle className="h-5 w-5 text-yellow-500 mr-2 flex-shrink-0" />
            <p className="text-yellow-700">{visionValidationError}</p>
        </div>
    )}
  </div>
);

// --- Code Preview Content Component ---
interface CodePreviewContentProps {
  testResponseRef: React.RefObject<HTMLTextAreaElement>;
  testResponse: string;
  setTestResponse: (response: string) => void;
}
const CodePreviewContent: React.FC<CodePreviewContentProps> = ({ testResponseRef, testResponse, setTestResponse }) => (
  <textarea ref={testResponseRef} value={testResponse} onChange={(e) => setTestResponse(e.target.value)} rows={4} className="w-full p-2 bg-gray-50 border border-gray-300 rounded-md font-mono text-xs" placeholder="Output from Run Model…" />
);

// --- Logs Content Component ---
interface LogsContentProps {
  testOutput: string;
}
const LogsContent: React.FC<LogsContentProps> = ({ testOutput }) => (
  <pre className="w-full p-2 bg-gray-50 border border-gray-300 rounded-md font-mono text-xs h-32 overflow-y-auto">
    {testOutput ? (testOutput.replace(/\\n/g, '\n').split('\n').map((line, i) => (<div key={i} className={line.startsWith('ERROR:') ? 'text-red-500' : line.startsWith('SYSTEM:') ? 'text-blue-600' : line.startsWith('[DEBUG]') ? 'text-gray-500' : 'text-gray-700'}>{line}</div>))) : (<span className="text-gray-400">Logs will appear here…</span>)}
  </pre>
);

// --- Code Editor Content Component ---
interface CodeEditorContentProps {
  isPythonMode: boolean;
  setIsPythonMode: (isPython: boolean) => void;
  jupyterStatus: 'checking' | 'connected' | 'error' | 'disconnected' | 'unknown';
  setIsJupyterModalOpen: (isOpen: boolean) => void;
  handleRunCode: () => void;
  isRunningCode: boolean;
  testResponse: string;
  langSnippets: { name: string; code: string; description: string }[];
  insertCodeSnippet: (code: string) => void;
  editorIsLoaded: boolean;
  agentCode: string;
  setAgentCode: (code: string) => void;
  testOutput: string;
}
const CodeEditorContent: React.FC<CodeEditorContentProps> = ({
  isPythonMode, setIsPythonMode, jupyterStatus, setIsJupyterModalOpen,
  handleRunCode, isRunningCode, testResponse, langSnippets, insertCodeSnippet,
  editorIsLoaded, agentCode, setAgentCode, testOutput
}) => (
   <div className="p-4 bg-white rounded-lg border border-gray-200 shadow-sm flex-grow flex flex-col h-full">
      <div className="flex justify-between items-start mb-2">
          <h3 className="text-lg font-semibold text-indigo-700 mt-0.5">Agent Code</h3>
          <div className="flex items-center space-x-2">
            {isPythonMode && (
              <button onClick={() => setIsJupyterModalOpen(true)} className={`p-1.5 rounded border text-sm ${jupyterStatus === 'connected' ? 'bg-green-50 text-green-600 border-green-300' : jupyterStatus === 'error' ? 'bg-red-50 text-red-600 border-red-300' : jupyterStatus === 'checking' ? 'bg-gray-100 text-gray-500 border-gray-300 animate-pulse' : 'bg-gray-100 text-gray-500 border-gray-300'}`} title="Configure Jupyter Server"><Server size={16} /></button>
            )}
            <div className="flex border border-gray-300 rounded-md overflow-hidden text-sm">
              <button onClick={() => setIsPythonMode(false)} className={`px-3 py-1 ${!isPythonMode ? 'bg-yellow-500 text-white' : 'bg-gray-50 text-gray-600'}`}>JS</button>
              <button onClick={() => setIsPythonMode(true)} className={`px-3 py-1 ${isPythonMode ? 'bg-blue-500 text-white' : 'bg-gray-50 text-gray-600'}`}>Py</button>
            </div>
            <button onClick={handleRunCode} disabled={isRunningCode || !testResponse} className={`px-3 py-1.5 rounded-md flex items-center text-sm text-white ${isRunningCode ? 'bg-yellow-500 animate-pulse' : 'bg-blue-500 hover:bg-blue-600'}`}>
              {isRunningCode ? (<div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-1" />) : (<Zap size={16} className="mr-1" />)} Run Code
            </button>
          </div>
      </div>
      <div className="mb-2 flex flex-wrap items-center gap-1 text-xs">
          <span className="text-gray-500 mr-1">Snippets:</span>
          {langSnippets.map((s) => (
            <button key={s.name} onClick={() => insertCodeSnippet(s.code)} title={s.description} className="px-1.5 py-0.5 bg-gray-100 border border-gray-300 rounded hover:bg-gray-200">{s.name}</button>
          ))}
      </div>
      <div className="h-72 border border-gray-300 rounded-md overflow-hidden relative mb-3">
           <Suspense fallback={<div className="absolute inset-0 flex items-center justify-center bg-gray-100 text-gray-500 text-sm">Loading editor…</div>}>
              {editorIsLoaded && (
                  <LazyCodeMirror value={agentCode} height="100%" className="h-full" theme={vscodeDark} extensions={[isPythonMode ? python() : javascript()]} onChange={(v) => setAgentCode(v)} basicSetup={{ lineNumbers: true, foldGutter: true, highlightActiveLine: true, autocompletion: true, bracketMatching: true, closeBrackets: true }} />
              )}
           </Suspense>
      </div>
      {/* The Logs section is shown on desktop, but hidden on mobile (where it's in an accordion) */}
      <div className="hidden md:block">
          <Accordion title="Logs" icon={Terminal}>
              <LogsContent testOutput={testOutput} />
          </Accordion>
      </div>
   </div>
);


/* ───────────────────────── MAIN COMPONENT ───────────────────────── */
const EditAgentModal: React.FC<EditAgentModalProps> = ({
  isOpen,
  onClose,
  createMode,
  agent,
  code: existingCode,
  onSave,
  onImportComplete,
  setError,
  getToken,
  isProUser = false,
}) => {
  const logic = useEditAgentModalLogic({
    isOpen, onClose, createMode, agent, code: existingCode, onSave, getToken
  });

  const [editorIsLoaded, setEditorIsLoaded] = useState(false);
  const [importStatus, setImportStatus] = useState<{ inProgress: boolean; results: {filename: string; success: boolean; agent?: CompleteAgent; error?: string;}[] }>({
    inProgress: false,
    results: []
  });
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [activeTab, setActiveTab] = useState<'config' | 'prompt' | 'code'>('config');

  useEffect(() => {
    if (isOpen && !editorIsLoaded) {
      import('@uiw/react-codemirror').then(() => setEditorIsLoaded(true));
    }
    if (!isOpen && editorIsLoaded) {
      setEditorIsLoaded(false);
    }
  }, [isOpen, editorIsLoaded]);

  const handleImportClick = () => {
    setImportStatus({ inProgress: false, results: [] });
    if (fileInputRef.current) fileInputRef.current.click();
    Logger.info('APP', 'Opening file selector for agent import');
  };

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    Logger.info('APP', `Selected ${files.length} file(s) for import`);
    setImportStatus({ inProgress: true, results: [] });

    try {
      if (setError) setError(null);
      const results = await importAgentsFromFiles(Array.from(files));
      setImportStatus({ inProgress: false, results });

      const successCount = results.filter(r => r.success).length;
      if (successCount > 0 && onImportComplete) await onImportComplete();

      const failedImports = results.filter(r => !r.success);
      if (failedImports.length > 0 && setError) {
        setError(`Failed to import ${failedImports.length} agent(s): ${failedImports.map(r => `${r.filename}: ${r.error}`).join('; ')}`);
      }
    } catch (err) {
      const error = err as Error;
      if (setError) setError(`Import failed: ${error.message || 'Unknown error'}`);
      setImportStatus({ inProgress: false, results: [] });
    }

    if (fileInputRef.current) fileInputRef.current.value = '';
  };


  if (!isOpen) return null;

  /* ───────────────────────── RENDER LOGIC ───────────────────────── */

  return (
    <>
      <input type="file" ref={fileInputRef} onChange={handleFileSelect} accept=".yaml" multiple className="hidden" />
      <Modal
        open={isOpen}
        onClose={onClose}
        className="w-full max-w-7xl h-full md:max-h-[95vh] flex flex-col overflow-hidden"
      >
        {/* --- HEADER --- */}
        <div className="flex-shrink-0 flex justify-between items-center p-4 border-b border-gray-200 bg-gradient-to-r from-blue-600 to-indigo-600 text-white">
          <h2 className="text-xl font-semibold truncate pr-4">
            {createMode ? 'Create New Agent' : <>Edit Agent: <span className="font-normal">{logic.name || 'Unnamed'}</span></>}
          </h2>
          <div className="flex items-center space-x-3">
            {!createMode && logic.agentId && (
              <button onClick={logic.handleExport} className="flex items-center space-x-1.5 px-3 py-1.5 bg-blue-500 hover:bg-blue-400 text-white rounded-md text-xs" title="Export">
                <Download className="h-4 w-4" />
                <span>Export</span>
              </button>
            )}
            {createMode && (
              <button onClick={handleImportClick} className="flex items-center space-x-1.5 px-3 py-1.5 bg-blue-500 hover:bg-blue-400 text-white rounded-md text-xs" disabled={importStatus.inProgress}>
                <FileUp className="h-4 w-4" />
                <span>{importStatus.inProgress ? 'Importing...' : 'Import Agents'}</span>
              </button>
            )}
            <button onClick={onClose} className="p-1.5 rounded-full hover:bg-blue-700 hover:bg-opacity-50 text-indigo-100 hover:text-white">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* --- IMPORT RESULTS --- */}
        {importStatus.results.length > 0 && (
          <div className="flex-shrink-0 p-4 bg-blue-50">
            <h3 className="font-medium mb-2">Import Results:</h3>
            <ul className="list-disc pl-5">
              {importStatus.results.map((result, index) => (
                <li key={index} className={result.success ? 'text-green-600' : 'text-red-600'}>
                  {result.filename}: {result.success ? 'Success' : `Failed - ${result.error}`}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* --- MOBILE TAB NAV --- */}
        <MobileTabNav activeTab={activeTab} setActiveTab={setActiveTab} />

        <div className="flex-grow min-h-0 bg-gray-50 overflow-y-auto">
          {/* --- DESKTOP LAYOUT --- */}
          <div className="hidden md:flex flex-row flex-grow h-full">
            <div className="w-1/2 p-5 flex flex-col overflow-y-auto border-r border-gray-200">
              <div className="flex-shrink-0 mb-5">
                <Accordion title="Model Configuration" icon={Brain}>
                  <ConfigContent
                    name={logic.name} setName={logic.setName}
                    agentId={logic.agentId} setAgentId={logic.setAgentId}
                    createMode={createMode}
                    currentModel={logic.currentModel} setCurrentModel={logic.setCurrentModel}
                    isModelDropdownOpen={logic.isModelDropdownOpen} setIsModelDropdownOpen={logic.setIsModelDropdownOpen}
                    loadingModels={logic.loadingModels} modelsError={logic.modelsError}
                    availableModels={logic.availableModels}
                    loopInterval={logic.loopInterval} setLoopInterval={logic.setLoopInterval}
                    description={logic.description} setDescription={logic.setDescription}
                    isProUser={isProUser}
                  />
                </Accordion>
              </div>
              <div className="flex-grow min-h-0">
                <PromptContent
                  systemPromptRef={logic.systemPromptRef}
                  systemPrompt={logic.systemPrompt} setSystemPrompt={logic.setSystemPrompt}
                  insertSystemPromptText={logic.insertSystemPromptText}
                  availableAgentsForBlocks={logic.availableAgentsForBlocks}
                  visionValidationError={logic.visionValidationError}
                />
              </div>
            </div>
            <div className="w-1/2 p-5 flex flex-col overflow-y-auto">
              <div className="flex-shrink-0 mb-5">
                <Accordion title="Response Preview" icon={Play} rightContent={
                  <button onClick={logic.handleRunModel} disabled={logic.isRunningModel || !logic.currentModel} className={`px-3 py-1.5 rounded-md flex items-center text-sm text-white ${logic.isRunningModel ? 'bg-yellow-500 animate-pulse' : 'bg-green-500 hover:bg-green-600'}`}>
                    {logic.isRunningModel ? (<div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-1" />) : (<Play size={16} className="mr-1" />)} Run Model
                  </button>
                }>
                  <CodePreviewContent
                    testResponseRef={logic.testResponseRef}
                    testResponse={logic.testResponse}
                    setTestResponse={logic.setTestResponse}
                  />
                </Accordion>
              </div>
              <div className="flex-grow min-h-0">
                <CodeEditorContent
                  isPythonMode={logic.isPythonMode} setIsPythonMode={logic.setIsPythonMode}
                  jupyterStatus={logic.jupyterStatus} setIsJupyterModalOpen={logic.setIsJupyterModalOpen}
                  handleRunCode={logic.handleRunCode}
                  isRunningCode={logic.isRunningCode}
                  testResponse={logic.testResponse}
                  langSnippets={logic.langSnippets}
                  insertCodeSnippet={logic.insertCodeSnippet}
                  editorIsLoaded={editorIsLoaded}
                  agentCode={logic.agentCode} setAgentCode={logic.setAgentCode}
                  testOutput={logic.testOutput}
                />
              </div>
            </div>
          </div>

          {/* --- MOBILE LAYOUT (Tab Content) --- */}
          <div className="md:hidden p-4 space-y-4">
            {activeTab === 'config' &&
              <ConfigContent
                name={logic.name} setName={logic.setName}
                agentId={logic.agentId} setAgentId={logic.setAgentId}
                createMode={createMode}
                currentModel={logic.currentModel} setCurrentModel={logic.setCurrentModel}
                isModelDropdownOpen={logic.isModelDropdownOpen} setIsModelDropdownOpen={logic.setIsModelDropdownOpen}
                loadingModels={logic.loadingModels} modelsError={logic.modelsError}
                availableModels={logic.availableModels}
                loopInterval={logic.loopInterval} setLoopInterval={logic.setLoopInterval}
                description={logic.description} setDescription={logic.setDescription}
                isProUser={isProUser}
              />
            }

            {activeTab === 'prompt' && <div className="h-full flex flex-col">
              <PromptContent
                systemPromptRef={logic.systemPromptRef}
                systemPrompt={logic.systemPrompt} setSystemPrompt={logic.setSystemPrompt}
                insertSystemPromptText={logic.insertSystemPromptText}
                availableAgentsForBlocks={logic.availableAgentsForBlocks}
                visionValidationError={logic.visionValidationError}
              />
            </div>}

            {activeTab === 'code' && (
                <div className="space-y-4">
                    <Accordion title="Response Preview" icon={Play} rightContent={
                        <button onClick={logic.handleRunModel} disabled={logic.isRunningModel || !logic.currentModel} className={`px-3 py-1.5 rounded-md flex items-center text-sm text-white ${logic.isRunningModel ? 'bg-yellow-500 animate-pulse' : 'bg-green-500 hover:bg-green-600'}`}>
                           {logic.isRunningModel ? 'Running...' : 'Run Model'}
                        </button>
                    }>
                        <CodePreviewContent
                           testResponseRef={logic.testResponseRef}
                           testResponse={logic.testResponse}
                           setTestResponse={logic.setTestResponse}
                        />
                    </Accordion>

                    <CodeEditorContent
                      isPythonMode={logic.isPythonMode} setIsPythonMode={logic.setIsPythonMode}
                      jupyterStatus={logic.jupyterStatus} setIsJupyterModalOpen={logic.setIsJupyterModalOpen}
                      handleRunCode={logic.handleRunCode}
                      isRunningCode={logic.isRunningCode}
                      testResponse={logic.testResponse}
                      langSnippets={logic.langSnippets}
                      insertCodeSnippet={logic.insertCodeSnippet}
                      editorIsLoaded={editorIsLoaded}
                      agentCode={logic.agentCode} setAgentCode={logic.setAgentCode}
                      testOutput={logic.testOutput}
                    />

                    <Accordion title="Logs" icon={Terminal}>
                        <LogsContent testOutput={logic.testOutput} />
                    </Accordion>
                </div>
            )}
          </div>
        </div>

        {/* --- FOOTER --- */}
        <div className="flex-shrink-0 flex justify-end space-x-3 p-4 border-t border-gray-200 bg-gray-50">
          <button onClick={onClose} className="px-4 py-2 bg-white border border-gray-300 rounded-md text-sm text-gray-700 hover:bg-gray-50">Cancel</button>
          <button onClick={logic.handleSave} disabled={(createMode && !logic.agentId) || !logic.name || !logic.currentModel || logic.isRunningModel || logic.isRunningCode} className="px-5 py-2 bg-indigo-600 text-white rounded-md text-sm hover:bg-indigo-700 disabled:opacity-60">{createMode ? 'Create Agent' : 'Save Changes'}</button>
        </div>
      </Modal>

      {/* --- MODALS --- */}
      <JupyterServerModal
        isOpen={logic.isJupyterModalOpen}
        onClose={() => {
          logic.setIsJupyterModalOpen(false);
          logic.checkJupyter();
        }}
      />
    </>
  );
};

export default EditAgentModal;
