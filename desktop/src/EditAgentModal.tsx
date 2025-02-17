import { useState, useEffect } from 'react';
import { X } from 'lucide-react';

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
}

const EditAgentModal = ({ agentId, isOpen, onClose, onUpdate }: EditAgentModalProps) => {
  const [config, setConfig] = useState<AgentConfig>({
    name: '',
    description: '',
    model_name: '',
    system_prompt: ''
  });
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'config' | 'code'>('config');

  useEffect(() => {
    if (isOpen) {
      fetchConfig();
      fetchCode();
    }
  }, [isOpen, agentId]);

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsLoading(true);
      
      // Update configuration
      const configResponse = await fetch(`http://localhost:8000/agents/${agentId}/config`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(config),
      });
      
      if (!configResponse.ok) {
        const data = await configResponse.json();
        throw new Error(data.error || 'Failed to update configuration');
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
            className={`tab-button ${activeTab === 'code' ? 'active' : ''}`}
            onClick={() => setActiveTab('code')}
          >
            Code
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          {activeTab === 'config' ? (
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
            </>
          ) : (
            <div className="form-group">
              <label>Agent Code</label>
              <textarea
                value={code}
                onChange={(e) => setCode(e.target.value)}
                rows={20}
                disabled={isLoading}
                style={{ fontFamily: 'monospace', fontSize: '14px' }}
              />
            </div>
          )}

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
