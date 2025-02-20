import { useState, useEffect, lazy, Suspense } from 'react';
import { X, PlusCircle } from 'lucide-react';
import './styles/modal.css';

// Lazy load only the CodeMirror component, not the extensions
const LazyCodeMirror = lazy(() => import('@uiw/react-codemirror'));

// Import extensions normally
import { python } from '@codemirror/lang-python';
import { vscodeDark } from '@uiw/codemirror-theme-vscode';

interface EditAgentModalProps {
  agentId: string | null;
  isOpen: boolean;
  isCreateMode?: boolean;
  onClose: () => void;
  onUpdate: () => void;
}

interface AgentConfig {
  name: string;
  description: string;
  model_name: string;
  system_prompt: string;
  loop_interval_seconds: number;
}

interface CreateAgentRequest {
  agent_id: string;
  config: AgentConfig;
  code: string;
  commands: string;
}

type TabType = 'config' | 'actions';


const DEFAULT_SYSTEM_PROMPT = `You are an AI assistant. Observe the screen and help the user.

Respond with one of these commands:
COMMAND: <tell the agent what to write on the command>`;

const DEFAULT_AGENT_CODE = `from core.base_agent import BaseAgent

class CustomAgent(BaseAgent):
    """A custom agent implementation"""
    def init(self, host="127.0.0.1", agent_model="deepseek-r1:7b"):
        super().__init__(agent_name="{agent_id}", host=host, agent_model=agent_model)`;

const DEFAULT_COMMAND_TEMPLATE = `from core.commands import command

@command("COMMAND")

def what_the_command_does(agent, line):
    """Handle the command, Agent passes argument 'line' """
    print(line)

`;


// Loading fallback component
const EditorLoading = () => (
  <div className="editor-loading" style={{
    padding: '20px',
    border: '1px solid #ccc',
    borderRadius: '4px',
    textAlign: 'center',
    backgroundColor: '#f8f8f8',
    height: '300px',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center'
  }}>
    <div className="loading-spinner" style={{
      border: '4px solid #f3f3f3',
      borderTop: '4px solid #3498db',
      borderRadius: '50%',
      width: '30px',
      height: '30px',
      animation: 'spin 1s linear infinite',
      marginBottom: '10px'
    }}></div>
    <p>Loading editor...</p>
    <style>{`
      @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
      }
    `}</style>
  </div>
);

const EditAgentModal = ({ agentId, isOpen, isCreateMode = false, onClose, onUpdate }: EditAgentModalProps) => {
  const [config, setConfig] = useState<AgentConfig>({
    name: '',
    description: '',
    model_name: 'deepseek-r1:8b',
    system_prompt: DEFAULT_SYSTEM_PROMPT,
    loop_interval_seconds: 1.0
  });
  const [agentIdInput, setAgentIdInput] = useState('');
  const [code, setCode] = useState('');
  const [commands, setCommands] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>('config');
  const [editorIsLoaded, setEditorIsLoaded] = useState(false);

  useEffect(() => {
    if (isOpen) {
      if (isCreateMode) {
        // Set defaults for new agent
        setConfig({
          name: 'New Agent',
          description: 'A custom agent',
          model_name: 'deepseek-r1:8b',
          system_prompt: DEFAULT_SYSTEM_PROMPT,
          loop_interval_seconds: 1.0
        });
        setAgentIdInput('');
        setCommands(DEFAULT_COMMAND_TEMPLATE);
        setCode(DEFAULT_AGENT_CODE.replace('{agent_id}', ''));
        setActiveTab('config');
      } else {
        // Fetch existing agent data
        fetchConfig();
        fetchCode();
        fetchCommands();
      }
    }
  }, [isOpen, agentId, isCreateMode]);

  useEffect(() => {
    // Update the code template when agent ID changes in create mode
    if (isCreateMode) {
      setCode(DEFAULT_AGENT_CODE.replace('{agent_id}', agentIdInput));
    }
  }, [agentIdInput, isCreateMode]);

  // Preload editor component when switching to actions tab
  useEffect(() => {
    if (activeTab === 'actions' && !editorIsLoaded) {
      // This will trigger the lazy loading
      import('@uiw/react-codemirror').then(() => {
        setEditorIsLoaded(true);
      });
    }
  }, [activeTab, editorIsLoaded]);

  const fetchConfig = async () => {
    if (!agentId) return;
    
    try {
      setIsLoading(true);
      const response = await fetch(`http://localhost:8000/agents/${agentId}/config`);
      if (!response.ok) throw new Error('Failed to fetch configuration');
      const data = await response.json();
      setConfig(data);
      setError(null);
    } catch (err) {
      setError('Failed to load agent configuration');
    } finally {
      setIsLoading(false);
    }
  };

  const fetchCode = async () => {
    if (!agentId) return;
    
    try {
      setIsLoading(true);
      const response = await fetch(`http://localhost:8000/agents/${agentId}/code`);
      if (!response.ok) throw new Error('Failed to fetch agent code');
      const data = await response.json();
      setCode(data.code);
      setError(null);
    } catch (err) {
      setError('Failed to load agent code');
    } finally {
      setIsLoading(false);
    }
  };

  const fetchCommands = async () => {
    if (!agentId) return;
    
    try {
      setIsLoading(true);
      const response = await fetch(`http://localhost:8000/agents/${agentId}/commands`);
      if (!response.ok) throw new Error('Failed to fetch agent commands');
      const data = await response.json();
      setCommands(data.commands || DEFAULT_COMMAND_TEMPLATE);
      setError(null);
    } catch (err) {
      setError('Failed to load agent commands');
    } finally {
      setIsLoading(false);
    }
  };

  const validateForm = () => {
    if (isCreateMode && !agentIdInput) {
      setError('Agent ID is required');
      return false;
    }
    
    if (isCreateMode && !/^[a-z0-9_]+$/.test(agentIdInput)) {
      setError('Agent ID can only contain lowercase letters, numbers, and underscores');
      return false;
    }
    
    if (!config.name) {
      setError('Agent name is required');
      return false;
    }
    
    if (!config.model_name) {
      setError('Model name is required');
      return false;
    }
    
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) {
      return;
    }
    
    try {
      setIsLoading(true);
      
      // Create validated config with minimum loop interval
      const validatedConfig = {
        ...config,
        loop_interval_seconds: Math.max(0.1, config.loop_interval_seconds || 0.1)
      };
      
      if (isCreateMode) {
        // Create new agent
        const createData: CreateAgentRequest = {
          agent_id: agentIdInput,
          config: validatedConfig,
          code: code,
          commands: commands
        };
        
        const createResponse = await fetch('http://localhost:8000/agents/create', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(createData),
        });
        
        if (!createResponse.ok) {
          const data = await createResponse.json();
          throw new Error(data.error || 'Failed to create agent');
        }
      } else if (agentId) {
        // Update existing agent
        // Update configuration
        const configResponse = await fetch(`http://localhost:8000/agents/${agentId}/config`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(validatedConfig),
        });
        
        if (!configResponse.ok) {
          const data = await configResponse.json();
          throw new Error(data.error || 'Failed to update configuration');
        }

        // Update commands
        const commandsResponse = await fetch(`http://localhost:8000/agents/${agentId}/commands`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ commands }),
        });

        if (!commandsResponse.ok) {
          const data = await commandsResponse.json();
          throw new Error(data.error || 'Failed to update commands');
        }

        // Update code
        const codeResponse = await fetch(`http://localhost:8000/agents/${agentId}/code`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ code }),
        });

        if (!codeResponse.ok) {
          const data = await codeResponse.json();
          throw new Error(data.error || 'Failed to update code');
        }
      }

      onUpdate();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update agent');
    } finally {
      setIsLoading(false);
    }
  };

  const renderConfigTab = () => (
    <>
      {isCreateMode && (
        <div className="form-group">
          <label>Agent ID <span className="required">*</span></label>
          <div className="input-with-help">
            <input
              type="text"
              value={agentIdInput}
              onChange={(e) => setAgentIdInput(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
              disabled={isLoading}
              placeholder="my_custom_agent"
              required
            />
            <span className="help-text">
              Lowercase letters, numbers, and underscores only
            </span>
          </div>
        </div>
      )}

      <div className="form-group">
        <label>Name <span className="required">*</span></label>
        <input
          type="text"
          value={config.name}
          onChange={(e) => setConfig({ ...config, name: e.target.value })}
          disabled={isLoading}
          placeholder="Enter agent name"
          required
        />
      </div>

      <div className="form-group">
        <label>Description</label>
        <textarea
          value={config.description}
          onChange={(e) => setConfig({ ...config, description: e.target.value })}
          rows={2}
          disabled={isLoading}
          placeholder="Enter agent description"
        />
      </div>

      <div className="form-group">
        <label>Model Name <span className="required">*</span></label>
        <input
          type="text"
          value={config.model_name}
          onChange={(e) => setConfig({ ...config, model_name: e.target.value })}
          disabled={isLoading}
          placeholder="Enter model name"
          required
        />
      </div>

      <div className="form-group">
        <label>Loop Interval (seconds)</label>
        <div className="input-with-help">
          <input
            type="number"
            value={config.loop_interval_seconds}
            onChange={(e) => {
              setConfig({ 
                ...config, 
                loop_interval_seconds: Number(e.target.value)
              });
            }}
            disabled={isLoading}
            className="number-input"
            min="0.1"
            step="0.1"
          />
          <span className="help-text">
            Time between agent executions
          </span>
        </div>
      </div>
    </>
  );

  const renderActionsTab = () => (
    <>
      <div className="form-group">
        <label>System Prompt</label>
        <textarea
          value={config.system_prompt}
          onChange={(e) => setConfig({ ...config, system_prompt: e.target.value })}
          rows={8}
          disabled={isLoading}
          placeholder="Enter system prompt"
          style={{ fontFamily: 'monospace', fontSize: '14px' }}
        />
      </div>
      
      <div className="form-group command-editor">
        <div className="command-header">
          <label>Commands</label>
          {!isCreateMode && (
            <button 
              type="button"
              className="add-command-button"
              onClick={() => setCommands(DEFAULT_COMMAND_TEMPLATE)}
              disabled={isLoading}
            >
              <PlusCircle size={16} /> Reset to Default
            </button>
          )}
        </div>
        <Suspense fallback={<EditorLoading />}>
          <LazyCodeMirror
            value={commands}
            height="300px"
            theme={vscodeDark}
            extensions={[python()]}
            onChange={(value) => setCommands(value)}
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
    <div className="modal-backdrop">
      <div className="modal-content">
        <div className="modal-header">
          <h2>{isCreateMode ? 'Create New Agent' : 'Edit Agent'}</h2>
          <button onClick={onClose} className="close-button">
            <X size={20} />
          </button>
        </div>
        
        {error && (
          <div className="error-message">
            {error}
          </div>
        )}

        <div className="tab-buttons">
          <button
            className={`tab-button ${activeTab === 'config' ? 'active' : ''}`}
            onClick={() => setActiveTab('config')}
          >
            Configuration
          </button>
          <button
            className={`tab-button ${activeTab === 'actions' ? 'active' : ''}`}
            onClick={() => setActiveTab('actions')}
          >
            Actions
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          {activeTab === 'config' && renderConfigTab()}
          {activeTab === 'actions' && renderActionsTab()}

          <div className="button-group">
            <button
              type="button"
              onClick={onClose}
              className="button secondary"
              disabled={isLoading}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="button primary"
              disabled={isLoading}
            >
              {isLoading ? (isCreateMode ? 'Creating...' : 'Saving...') : (isCreateMode ? 'Create Agent' : 'Save Changes')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default EditAgentModal;
