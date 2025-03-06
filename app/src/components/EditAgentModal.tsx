import { useState, useEffect } from 'react';
import { CompleteAgent, downloadAgent } from '@utils/agent_database';
import { Download, Code, Settings, Terminal } from 'lucide-react';
import ActionsTab from './ActionsTab';
import CodeTab from './CodeTab';

type TabType = 'config' | 'actions' | 'code';

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
          {activeTab === 'code' && (
            <CodeTab
              agentId={agentId || 'test-agent'}
              code={code}
              systemPrompt={systemPrompt}
              model={model}
              onCodeChange={setCode}
            />
          )}
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
