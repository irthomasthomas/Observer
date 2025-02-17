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
}

const EditAgentModal = ({ agentId, isOpen, onClose, onUpdate }: EditAgentModalProps) => {
  const [config, setConfig] = useState<AgentConfig>({
    name: '',
    description: '',
    model_name: ''
  });
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      fetchConfig();
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsLoading(true);
      const response = await fetch(`http://localhost:8000/agents/${agentId}/config`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(config),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to update configuration');
      }

      onUpdate();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update configuration');
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-backdrop">
      <div className="modal-content">
        <div className="modal-header">
          <h2>Edit Agent Configuration</h2>
          <button onClick={onClose} className="close-button">
            <X size={20} />
          </button>
        </div>
        
        {error && (
          <div className="error-message">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
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
              rows={3}
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
