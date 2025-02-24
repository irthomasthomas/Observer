import { useState, useEffect } from 'react';
import { CompleteAgent } from '../utils/agent_database';

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
  const [code, setCode] = useState('console.log("Hello, I am an agent");');
  const [loopInterval, setLoopInterval] = useState(1.0);

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

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white p-6 rounded-lg w-2/3 max-h-[80vh] overflow-y-auto">
        <h2 className="text-xl font-bold mb-4">{createMode ? 'Create Agent' : 'Edit Agent'}</h2>
        
        {createMode && (
          <div className="mb-4">
            <label className="block mb-1">Agent ID</label>
            <input 
              type="text" 
              value={agentId} 
              onChange={(e) => setAgentId(e.target.value)} 
              className="w-full p-2 border rounded"
              placeholder="agent_id"
            />
            <p className="text-sm text-gray-500">Use only letters, numbers, and underscores</p>
          </div>
        )}
        
        <div className="mb-4">
          <label className="block mb-1">Name</label>
          <input 
            type="text" 
            value={name} 
            onChange={(e) => setName(e.target.value)} 
            className="w-full p-2 border rounded"
          />
        </div>
        
        <div className="mb-4">
          <label className="block mb-1">Description</label>
          <textarea 
            value={description} 
            onChange={(e) => setDescription(e.target.value)} 
            className="w-full p-2 border rounded"
            rows={2}
          />
        </div>
        
        <div className="mb-4">
          <label className="block mb-1">Model</label>
          <input 
            type="text" 
            value={model} 
            onChange={(e) => setModel(e.target.value)} 
            className="w-full p-2 border rounded"
          />
        </div>

        <div className="mb-4">
          <label className="block mb-1">Loop Interval (seconds)</label>
          <input 
            type="number" 
            value={loopInterval} 
            onChange={(e) => setLoopInterval(parseFloat(e.target.value))} 
            className="w-full p-2 border rounded"
            min="0.1"
            step="0.1"
          />
        </div>
        
        <div className="mb-4">
          <label className="block mb-1">System Prompt</label>
          <textarea 
            value={systemPrompt} 
            onChange={(e) => setSystemPrompt(e.target.value)} 
            className="w-full p-2 border rounded"
            rows={4}
          />
        </div>
        
        <div className="mb-4">
          <label className="block mb-1">Code</label>
          <textarea 
            value={code} 
            onChange={(e) => setCode(e.target.value)} 
            className="w-full p-2 border rounded font-mono"
            rows={10}
          />
        </div>
        
        <div className="flex justify-end space-x-4">
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
            Save
          </button>
        </div>
      </div>
    </div>
  );
};

export default EditAgentModal;
