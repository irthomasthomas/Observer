// src/components/EditAgent/EditAgentModal.tsx

import React, {
  Suspense,
  useState,
  useEffect,
  useRef
} from 'react';
import Modal from '@components/EditAgent/Modal';
import { CompleteAgent, importAgentsFromFiles } from '@utils/agent_database';
import {
  Download,
  ChevronDown,
  Eye,
  ScanText,
  Play,
  X,
  Zap,
  Monitor,
  Brain,
  PlusCircle,
  Activity,
  Edit3,
  Tag,
  Server,
  Terminal,
  FileUp,
  Clipboard,
  Mic,
  Camera,
  AlertTriangle
} from 'lucide-react';
import { Logger } from '@utils/logging';
import JupyterServerModal from '@components/JupyterServerModal';
import { useEditAgentModalLogic } from './useEditAgentModalLogic';

import LazyCodeMirror from '@uiw/react-codemirror';
import { javascript } from '@codemirror/lang-javascript';
import { python } from '@codemirror/lang-python';
import { vscodeDark } from '@uiw/codemirror-theme-vscode';

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
}

/* ───────────────────────── component ───────────────────────── */
const EditAgentModal: React.FC<EditAgentModalProps> = ({
  isOpen,
  onClose,
  createMode,
  agent,
  code: existingCode,
  onSave,
  onImportComplete,
  setError
}) => {
  const {
    agentId, setAgentId,
    name, setName,
    description, setDescription,
    currentModel, setCurrentModel,
    loopInterval, setLoopInterval,
    availableModels,
    loadingModels,
    modelsError,
    isModelDropdownOpen, setIsModelDropdownOpen,
    systemPrompt, setSystemPrompt,
    systemPromptRef,
    availableAgentsForBlocks,
    showAgentBlockDropdown, setShowAgentBlockDropdown,
    agentCode, setAgentCode,
    isPythonMode, setIsPythonMode,
    isJupyterModalOpen, setIsJupyterModalOpen,
    jupyterStatus,
    testResponse, setTestResponse,
    isRunningModel,
    isRunningCode,
    testOutput,
    testResponseRef,
    checkJupyter,
    insertSystemPromptText,
    insertCodeSnippet,
    handleRunModel,
    handleRunCode,
    handleSave,
    handleExport,
    langSnippets,
    visionValidationError,
  } = useEditAgentModalLogic({
    isOpen, onClose, createMode, agent, code: existingCode, onSave
  });

  const [editorIsLoaded, setEditorIsLoaded] = useState(false);
  const [importStatus, setImportStatus] = useState<{ inProgress: boolean; results: {filename: string; success: boolean; agent?: CompleteAgent; error?: string;}[] }>({ 
    inProgress: false, 
    results: [] 
  });
  const fileInputRef = useRef<HTMLInputElement | null>(null);

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

  return (
    <>
      <input type="file" ref={fileInputRef} onChange={handleFileSelect} accept=".yaml" multiple className="hidden" />
      <Modal
        open={isOpen}
        onClose={onClose}
        className="w-full max-w-7xl h-full md:max-h-[95vh] flex flex-col overflow-hidden"
      >
        <div className="flex-shrink-0 flex justify-between items-center p-4 border-b border-gray-200 bg-gradient-to-r from-blue-600 to-indigo-600 text-white">
          <h2 className="text-xl font-semibold truncate pr-4">
            {createMode ? 'Create New Agent' : <>Edit Agent: <span className="font-normal">{name || 'Unnamed'}</span></>}
          </h2>
          <div className="flex items-center space-x-3">
            {!createMode && agentId && (
              <button onClick={handleExport} className="flex items-center space-x-1.5 px-3 py-1.5 bg-blue-500 hover:bg-blue-400 text-white rounded-md text-xs" title="Export">
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

        <div className="flex flex-col md:flex-row flex-grow min-h-0 bg-gray-50 overflow-y-auto md:overflow-hidden">
          <div className="w-full md:w-1/2 p-3 md:p-5 flex flex-col space-y-4 md:space-y-5 overflow-y-auto border-r-0 md:border-r border-gray-200">
            <div className="p-4 bg-white rounded-lg border border-gray-200 shadow-sm">
              <h3 className="text-lg font-semibold text-indigo-700 mb-4">Agent Configuration</h3>
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
                      <div className="absolute z-20 mt-1 w-full max-h-60 bg-white border border-gray-300 rounded-md shadow-lg overflow-y-auto">
                        {loadingModels && <div className="px-3 py-2 text-sm text-gray-500">Loading…</div>}
                        {modelsError && <div className="px-3 py-2 text-sm text-red-600">{modelsError}</div>}
                        {!loadingModels && !modelsError && availableModels.length === 0 && <div className="px-3 py-2 text-sm text-gray-500">No models. Ensure Ollama is running.</div>}
                        {!loadingModels && !modelsError && availableModels.map((m) => (
                            <button
                              key={m.name}
                              onClick={() => {
                                setCurrentModel(m.name);
                                setIsModelDropdownOpen(false);
                              }}
                              className={`w-full text-left px-3 py-2 text-xs flex justify-between items-center ${
                                currentModel === m.name
                                  ? 'bg-indigo-500 text-white'
                                  : 'hover:bg-gray-100'
                              }`}
                            >
                              <span className="truncate pr-2">{m.name}</span>
                              {m.multimodal && (
                                <span title="Supports Vision" className={`inline-flex items-center text-xs font-medium px-2 py-0.5 rounded ${currentModel === m.name ? 'bg-indigo-400 text-white' : 'text-purple-600 bg-purple-100'}`}>
                                  <Eye className="h-3.5 w-3.5 mr-1" />
                                  Vision
                                </span>
                              )}
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
                  <input type="number" min="15" step="1" value={loopInterval} onChange={(e) => setLoopInterval(Math.max(15, parseFloat(e.target.value) || 30))} className="w-full p-2 bg-gray-100 border-gray-300 rounded-md" />
                </div>
                <div className="col-span-1 sm:col-span-2">
                  <label className="block text-gray-600 mb-1 flex items-center"><Edit3 size={14} className="mr-1.5 text-gray-500" />Description</label>
                  <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className="w-full p-2 bg-gray-100 border-gray-300 rounded-md" placeholder="Optional description" />
                </div>
              </div>
            </div>

            <div className="p-4 bg-white rounded-lg border border-gray-200 shadow-sm flex-grow flex flex-col">
              <div className="flex justify-between items-center mb-3">
                <div>
                  <h3 className="text-lg font-semibold text-indigo-700">System Prompt</h3>
                  <p className="text-xs text-gray-500">Define instructions for the agent</p>
                </div>
                <div className="flex items-center gap-x-1.5 bg-gray-100 p-1 rounded-lg border border-gray-200">
                  <button onClick={() => insertSystemPromptText('$SCREEN_OCR')} title="Screen OCR (Text)" className="p-1.5 hover:bg-gray-200 rounded-md text-blue-600"><ScanText size={16} /></button>
                  <div className="flex items-center space-x-1 bg-purple-100 border border-purple-200 rounded-md px-1">
                    <button onClick={() => insertSystemPromptText('$SCREEN_64')} title="Screen Image (Vision)" className="p-1.5 hover:bg-purple-200 rounded-md text-purple-600"><Monitor size={16} /></button>
                    <button onClick={() => insertSystemPromptText('$CAMERA')} title="Camera Image (Vision)" className="p-1.5 hover:bg-purple-200 rounded-md text-purple-600"><Camera size={16} /></button>
                  </div>
                  <div className="w-px h-5 bg-gray-300"></div>
                  <button onClick={() => insertSystemPromptText('$CLIPBOARD_TEXT')} title="Paste Clipboard" className="p-1.5 hover:bg-gray-200 rounded-md text-slate-600"><Clipboard size={16} /></button>
                  <button onClick={() => insertSystemPromptText('$MICROPHONE')} title="Microphone Transcription" className="p-1.5 hover:bg-gray-200 rounded-md text-red-600"><Mic size={16} /></button>
                  <div className="relative">
                    <button onClick={() => setShowAgentBlockDropdown(!showAgentBlockDropdown)} className="p-1.5 hover:bg-gray-200 rounded-md text-green-600 flex items-center" title="Agent Memory"><Brain size={16} /><ChevronDown size={14} className={`ml-0.5 transition-transform ${showAgentBlockDropdown ? 'rotate-180' : ''}`} /></button>
                    {showAgentBlockDropdown && (
                      <div className="absolute right-0 z-10 mt-2 w-48 bg-white border border-gray-300 rounded-md shadow-lg max-h-40 overflow-y-auto">
                        {availableAgentsForBlocks.length === 0 && <div className="px-3 py-1.5 text-xs text-gray-500 text-center">No agents</div>}
                        {availableAgentsForBlocks.map((a) => (
                          <button key={a.id} onClick={() => { insertSystemPromptText(`$MEMORY@${a.id}`); setShowAgentBlockDropdown(false); }} className="w-full text-left px-3 py-1.5 text-xs hover:bg-gray-100 flex items-center"><PlusCircle size={14} className="mr-1.5 text-green-500" />{a.name}</button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
              <textarea ref={systemPromptRef} value={systemPrompt} onChange={(e) => setSystemPrompt(e.target.value)} rows={10} className="w-full flex-grow p-3 bg-gray-50 border border-gray-300 rounded-md font-mono text-sm" placeholder="Enter system prompt…" />
              {visionValidationError && (
                  <div className="mt-2 p-2 bg-yellow-50 border border-yellow-200 rounded-md flex items-center text-sm">
                      <AlertTriangle className="h-5 w-5 text-yellow-500 mr-2 flex-shrink-0" />
                      <p className="text-yellow-700">{visionValidationError}</p>
                  </div>
              )}
            </div>
          </div>

          <div className="w-full md:w-1/2 p-3 md:p-5 flex flex-col space-y-4 md:space-y-5 overflow-y-auto">
            <div className="p-4 bg-white rounded-lg border border-gray-200 shadow-sm">
              <div className="flex justify-between items-center mb-2">
                <h3 className="text-lg font-semibold text-indigo-700 flex items-baseline"><code className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded-md font-mono text-lg mr-1.5 shadow-sm border border-blue-200">response</code>Preview</h3>
                <button onClick={handleRunModel} disabled={isRunningModel || !currentModel} className={`px-3 py-1.5 rounded-md flex items-center text-sm text-white ${isRunningModel ? 'bg-yellow-500 animate-pulse' : 'bg-green-500 hover:bg-green-600'}`}>
                  {isRunningModel ? (<div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-1" />) : (<Play size={16} className="mr-1" />)} Run Model
                </button>
              </div>
              <textarea ref={testResponseRef} value={testResponse} onChange={(e) => setTestResponse(e.target.value)} rows={4} className="w-full p-2 bg-gray-50 border border-gray-300 rounded-md font-mono text-xs" placeholder="Output from Run Model…" />
            </div>

            <div className="p-4 bg-white rounded-lg border border-gray-200 shadow-sm flex-grow flex flex-col">
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
              <label className="block text-sm font-medium text-gray-600 mb-1 flex items-center"><Terminal size={14} className="mr-1.5" />Logs</label>
              <pre className="w-full p-2 bg-gray-50 border border-gray-300 rounded-md font-mono text-xs h-32 overflow-y-auto">
                {testOutput ? (testOutput.replace(/\\n/g, '\n').split('\n').map((line, i) => (<div key={i} className={line.startsWith('ERROR:') ? 'text-red-500' : line.startsWith('SYSTEM:') ? 'text-blue-600' : line.startsWith('[DEBUG]') ? 'text-gray-500' : 'text-gray-700'}>{line}</div>))) : (<span className="text-gray-400">Logs will appear here…</span>)}
              </pre>
            </div>
          </div>
        </div>

        <div className="flex-shrink-0 flex justify-end space-x-3 p-4 border-t border-gray-200 bg-gray-50">
          <button onClick={onClose} className="px-4 py-2 bg-white border border-gray-300 rounded-md text-sm text-gray-700 hover:bg-gray-50">Cancel</button>
          <button onClick={handleSave} disabled={(createMode && !agentId) || !name || !currentModel || isRunningModel || isRunningCode} className="px-5 py-2 bg-indigo-600 text-white rounded-md text-sm hover:bg-indigo-700 disabled:opacity-60">{createMode ? 'Create Agent' : 'Save Changes'}</button>
        </div>
      </Modal>

      <JupyterServerModal
        isOpen={isJupyterModalOpen}
        onClose={() => {
          setIsJupyterModalOpen(false);
          checkJupyter();
        }}
      />
    </>
  );
};

export default EditAgentModal;
