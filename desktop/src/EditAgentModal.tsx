import { useState, useEffect } from 'react';
import { X, PlusCircle } from 'lucide-react';
import CodeMirror from '@uiw/react-codemirror';
import { python } from '@codemirror/lang-python';
import { vscodeDark } from '@uiw/codemirror-theme-vscode';
import './styles/modal.css';

interface EditAgentModalProps {
  agentId: string;
  isOpen: boolean;
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

type TabType = 'config' | 'actions' | 'code';

const DEFAULT_COMMAND_TEMPLATE = `from core.commands import command
from datetime import datetime

""" WRITE THE COMMANDS FOR YOUR AGENT HERE! """

@command("COMMAND")
def handle_command(agent, line):
    """Handle the command with the given line"""
    # Your command logic here, the model passes the 'line' argument
    pass

"""
# Example to have your Agent write the activity
@command("ACTIVITY")
def handle_activity(agent, line):
    """Handles ACTIVITY command"""
    timestamp = datetime.now().strftime("%I:%M%p").lower()
    with open(agent.activity_file, "a") as f:
        f.write(f"{timestamp}: {line}\n")
"""
`;

const EditAgentModal = ({ agentId, isOpen, onClose, onUpdate }: EditAgentModalProps) => {
  const [config, setConfig] = useState<AgentConfig>({
    name: '',
    description: '',
    model_name: '',
    system_prompt: '',
    loop_interval_seconds: 1.0
  });
  const [code, setCode] = useState('');
  const [commands, setCommands] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>('config');

  const fetchConfig = async () => {
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

  useEffect(() => {
    if (isOpen) {
      fetchConfig();
      fetchCode();
      fetchCommands();
    }
  }, [isOpen, agentId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsLoading(true);
      
      // Create validated config with minimum loop interval
      const validatedConfig = {
        ...config,
        loop_interval_seconds: Math.max(0.1, config.loop_interval_seconds || 0.1)
      };
      
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
      <div className="form-group">
        <label>Name</label>
        <input
          type="text"
          value={config.name}
          onChange={(e) => setConfig({ ...config, name: e.target.value })}
          disabled={isLoading}
          placeholder="Enter agent name"
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
        <label>Model Name</label>
        <input
          type="text"
          value={config.model_name}
          onChange={(e) => setConfig({ ...config, model_name: e.target.value })}
          disabled={isLoading}
          placeholder="Enter model name"
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
          <button 
            type="button"
            className="add-command-button"
            onClick={() => setCommands(DEFAULT_COMMAND_TEMPLATE)}
            disabled={isLoading}
          >
            <PlusCircle size={16} /> New Command
          </button>
        </div>
        <CodeMirror
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
      </div>
    </>
  );

  const renderCodeTab = () => (
    <div className="form-group code-editor">
      <label>Agent Code</label>
      <CodeMirror
        value={code}
        height="500px"
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
    </div>
  );

  if (!isOpen) return null;

  return (
    <div className="modal-backdrop">
      <div className="modal-content">
        <div className="modal-header">
          <h2>Edit Agent</h2>
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
          <button
            className={`tab-button ${activeTab === 'code' ? 'active' : ''}`}
            onClick={() => setActiveTab('code')}
          >
            Code
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          {activeTab === 'config' && renderConfigTab()}
          {activeTab === 'actions' && renderActionsTab()}
          {activeTab === 'code' && renderCodeTab()}

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
              {isLoading ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default EditAgentModal;
