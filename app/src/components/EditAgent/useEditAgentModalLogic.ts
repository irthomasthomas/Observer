// src/components/EditAgent/useEditAgentModalLogic.ts

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  CompleteAgent,
  downloadAgent,
  listAgents as dbListAgents
} from '@utils/agent_database';
import { listModels, Model } from '@utils/ollamaServer';
import { getOllamaServerAddress, executeTestIteration } from '@utils/main_loop';
import { Logger, LogEntry, LogLevel } from '@utils/logging';
import {
  getJupyterConfig,
  testJupyterConnection as utilsTestJupyterConnection
} from '@utils/handlers/JupyterConfig';
import { postProcess } from '@utils/post-processor';
import type { TokenProvider } from '@utils/main_loop';

/* ───────────────────────── snippets ───────────────────────── */
export const jsSnippets = [
  {
    name: 'Write to Memory',
    description: 'Store response in memory',
    code: 'setMemory(agentId, response);'
  },
  {
    name: 'Read/Write Memory',
    description: 'Append to memory',
    code: 'setMemory(`${await getMemory()} \\n[${time()}] ${response}`);'
  },
  {
    name: 'Clean Thought Tags',
    description: 'Remove <think> tags',
    code:
      "const cleaned = response.replace(/<think>[\\s\\S]*?<\\/think>/g,'').trim();"
  }
];

export const pythonSnippets = [
  {
    name: 'Write to Memory',
    description: 'Store response in file',
    code:
      'import os\\nos.makedirs("memory", exist_ok=True)\\nwith open(f"memory/{agentId}.txt","w") as f:\\n    f.write(response)'
  },
  {
    name: 'Read/Write Memory',
    description: 'Append to memory file',
    code:
      'import os, datetime\\nos.makedirs("memory", exist_ok=True)\\nf="memory/{agentId}.txt"\\nold=open(f).read() if os.path.exists(f) else ""\\nopen(f,"w").write(old+"\\n["+datetime.datetime.now().isoformat()+"] "+response)'
  },
  {
    name: 'Clean Thought Tags',
    description: 'Remove <think> tags',
    code:
      'import re\\ncleaned=re.sub(r"<think>[\\s\\S]*?</think>","",response).strip()'
  }
];

/* ───────────────────────── hook props ───────────────────────── */
interface UseEditAgentModalLogicProps {
  isOpen: boolean;
  onClose: () => void;
  createMode: boolean;
  agent?: CompleteAgent;
  code?: string;
  onSave: (agent: CompleteAgent, code: string) => void;
  getToken: TokenProvider;
}

/* ───────────────────────── hook ───────────────────────── */
export const useEditAgentModalLogic = ({
  isOpen,
  onClose,
  createMode,
  agent,
  code: existingCode,
  onSave,
  getToken
}: UseEditAgentModalLogicProps) => {
  /* state */
  const [agentId, setAgentId] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [currentModel, setCurrentModel] = useState('');
  const [loopInterval, setLoopInterval] = useState(10.0);
  const [availableModels, setAvailableModels] = useState<Model[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const [modelsError, setModelsError] = useState<string | null>(null);
  const [isModelDropdownOpen, setIsModelDropdownOpen] = useState(false);

  const [systemPrompt, setSystemPrompt] = useState('');
  const systemPromptRef = useRef<HTMLTextAreaElement>(null);
  const [visionValidationError, setVisionValidationError] = useState<string | null>(null);

  const [availableAgentsForBlocks, setAvailableAgentsForBlocks] = useState<
    CompleteAgent[]
  >([]);
  const [showAgentBlockDropdown, setShowAgentBlockDropdown] = useState(false);

  const [agentCode, setAgentCode] = useState('');
  const [isPythonMode, setIsPythonMode] = useState(false);

  const [isJupyterModalOpen, setIsJupyterModalOpen] = useState(false);
  const [jupyterStatus, setJupyterStatus] = useState<
    'unknown' | 'checking' | 'connected' | 'error'
  >('unknown');

  const [testResponse, setTestResponse] = useState('');
  const [isRunningModel, setIsRunningModel] = useState(false);
  const [isRunningCode, setIsRunningCode] = useState(false);
  const [testOutput, setTestOutput] = useState('');
  const testResponseRef = useRef<HTMLTextAreaElement>(null);

  /* helpers */
  const fetchModels = useCallback(async () => {
    try {
      setLoadingModels(true);
      setModelsError(null);
      const { host, port } = getOllamaServerAddress();
      const r = await listModels(host, port);
      if (r.error) throw new Error(r.error);
      setAvailableModels(r.models);
      const defaultModel = agent?.model_name ?? r.models[0]?.name ?? '';
      setCurrentModel(defaultModel);
    } catch (e) {
      setModelsError(e instanceof Error ? e.message : String(e));
      setAvailableModels([]);
      setCurrentModel('');
    } finally {
      setLoadingModels(false);
    }
  }, [agent]);

  const loadAgents = useCallback(async () => {
    setAvailableAgentsForBlocks(await dbListAgents());
  }, []);

  const checkJupyter = useCallback(async () => {
    setJupyterStatus('checking');
    try {
        const config = getJupyterConfig();
        const res = await utilsTestJupyterConnection(config);
        setJupyterStatus(res.success ? 'connected' : 'error');
    } catch (error) {
        console.error("Error checking Jupyter connection:", error);
        setJupyterStatus('error');
    }
  }, []);

  /* initialise on open */
  useEffect(() => {
    if (!isOpen) return;

    const defaultCode =
    `// Process model response\nconsole.log(agentId, response.substring(0, 100));\n\n`;

    if (agent) {
      setAgentId(agent.id);
      setName(agent.name);
      setDescription(agent.description);
      setCurrentModel(agent.model_name);
      setLoopInterval(agent.loop_interval_seconds);
      setSystemPrompt(agent.system_prompt);
    } else { // createMode
      setName('');
      setAgentId('');
      setDescription('');
      setLoopInterval(60);
      setSystemPrompt('');
    }

    setAgentCode(existingCode ?? defaultCode);
    setIsPythonMode((existingCode ?? defaultCode).trim().startsWith('#python'));
    setTestResponse('');
    setTestOutput('');
    setIsModelDropdownOpen(false);
    setShowAgentBlockDropdown(false);

    fetchModels();
    loadAgents();
    checkJupyter();
  }, [isOpen, agent, existingCode, fetchModels, loadAgents, checkJupyter]);

  /* Auto-fill agentId from name in createMode */
  useEffect(() => {
    if (createMode && name) {
      const generatedId = name
        .toLowerCase()
        .replace(/\s+/g, '_')
        .replace(/[^a-z0-9_]/g, '');
      setAgentId(generatedId);
    } else if (createMode && !name) {
      setAgentId('');
    }
  }, [name, createMode]);

  /* Vision model validation */
  useEffect(() => {
    const hasVisionSensor = /\$SCREEN_64|\$CAMERA/.test(systemPrompt);

    if (!hasVisionSensor) {
      setVisionValidationError(null);
      return;
    }

    const selectedModel = availableModels.find(m => m.name === currentModel);

    if (selectedModel && !selectedModel.multimodal) {
      setVisionValidationError(
        "Warning: The selected model may not support images. Use a vision model (marked with an eye icon) for $SCREEN_64 or $CAMERA sensors."
      );
    } else {
      setVisionValidationError(null);
    }
  }, [systemPrompt, currentModel, availableModels]);


  /* keep #python line in sync */
  useEffect(() => {
    if (!isOpen) return;
    if (isPythonMode && !agentCode.startsWith('#python')) {
      setAgentCode(prevCode => '#python <-- do not remove this!\\n' + prevCode);
    } else if (!isPythonMode && agentCode.startsWith('#python')) {
      setAgentCode(prevCode => prevCode.replace(/^#python.*?\n/, ''));
    }
  }, [isPythonMode, isOpen, agentCode]);

  /* prompt helpers */
  const insertSystemPromptText = (txt: string) => {
    const ta = systemPromptRef.current;
    if (!ta) return;
    const { selectionStart: s, selectionEnd: e, value: v } = ta;
    setSystemPrompt(v.slice(0, s) + txt + v.slice(e));
    requestAnimationFrame(() => {
      ta.focus();
      const pos = s + txt.length;
      ta.setSelectionRange(pos, pos);
    });
  };

  const insertCodeSnippet = (snippet: string) => {
    setAgentCode((c) => c + (c.endsWith('\\n') || c.length === 0 ? '' : '\\n') + snippet + '\\n');
  };

  /* run model */
  const handleRunModel = async () => {
    if (isRunningModel || !currentModel) return;
    setIsRunningModel(true);
    setTestOutput((p) => 'SYSTEM: running model...\\n' + p);
    try {
      const r = await executeTestIteration(
        agentId || 'test-agent',
        systemPrompt,
        currentModel,
        getToken
      );
      setTestResponse(r);
      setTestOutput((p) => `SYSTEM: model returned (${r.length} chars)\\n` + p);
      testResponseRef.current?.focus();
    } catch (e) {
      setTestOutput(
        (p) => `ERROR: ${e instanceof Error ? e.message : String(e)}\\n` + p
      );
    } finally {
      setIsRunningModel(false);
    }
  };

  /* run code */
  const handleRunCode = async () => {
    if (isRunningCode || !testResponse) return;
    setIsRunningCode(true);
    setTestOutput((p) => 'SYSTEM: executing code...\\n' + p);
    const buf: string[] = [];
    const origLog = console.log;
    console.log = (...a: unknown[]) => {
      buf.push(a.map(String).join(' '));
      origLog.apply(console, a);
    };
    const listener = (e: LogEntry) =>
      buf.push(`[${LogLevel[e.level].toUpperCase()}] ${e.message}`);
    Logger.addListener(listener);
    try {
      await postProcess(agentId || 'test-agent', testResponse, agentCode, 'test-iteration');
      setTestOutput(
        (p) =>
          buf.join('\\n') +
          (buf.length ? '\\n' : '') +
          'SYSTEM: code finished\\n' +
          p
      );
    } catch (e) {
      setTestOutput(
        (p) =>
          buf.join('\\n') +
          (buf.length ? '\\n' : '') +
          `ERROR: ${e instanceof Error ? e.message : String(e)}\\n` +
          p
      );
    } finally {
      Logger.removeListener(listener);
      console.log = origLog;
      setIsRunningCode(false);
    }
  };

  /* save agent */
  const handleSave = () => {
    if (createMode && !agentId) { alert('Agent ID required'); return; }
    if (!name) { alert('Name required'); return; }
    if (!currentModel) { alert('Model required'); return; }
    const obj: CompleteAgent = {
      id: agentId,
      name,
      description,
      model_name: currentModel,
      system_prompt: systemPrompt,
      loop_interval_seconds: loopInterval
    };
    onSave(obj, agentCode);
    onClose();
  };

  /* export file */
  const handleExport = async () => {
    try {
      if (agentId) await downloadAgent(agentId);
      else alert('Agent ID is missing. Cannot export.');
    } catch (e) {
      alert(`Export failed: ${e instanceof Error ? e.message : e}`);
    }
  };

  const langSnippets = isPythonMode ? pythonSnippets : jsSnippets;

  return {
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
  };
};
