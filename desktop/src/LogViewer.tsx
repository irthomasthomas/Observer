import { useState, useEffect, useRef } from 'react';
import { ChevronDown, ChevronUp, RefreshCw, Pause, Play } from 'lucide-react';
import './styles/logviewer.css';

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
  const [autoRefresh, setAutoRefresh] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  const fetchLogs = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const response = await fetch(`http://localhost:8000/agents/${agentId}/logs?days=1`);
      if (!response.ok) throw new Error('Failed to fetch logs');
      const data = await response.json();
      if ('error' in data) throw new Error(data.error);
      
      const filteredLogs = data
        .filter((log: Log) => viewType === 'cot' ? log.type === 'cot' : log.type === 'action')
        .slice(0, 15);
      
      setLogs(filteredLogs);
      
      if (scrollRef.current) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch logs');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (viewType) {
      fetchLogs();
      let intervalId: number | undefined;
      
      if (autoRefresh) {
        intervalId = window.setInterval(fetchLogs, 2000);
      }
      
      return () => {
        if (intervalId !== undefined) {
          window.clearInterval(intervalId);
        }
      };
    }
  }, [viewType, agentId, autoRefresh]);

  const handleViewToggle = (type: 'logs' | 'cot') => {
    setViewType(viewType === type ? null : type);
  };

  const toggleAutoRefresh = () => {
    setAutoRefresh(!autoRefresh);
  };

  const extractThinkContent = (message: string) => {
    const thinkMatch = message.match(/<think>([\s\S]*?)<\/think>/);
    return thinkMatch ? thinkMatch[1].trim() : message;
  };

  return (
    <div className="log-viewer">
      <div className="log-controls">
        <button 
          onClick={() => handleViewToggle('logs')}
          className={`log-button logs ${viewType === 'logs' ? 'active' : ''}`}
        >
          {viewType === 'logs' ? <ChevronUp /> : <ChevronDown />}
          <span>{viewType === 'logs' ? 'Hide' : 'Show'} Actions</span>
        </button>
        
        <button 
          onClick={() => handleViewToggle('cot')}
          className={`log-button cot ${viewType === 'cot' ? 'active' : ''}`}
        >
          {viewType === 'cot' ? <ChevronUp /> : <ChevronDown />}
          <span>{viewType === 'cot' ? 'Hide' : 'Show'} CoT</span>
        </button>

        {viewType && (
          <div className="refresh-controls">
            <button
              onClick={fetchLogs}
              className={`refresh-button ${isLoading ? 'spinning' : ''}`}
              disabled={isLoading}
            >
              <RefreshCw className="w-5 h-5" />
            </button>
            <button
              onClick={toggleAutoRefresh}
              className={`auto-refresh-button ${autoRefresh ? 'active' : ''}`}
              title={autoRefresh ? 'Disable auto-refresh' : 'Enable auto-refresh'}
            >
              {autoRefresh ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
            </button>
          </div>
        )}
      </div>
      
      {error && (
        <div className="error-message">
          Error: {error}
        </div>
      )}

      {viewType && (
        <div ref={scrollRef} className="logs-container">
          {logs.length === 0 ? (
            <div className="no-logs">
              No {viewType === 'cot' ? 'Chain of Thought' : 'logs'} available
            </div>
          ) : (
            [...logs].reverse().map((log, index) => (
              <div 
                key={index} 
                className={`log-entry ${viewType === 'cot' ? 'cot' : ''}`}
              >
                <div className="log-timestamp">
                  [{log.timestamp}]
                </div>
                <div className={`log-message ${viewType === 'cot' ? 'cot' : ''}`}>
                  {viewType === 'cot' ? extractThinkContent(log.message) : log.message}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};

export default LogViewer;
