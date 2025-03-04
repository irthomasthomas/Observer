import { useState, useEffect, lazy, Suspense } from 'react';
import { CompleteAgent, downloadAgent } from '@utils/agent_database';
import { Download, Code, Settings, Terminal, ArrowRight, PlayCircle, Copy } from 'lucide-react';
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
  const [code, setCode] = useState('// Process the model response however you want\n\nconsole.log(agentId, "Response received:", response.substring(0, 100) + "...");\n\n// Example: Extract and save important information to agent memory\nconst infoMatch = response.match(/important information: (.*?)\\./i);\nif (infoMatch && infoMatch[1]) {\n  const info = infoMatch[1].trim();\n  await utilities.updateAgentMemory(agentId, info);\n  console.log(agentId, "Saved to memory:", info);\n}\n\n// You can perform any actions based on the response content');
  const [loopInterval, setLoopInterval] = useState(1.0);
  const [activeTab, setActiveTab] = useState<TabType>('config');
  const [editorIsLoaded, setEditorIsLoaded] = useState(false);
  const [showCodeHelper, setShowCodeHelper] = useState(true);
  const [selectedCodeSnippet, setSelectedCodeSnippet] = useState<string | null>(null);

  const codeSnippets = [
    {
      name: "Remember Response",
      description: "Store the entire response in agent memory",
      code: 'await utilities.updateAgentMemory(agentId, response);\nconsole.log(agentId, "Stored complete response in memory");'
    },
    {
      name: "Read/Write Agent Memory",
      description: "Read memory, append timestamped content, and update another agent",
      code: 'const currentMemory = await utilities.getAgentMemory(agentId);\nconst time = new Date().toISOString();\nconst updatedMemory = `${currentMemory}\\n[${time}] ${response.substring(0, 100)}`;\n\n// Update this agent\'s memory\nawait utilities.updateAgentMemory(agentId, updatedMemory);\n\n// Update another agent\'s memory (replace with actual agent ID)\nawait utilities.updateAgentMemory("activity_tracking_agent", `Agent ${agentId} processed response at ${time}`);'
    },
    {
      name: "Remove Thought Tags",
      description: "Clean response by removing <think>...</think> sections",
      code: 'const cleanedResponse = response.replace(/<think>[\\s\\S]*?<\\/think>/g, \'\');\nconsole.log(agentId, "Cleaned response:", cleanedResponse.substring(0, 100) + "...");\nawait utilities.updateAgentMemory(agentId, cleanedResponse);'
    }
  ];

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

  const insertCodeSnippet = (snippetCode: string) => {
    setCode(code => {
      // Add a newline before the snippet if the code doesn't end with one
      return code + (code.endsWith('\n') ? '' : '\n') + snippetCode;
    });
    setSelectedCodeSnippet(null);
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
    <div className="space-y-6">
      {/* Code Editor */}
      <div className="border border-gray-300 rounded-md overflow-hidden shadow-sm">
        <div className="bg-gray-100 border-b px-3 py-2 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Terminal className="h-4 w-4 text-gray-700" />
            <span className="text-sm font-medium text-gray-700">Agent Code</span>
            <span className="bg-blue-100 text-blue-700 text-xs px-2 py-0.5 rounded">JavaScript</span>
          </div>
          <div className="text-xs text-gray-500">
            {code.length} characters
          </div>
        </div>

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

      {/* New simplified code editor explanation */}
      <div className="bg-blue-50 border border-blue-200 rounded-md p-4 text-sm text-blue-800">
        <h3 className="font-medium text-lg mb-1 flex items-center">
          <Terminal className="h-5 w-5 mr-2" />
          Agent Processing
        </h3>
        <p className="mb-2">Your agent code receives the model's response and can process it any way you want.</p>
        
        <div className="grid grid-cols-2 gap-4 mb-4 border-b border-blue-200 pb-4">
          <div className="col-span-1">
            <h4 className="font-medium mb-1">Available Variables:</h4>
            <ul className="list-disc pl-5 space-y-1">
              <li><code className="bg-blue-100 px-1 rounded">response</code> - Full text from the LLM</li>
              <li><code className="bg-blue-100 px-1 rounded">agentId</code> - Current agent's ID</li>
              <li><code className="bg-blue-100 px-1 rounded">utilities</code> - Helper functions</li>
            </ul>
          </div>
          
          <div className="col-span-1">
            <h4 className="font-medium mb-1">Helper Utilities:</h4>
            <ul className="list-disc pl-5 space-y-1">
              <li><code className="bg-blue-100 px-1 rounded">utilities.getAgentMemory(agentId)</code> - Get current memory</li>
              <li><code className="bg-blue-100 px-1 rounded">utilities.updateAgentMemory(agentId, text)</code> - Update memory</li>
              <li><code className="bg-blue-100 px-1 rounded">utilities.clearAgentMemory(agentId)</code> - Clear memory</li>
            </ul>
          </div>
        </div>

        <div className="flex items-start">
          <div className="bg-gray-800 text-gray-200 rounded-md px-3 py-2 mr-3 font-mono text-xs" style={{ minWidth: "26rem" }}>
            <span className="text-blue-400">// Example:</span><br />
            <span className="text-blue-400">// Log the first part of the response</span><br />
            console.log(agentId, <span className="text-yellow-300">"Got response:"</span>, response.substring(0, 50));<br />
            <br />
            <span className="text-blue-400">// Extract data from the response</span><br />
            <span className="text-purple-400">if</span> (response.includes(<span className="text-yellow-300">"weather is sunny"</span>)) {'{'}<br />
            &nbsp;&nbsp;console.log(agentId, <span className="text-yellow-300">"Found sunny weather!"</span>);<br />
            &nbsp;&nbsp;<span className="text-blue-400">// Save this to the agent's memory</span><br />
            &nbsp;&nbsp;<span className="text-green-400">await</span> utilities.updateAgentMemory(agentId, <span className="text-yellow-300">"Weather: Sunny"</span>);<br />
            {'}'}
          </div>
          
          <div className="text-sm flex-1">
            <p className="font-medium mb-1">Simplified Flow:</p>
            <div className="flex items-center space-x-2">
              <div className="bg-purple-100 text-purple-800 px-2 py-1 rounded-md">LLM Response</div>
              <ArrowRight className="h-4 w-4 text-gray-500" />
              <div className="bg-green-100 text-green-800 px-2 py-1 rounded-md">Your Code</div>
              <ArrowRight className="h-4 w-4 text-gray-500" />
              <div className="bg-blue-100 text-blue-800 px-2 py-1 rounded-md">Do Things with Response</div>
            </div>
          </div>
        </div>
      </div>

      {/* Code Snippets Section */}
      <div className="bg-white border rounded-md shadow-sm">
        <div className="bg-gray-50 px-4 py-3 border-b flex justify-between items-center">
          <h3 className="font-medium">Quick Code Snippets</h3>
          {selectedCodeSnippet ? (
            <div className="flex space-x-2">
              <button 
                onClick={() => setSelectedCodeSnippet(null)}
                className="px-2 py-1 text-xs text-gray-600 bg-gray-200 rounded"
              >
                Cancel
              </button>
              <button 
                onClick={() => {
                  const snippet = codeSnippets.find(s => s.name === selectedCodeSnippet);
                  if (snippet) insertCodeSnippet(snippet.code);
                }}
                className="px-2 py-1 text-xs text-white bg-blue-500 rounded flex items-center"
              >
                <Copy className="h-3 w-3 mr-1" />
                Insert
              </button>
            </div>
          ) : (
            <button 
              onClick={() => setShowCodeHelper(!showCodeHelper)} 
              className="text-sm text-blue-600 hover:text-blue-800"
            >
              {showCodeHelper ? 'Hide Snippets' : 'Show Snippets'}
            </button>
          )}
        </div>
        
        {showCodeHelper && (
          <div className="p-3 grid grid-cols-1 md:grid-cols-3 gap-3">
            {codeSnippets.map((snippet) => (
              <div 
                key={snippet.name}
                className={`border rounded-md p-3 cursor-pointer transition-all duration-200 hover:shadow-md ${
                  selectedCodeSnippet === snippet.name 
                    ? 'border-blue-500 bg-blue-50' 
                    : 'border-gray-200 hover:border-blue-300'
                }`}
                onClick={() => setSelectedCodeSnippet(snippet.name)}
              >
                <div className="flex justify-between items-start mb-1">
                  <h4 className="font-medium text-gray-800">{snippet.name}</h4>
                  <PlayCircle className="h-4 w-4 text-blue-500" />
                </div>
                <p className="text-xs text-gray-600 mb-1">{snippet.description}</p>
                <div className="text-xs text-gray-500 bg-gray-50 p-1 rounded truncate">
                  {snippet.code.split('\n')[0]}...
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white p-6 rounded-lg w-3/4 max-h-[85vh] overflow-y-auto">
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
            className={`px-4 py-2 font-medium flex items-center ${activeTab === 'config' ? 'border-b-2 border-blue-500 text-blue-600' : 'text-gray-500'}`}
            onClick={() => setActiveTab('config')}
          >
            <Settings className="h-4 w-4 mr-1" />
            Configuration
          </button>
          <button
            className={`px-4 py-2 font-medium flex items-center ${activeTab === 'actions' ? 'border-b-2 border-blue-500 text-blue-600' : 'text-gray-500'}`}
            onClick={() => setActiveTab('actions')}
          >
            <Code className="h-4 w-4 mr-1" />
            Context
          </button>
          <button
            className={`px-4 py-2 font-medium flex items-center ${activeTab === 'code' ? 'border-b-2 border-blue-500 text-blue-600' : 'text-gray-500'}`}
            onClick={() => setActiveTab('code')}
          >
            <Terminal className="h-4 w-4 mr-1" />
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
