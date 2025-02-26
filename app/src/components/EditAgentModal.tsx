import { useState, useEffect, lazy, Suspense } from 'react';
import { CompleteAgent } from '../utils/agent_database';
import { Download } from 'lucide-react';

// Define tab types
type TabType = 'config' | 'actions';

// Lazy load CodeMirror component
const LazyCodeMirror = lazy(() => import('@uiw/react-codemirror'));

// Import extensions normally - assuming you'll add these dependencies
// If not available, you can replace with simpler textarea implementation
import { python } from '@codemirror/lang-python';
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
const EditorLoading = () => (
  <div className="border border-gray-300 rounded p-4 h-64 flex flex-col items-center justify-center bg-gray-50">
    <div className="w-8 h-8 border-4 border-gray-300 border-t-blue-500 rounded-full animate-spin mb-2"></div>
    <p className="text-gray-600">Loading editor...</p>
  </div>
);

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

  // Preload editor when switching to actions tab
  useEffect(() => {
    if (activeTab === 'actions' && !editorIsLoaded) {
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

  // Export current agent as a JSON file
  const handleExport = () => {
    // Create the export object
    const exportData = {
      metadata: {
        id: agentId,
        name: name,
        description: description,
        status: agent?.status || 'stopped'
      },
      config: {
        model_name: model,
        system_prompt: systemPrompt,
        loop_interval_seconds: loopInterval
      },
      code: code
    };
    
    // Convert to JSON and create a blob
    const json = JSON.stringify(exportData, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    
    // Create a download link
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `agent-${agentId || 'new'}.json`;
    
    // Trigger the download
    document.body.appendChild(a);
    a.click();
    
    // Clean up
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 0);
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

  const renderActionsTab = () => (
    <>
      <div className="mb-4">
        <label className="block mb-1">System Prompt</label>
        <textarea 
          value={systemPrompt} 
          onChange={(e) => setSystemPrompt(e.target.value)} 
          className="w-full p-2 border rounded font-mono text-sm"
          rows={6}
          placeholder="Enter system prompt"
        />
      </div>
      
      <div className="mb-4">
        <label className="block mb-1">Code</label>
        <Suspense fallback={<EditorLoading />}>
          <LazyCodeMirror
            value={code}
            height="300px"
            theme={vscodeDark}
            extensions={[python()]}
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
    </>
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
        </div>
        
        {/* Tab content */}
        <div>
          {activeTab === 'config' && renderConfigTab()}
          {activeTab === 'actions' && renderActionsTab()}
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
