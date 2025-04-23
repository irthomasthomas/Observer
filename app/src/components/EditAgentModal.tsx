import { useState, useEffect } from 'react'; // Add React import
import { CompleteAgent, downloadAgent } from '@utils/agent_database';
import { Download, Code, Settings, Terminal, ChevronDown, Eye } from 'lucide-react'; // <-- Import Eye icon
import ActionsTab from './ActionsTab';
import CodeTab from './CodeTab';
import { listModels, Model } from '@utils/ollamaServer'; // Import updated Model interface
import { getOllamaServerAddress } from '@utils/main_loop';
import { Logger } from '@utils/logging';

type TabType = 'config' | 'actions' | 'code';

// No need to redefine Model interface here if imported correctly

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
  const [model, setModel] = useState('deepseek-r1'); // Default might change based on available models
  const [systemPrompt, setSystemPrompt] = useState('');
  const [code, setCode] = useState('// Process the model response however you want\n\nconsole.log(agentId, "Response received:", response.substring(0, 100) + "...");');
  const [loopInterval, setLoopInterval] = useState(1.0);
  const [activeTab, setActiveTab] = useState<TabType>('config');
  const [availableModels, setAvailableModels] = useState<Model[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const [modelsError, setModelsError] = useState<string | null>(null);
  const [isModelDropdownOpen, setIsModelDropdownOpen] = useState(false);

  useEffect(() => {
    if (agent) {
      setAgentId(agent.id);
      setName(agent.name);
      setDescription(agent.description);
      setModel(agent.model_name);
      setSystemPrompt(agent.system_prompt);
      setLoopInterval(agent.loop_interval_seconds);
    } else {
      // Reset fields for create mode or if agent is undefined
      setAgentId('');
      setName('');
      setDescription('');
      setModel('deepseek-r1'); // Reset to a sensible default
      setSystemPrompt('');
      setLoopInterval(60.0);
      setCode('// Process the model response however you want\n\nconsole.log(agentId, "Response received:", response.substring(0, 100) + "...");')
    }

    if (existingCode) {
        setCode(existingCode);
    } else if (!agent) { // Only reset code if no agent and no existing code provided
        setCode('// Process the model response however you want\n\nconsole.log(agentId, "Response received:", response.substring(0, 100) + "...");')
    }

    // Fetch available models when the modal opens or agent changes
    fetchAvailableModels();

    // Close dropdown when modal reopens/changes state
    setIsModelDropdownOpen(false);
  }, [agent, existingCode, isOpen]); // Re-run effect if isOpen changes too

  const fetchAvailableModels = async () => {
    setLoadingModels(true);
    setModelsError(null);

    try {
      const { host, port } = getOllamaServerAddress();
      Logger.info('AGENT_EDITOR', `Fetching models from server at ${host}:${port}`);

      const response = await listModels(host, port); // Uses updated listModels

      if (response.error) {
        throw new Error(response.error);
      }

      setAvailableModels(response.models);
      // Set a default model if the current one isn't available or on create mode
      if (createMode || !response.models.some(m => m.name === model)) {
          if (response.models.length > 0) {
              setModel(response.models[0].name); // Default to the first available model
          } else {
              setModel(''); // No models available
          }
      }
      Logger.info('AGENT_EDITOR', `Loaded ${response.models.length} models for selection`);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      setModelsError(errorMessage);
      Logger.error('AGENT_EDITOR', `Failed to fetch models: ${errorMessage}`);
    } finally {
      setLoadingModels(false);
    }
  };

  const handleSave = () => {
    // Basic validation
    if (createMode && !agentId) {
        alert("Agent ID cannot be empty.");
        return;
    }
     if (!name) {
        alert("Agent Name cannot be empty.");
        return;
    }
     if (!model) {
        alert("Please select or enter a model.");
        return;
    }

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
    onClose(); // Close modal after saving
  };

  const handleExport = async () => {
    if (!agentId) return; // Should not happen if button is shown correctly
    try {
      await downloadAgent(agentId);
    } catch (error) {
      Logger.error('AGENT_EDITOR', `Failed to export agent: ${error}`);
      alert(`Failed to export agent: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  // Find details of the currently selected model for display
  const selectedModelDetails = availableModels.find(m => m.name === model);
  const selectedModelParamSize = selectedModelDetails?.parameterSize;
  const selectedModelMultimodal = selectedModelDetails?.multimodal ?? false;

  const renderConfigTab = () => (
    <>
      {createMode && (
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">Agent ID</label>
          <input
            type="text"
            value={agentId}
            onChange={(e) => setAgentId(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
            className="w-full p-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
            placeholder="my_custom_agent"
            required // Added basic required attribute
          />
          <p className="text-xs text-gray-500 mt-1">Lowercase letters, numbers, and underscores only. Cannot be changed later.</p>
        </div>
      )}

      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full p-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
          placeholder="Enter agent name"
           required
        />
      </div>

      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="w-full p-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
          rows={2}
          placeholder="Optional: Describe what this agent does"
        />
      </div>

      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700 mb-1">Model</label>
        <div className="relative">
          <button
            type="button"
            className="w-full p-2 border border-gray-300 rounded-md shadow-sm bg-white text-left flex items-center justify-between focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            onClick={() => setIsModelDropdownOpen(!isModelDropdownOpen)}
             disabled={loadingModels || !!modelsError} // Disable if loading or error
          >
            {/* Display selected model name, param size, and multimodal icon */}
            <div className="flex items-center flex-wrap">
              <span className="mr-2">{model || "Select a model..."}</span>
              {selectedModelParamSize && selectedModelParamSize !== "N/A" && (
                <span className="mr-2 text-xs font-medium text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
                  {selectedModelParamSize}
                </span>
              )}
              {selectedModelMultimodal && (
                  <span title="Supports Multimodal Input" className="inline-block text-xs font-medium text-purple-600 bg-purple-100 px-2 py-0.5 rounded">
                    <Eye className="h-3.5 w-3.5 inline-block mr-1 -mt-px" />
                    Vision
                  </span>
              )}
            </div>
            <ChevronDown className={`h-5 w-5 text-gray-400 transition-transform ${isModelDropdownOpen ? 'transform rotate-180' : ''}`} />
          </button>

          {isModelDropdownOpen && (
            <div className="absolute z-10 mt-1 w-full max-h-60 overflow-auto bg-white border border-gray-200 rounded-md shadow-lg">
              <div className="p-2 border-b border-gray-200">
                <input
                  type="text"
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  placeholder="Search or enter custom model name"
                  className="w-full p-1.5 border border-gray-300 rounded text-sm focus:ring-blue-500 focus:border-blue-500"
                  onClick={(e) => e.stopPropagation()} // Prevent closing dropdown when clicking input
                />
              </div>

              {loadingModels ? (
                <div className="p-3 text-center text-sm text-gray-500">Loading models...</div>
              ) : modelsError ? (
                <div className="p-3 text-center text-sm text-red-600">
                  Error loading models: {modelsError}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      fetchAvailableModels();
                    }}
                    className="block mx-auto mt-1 text-blue-600 hover:underline text-xs font-medium"
                  >
                    Retry
                  </button>
                </div>
              ) : availableModels.length === 0 ? (
                <div className="p-3 text-center text-sm text-gray-500">No models available on server.</div>
              ) : (
                <div className="py-1">
                  {availableModels.map((availableModel) => (
                    <button
                      key={availableModel.name}
                      className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-100 flex items-center justify-between ${model === availableModel.name ? 'bg-blue-50 font-medium' : ''}`}
                      onClick={() => {
                        setModel(availableModel.name);
                        setIsModelDropdownOpen(false);
                      }}
                      type="button" // Ensure it's not treated as a submit button
                    >
                      {/* Display model name */}
                      <span className="mr-2">{availableModel.name}</span>
                      {/* Display param size and multimodal icon together */}
                      <div className="flex items-center flex-shrink-0 space-x-1.5">
                        {availableModel.parameterSize && availableModel.parameterSize !== "N/A" && (
                            <span className="text-xs font-medium text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">
                            {availableModel.parameterSize}
                          </span>
                        )}
                        {availableModel.multimodal && (
                           <span title="Supports Multimodal Input" className="inline-flex items-center text-xs font-medium text-purple-600 bg-purple-100 px-1.5 py-0.5 rounded">
                             <Eye className="h-3 w-3 mr-0.5" />
                           </span>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
        {!loadingModels && !modelsError && availableModels.length > 0 && (
          <p className="text-xs text-gray-500 mt-1">
            {availableModels.length} models available from your server. You can also type a custom model name.
          </p>
        )}
         {!loadingModels && !modelsError && availableModels.length === 0 && (
          <p className="text-xs text-yellow-600 mt-1">
            No models detected on the server. You can enter a custom model name manually.
          </p>
        )}
      </div>

      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700 mb-1">Loop Interval (seconds)</label>
        <div>
          <input
            type="number"
            value={loopInterval}
            onChange={(e) => setLoopInterval(Math.max(0.1, parseFloat(e.target.value) || 1.0))} // Ensure it's a number and >= 0.1
            className="w-full p-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
            min="0.1"
            step="0.1"
          />
          <p className="text-xs text-gray-500 mt-1">Minimum time between automated agent executions (e.g., 0.5, 1, 10).</p>
        </div>
      </div>
    </>
  );

  // Outer modal structure remains mostly the same
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4">
       {/* Added click outside to close */}
      <div className="bg-white rounded-lg shadow-xl w-full max-w-3xl max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
         {/* Header */}
        <div className="flex justify-between items-center p-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-800">{createMode ? 'Create New Agent' : 'Edit Agent'}</h2>
          {(!createMode && agentId) && (
            <button
              onClick={handleExport}
              className="flex items-center space-x-1 px-3 py-1 bg-gray-100 text-gray-600 rounded text-xs hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              title="Export agent configuration and code"
            >
              <Download className="h-3.5 w-3.5" />
              <span>Export</span>
            </button>
          )}
        </div>

         {/* Tabs */}
        <div className="flex border-b border-gray-200 px-4">
          {/* Tab Buttons - slightly restyled */}
          {(['config', 'actions', 'code'] as TabType[]).map((tab) => {
              const icons = { config: Settings, actions: Code, code: Terminal };
              const labels = { config: 'Configuration', actions: 'Context', code: 'Code' };
              const IconComponent = icons[tab];
              return (
                <button
                  key={tab}
                  className={`px-3 py-2.5 text-sm font-medium flex items-center border-b-2 transition-colors duration-150 ${
                    activeTab === tab
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                  onClick={() => setActiveTab(tab)}
                >
                  <IconComponent className="h-4 w-4 mr-1.5" />
                  {labels[tab]}
                </button>
              );
            })}
        </div>

         {/* Tab Content - Scrollable Area */}
         <div className="p-5 overflow-y-auto flex-grow">
            {activeTab === 'config' && renderConfigTab()}
            {activeTab === 'actions' && (
                <ActionsTab
                systemPrompt={systemPrompt}
                onSystemPromptChange={setSystemPrompt}
                />
            )}
            {activeTab === 'code' && (
                <CodeTab
                // Use a placeholder ID if creating, otherwise the actual agent ID
                agentId={agentId || (createMode ? 'new_agent' : 'unknown_agent')}
                code={code}
                systemPrompt={systemPrompt}
                model={model}
                onCodeChange={setCode}
                />
            )}
         </div>


        {/* Footer Buttons */}
        <div className="flex justify-end space-x-3 p-4 border-t border-gray-200 bg-gray-50 rounded-b-lg">
          <button
            onClick={onClose}
            type="button"
            className="px-4 py-2 bg-white border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            type="button"
            className="px-4 py-2 bg-blue-600 border border-transparent rounded-md text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
             // Simple disable condition example
            disabled={ (createMode && !agentId) || !name || !model }
          >
            {createMode ? 'Create Agent' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default EditAgentModal;
