import { useState, useEffect, useRef } from 'react';
import { ChevronDown, ChevronUp, RefreshCw } from 'lucide-react';

interface Log {
  timestamp: string;
  message: string;
  type: 'cot' | 'action';
}

interface LogViewerProps {
  agentId: string;
}

const LogViewer = ({ agentId }: LogViewerProps) => {
  const [logs, setLogs] = useState<Log[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewType, setViewType] = useState<'logs' | 'cot' | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const MAX_LOGS = 15;

  const fetchLogs = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const response = await fetch(`http://localhost:8000/agents/${agentId}/logs?days=1`);
      if (!response.ok) throw new Error('Failed to fetch logs');
      const data = await response.json();
      if ('error' in data) throw new Error(data.error);
      
      const filteredLogs = data.filter((log: Log) => 
        viewType === 'cot' ? log.type === 'cot' : log.type === 'action'
      );
      setLogs(filteredLogs.slice(0, MAX_LOGS));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch logs');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (viewType) {
      fetchLogs();
      const interval = setInterval(fetchLogs, 2000);
      return () => clearInterval(interval);
    }
  }, [viewType]);

  const handleViewToggle = (type: 'logs' | 'cot') => {
    if (viewType === type) {
      setViewType(null);
    } else {
      setViewType(type);
    }
  };

  return (
    <div className="log-viewer">
      <div className="log-controls">
        <button 
          onClick={() => handleViewToggle('logs')}
          className={`control-button ${viewType === 'logs' ? 'active' : ''}`}
        >
          {viewType === 'logs' ? (
            <ChevronUp className="icon" />
          ) : (
            <ChevronDown className="icon" />
          )}
          <span>{viewType === 'logs' ? 'Hide' : 'Show'} Logs</span>
        </button>
        
        <button 
          onClick={() => handleViewToggle('cot')}
          className={`control-button cot ${viewType === 'cot' ? 'active' : ''}`}
        >
          {viewType === 'cot' ? (
            <ChevronUp className="icon" />
          ) : (
            <ChevronDown className="icon" />
          )}
          <span>{viewType === 'cot' ? 'Hide' : 'Show'} CoT</span>
        </button>

        {viewType && (
          <button
            onClick={fetchLogs}
            className={`refresh-button ${isLoading ? 'spinning' : ''}`}
            disabled={isLoading}
          >
            <RefreshCw className="icon" />
          </button>
        )}
      </div>
      
      {viewType && error && (
        <div className="error-message">
          Error: {error}
        </div>
      )}

      {viewType && (
        <div ref={scrollRef} className="logs-container">
          <div className="logs-content">
            {[...logs].reverse().map((log, index) => (
              <div 
                key={index} 
                className={`log-entry ${viewType === 'cot' ? 'cot' : ''}`}
              >
                <div className="log-timestamp">[{log.timestamp}]</div>
                <div className="log-message">
                  {log.message}
                </div>
              </div>
            ))}
            {logs.length === 0 && !isLoading && (
              <div className="no-logs">
                No {viewType === 'cot' ? 'Chain of Thought' : 'logs'} available
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default LogViewer;
