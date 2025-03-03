// src/components/EditAgentModal.tsx
import { useState, useEffect, lazy, Suspense } from 'react';
import { CompleteAgent, downloadAgent } from '@utils/agent_database';
import { Download } from 'lucide-react';
import ActionsTab from './ActionsTab';

type TabType = 'config' | 'actions' | 'code';

// Lazy load CodeMirror component
const LazyCodeMirror = lazy(() => import('@uiw/react-codemirror'));

// Import extensions normally - adding both Python and JavaScript languages
import { javascript } from '@codemirror/lang-javascript';
import { vscodeDark } from '@uiw/codemirror-theme-vscode';

interface EditAgentModalProps {
  isOpen: boolean;
  onClose: () => void;
  createMode: boolean;
  agent?: CompleteAgent;
  code?: string;
  onSave: (agent: CompleteAgent, code: string) => void;
}

// Loading fallback component for CodeMirror
//const EditorLoading = () => (
//  <div className="border border-gray-300 rounded p-4 h-64 flex flex-col items-center justify-center bg-gray-50">
//    <div className="w-8 h-8 border-4 border-gray-300 border-t-blue-500 rounded-full animate-spin mb-2"></div>
//    <p className="text-gray-600">Loading editor...</p>
//  </div>
//);

const EditAgentModal = ({ 
  isOpen, 
  onClose, 
  createMode, 
  agent, 
  code: existingCode,
  onSave 
}: EditAgentModalProps) => {
  const [agentId, setAgentId] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [model, setModel] = useState('deepseek-r1:8b');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [code, setCode] = useState('console.log("Hello, I am an agent");');
  const [loopInterval, setLoopInterval] = useState(1.0);
  const [activeTab, setActiveTab] = useState<TabType>('config');
  const [editorIsLoaded, setEditorIsLoaded] = useState(false);

  useEffect(() => {
    if (agent) {
      setAgentId(agent.id);
      setName(agent.name);
      setDescription(agent.description);
      setModel(agent.model_name);
      setSystemPrompt(agent.system_prompt);
      setLoopInterval(agent.loop_interval_seconds);
    }
    
    if (existingCode) {
      setCode(existingCode);
    }
  }, [agent, existingCode]);

  // Preload editor when switching to code tab
  useEffect(() => {
    if (activeTab === 'code' && !editorIsLoaded) {
      // This will trigger the lazy loading
      import('@uiw/react-codemirror').then(() => {
        setEditorIsLoaded(true);
      });
    }
  }, [activeTab, editorIsLoaded]);

  const handleSave = () => {
    const completeAgent: CompleteAgent = {
      id: agentId,
      name: name,
      description: description,
      status: agent?.status || 'stopped',
      model_name: model,
      system_prompt: systemPrompt,
      loop_interval_seconds: loopInterval
    };
    
    onSave(completeAgent, code);
    onClose();
  };

  const handleExport = async () => {
    try {
      await downloadAgent(agentId);
    } catch (error) {
      console.error('Failed to export agent:', error);
    }
  };

  const renderConfigTab = () => (
    <>
      {createMode && (
        <div className="mb-4">
          <label className="block mb-1">Agent ID</label>
          <input 
            type="text" 
            value={agentId} 
            onChange={(e) => setAgentId(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))} 
            className="w-full p-2 border rounded"
            placeholder="my_custom_agent"
          />
          <p className="text-sm text-gray-500">Lowercase letters, numbers, and underscores only</p>
        </div>
      )}
      
      <div className="mb-4">
        <label className="block mb-1">Name</label>
        <input 
          type="text" 
          value={name} 
          onChange={(e) => setName(e.target.value)} 
          className="w-full p-2 border rounded"
          placeholder="Enter agent name"
        />
      </div>
      
      <div className="mb-4">
        <label className="block mb-1">Description</label>
        <textarea 
          value={description} 
          onChange={(e) => setDescription(e.target.value)} 
          className="w-full p-2 border rounded"
          rows={2}
          placeholder="Enter agent description"
        />
      </div>
      
      <div className="mb-4">
        <label className="block mb-1">Model</label>
        <input 
          type="text" 
          value={model} 
          onChange={(e) => setModel(e.target.value)} 
          className="w-full p-2 border rounded"
          placeholder="Enter model name"
        />
      </div>

      <div className="mb-4">
        <label className="block mb-1">Loop Interval (seconds)</label>
        <div>
          <input 
            type="number" 
            value={loopInterval} 
            onChange={(e) => setLoopInterval(Math.max(0.1, parseFloat(e.target.value)))} 
            className="w-full p-2 border rounded"
            min="0.1"
            step="0.1"
          />
          <p className="text-sm text-gray-500">Time between agent executions</p>
        </div>
      </div>
    </>
  );

  const renderCodeTab = () => (
    <div className="space-y-4">
      {/* Code Editor Header */}
      <div className="flex justify-between items-center">
        <div>
          <h3 className="font-medium text-gray-800">Agent Code</h3>
          <p className="text-sm text-gray-500">Write code that defines your agent's behavior</p>
        </div>
        
        {/* Language selector */}
        <div className="flex items-center space-x-2">
          <label htmlFor="code-language" className="text-sm text-gray-600">Language:</label>
          <select
            id="code-language"
            className="border rounded px-2 py-1 text-sm bg-white"
            defaultValue="javascript"
          >
            <option value="javascript">JavaScript</option>
            <option value="python" disabled>Python (Soon)</option>
          </select>
        </div>
      </div>

      {/* Editor Container with styling */}
      <div className="border border-gray-300 rounded-md overflow-hidden shadow-sm">
        {/* Editor Toolbar */}
        <div className="bg-gray-100 border-b px-3 py-2 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <span className="text-xs font-medium text-gray-700">agent_code.js</span>
            <span className="bg-blue-100 text-blue-700 text-xs px-2 py-0.5 rounded">JavaScript</span>
          </div>
          <div className="text-xs text-gray-500">
            {code.length} characters
          </div>
        </div>

        {/* CodeMirror Editor */}
        <Suspense fallback={
          <div className="flex flex-col items-center justify-center bg-gray-50 h-72 space-y-4">
            <div className="w-8 h-8 border-4 border-t-blue-500 border-blue-200 rounded-full animate-spin"></div>
            <div>
              <p className="text-gray-600 font-medium">Loading code editor...</p>
              <p className="text-xs text-gray-500 text-center">This might take a moment</p>
            </div>
          </div>
        }>
          <LazyCodeMirror
            value={code}
            height="360px"
            theme={vscodeDark}
            extensions={[javascript()]}
            onChange={(value) => setCode(value)}
            basicSetup={{
              lineNumbers: true,
              highlightActiveLineGutter: true,
              highlightSpecialChars: true,
              foldGutter: true,
              dropCursor: true,
              allowMultipleSelections: true,
              indentOnInput: true,
              bracketMatching: true,
              closeBrackets: true,
              autocompletion: true,
              rectangularSelection: true,
              crosshairCursor: true,
              highlightActiveLine: true,
              highlightSelectionMatches: true,
              closeBracketsKeymap: true,
              defaultKeymap: true,
              searchKeymap: true,
              historyKeymap: true,
              foldKeymap: true,
              completionKeymap: true,
              lintKeymap: true,
            }}
          />
        </Suspense>
      </div>

      {/* Helpful tips section */}
      <div className="bg-blue-50 border border-blue-200 rounded-md p-3 text-sm text-blue-800">
        <h4 className="font-medium mb-1 flex items-center">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Tips for writing agent code
        </h4>
        <ul className="list-disc pl-5 space-y-1">
          <li>Use <code className="bg-blue-100 px-1 rounded">getAgentMemory(agentId)</code> to access agent memory</li>
          <li>Use <code className="bg-blue-100 px-1 rounded">updateAgentMemory(agentId, text)</code> to update memory</li>
          <li>Use <code className="bg-blue-100 px-1 rounded">logger.info(agentId, message)</code> to log information</li>
          <li>Your agent loop will run every {loopInterval} seconds</li>
        </ul>
      </div>
    </div>
  );

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white p-6 rounded-lg w-2/3 max-h-[80vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold">{createMode ? 'Create Agent' : 'Edit Agent'}</h2>
          
          {/* Export button - only show if we have an agent ID or in edit mode */}
          {(!createMode || agentId) && (
            <button 
              onClick={handleExport}
              className="flex items-center space-x-1 px-3 py-1 bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
              title="Export agent configuration"
            >
              <Download className="h-4 w-4" />
              <span>Export</span>
            </button>
          )}
        </div>
        
        {/* Tab navigation */}
        <div className="flex border-b mb-4">
          <button
            className={`px-4 py-2 font-medium ${activeTab === 'config' ? 'border-b-2 border-blue-500 text-blue-600' : 'text-gray-500'}`}
            onClick={() => setActiveTab('config')}
          >
            Configuration
          </button>
          <button
            className={`px-4 py-2 font-medium ${activeTab === 'actions' ? 'border-b-2 border-blue-500 text-blue-600' : 'text-gray-500'}`}
            onClick={() => setActiveTab('actions')}
          >
            Actions
          </button>
          <button
            className={`px-4 py-2 font-medium ${activeTab === 'code' ? 'border-b-2 border-blue-500 text-blue-600' : 'text-gray-500'}`}
            onClick={() => setActiveTab('code')}
          >
            Code
          </button>
        </div>
        
        {/* Tab content */}
        <div>
          {activeTab === 'config' && renderConfigTab()}
          {activeTab === 'actions' && (
            <ActionsTab 
              systemPrompt={systemPrompt} 
              onSystemPromptChange={setSystemPrompt} 
            />
          )}
          {activeTab === 'code' && renderCodeTab()}
        </div>
        
        <div className="flex justify-end space-x-4 mt-6">
          <button 
            onClick={onClose}
            className="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300"
          >
            Cancel
          </button>
          <button 
            onClick={handleSave}
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
          >
            {createMode ? 'Create Agent' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default EditAgentModal;
