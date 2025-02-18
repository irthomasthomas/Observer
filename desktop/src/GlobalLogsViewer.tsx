import { useState, useEffect, useRef } from 'react';
import { RefreshCw, Pause, Play, X } from 'lucide-react';
import './styles/globallogviewer.css';

interface LogEntry {
  timestamp: string;
  level: string;
  message: string;
}

interface GlobalLogsViewerProps {
  isOpen: boolean;
  onClose: () => void;
}

const GlobalLogsViewer = ({ isOpen, onClose }: GlobalLogsViewerProps) => {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [filter, setFilter] = useState("");

  const fetchLogs = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const response = await fetch(`http://localhost:8000/logs?lines=100`);
      if (!response.ok) throw new Error('Failed to fetch logs');
      const data = await response.json();
      if ('error' in data) throw new Error(data.error);
      
      setLogs(data);
      
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
    if (isOpen) {
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
  }, [isOpen, autoRefresh]);

  const toggleAutoRefresh = () => {
    setAutoRefresh(!autoRefresh);
  };

  // Filter logs based on user input
  const filteredLogs = logs.filter(log => 
    log.message.toLowerCase().includes(filter.toLowerCase()) ||
    log.level.toLowerCase().includes(filter.toLowerCase())
  );

  if (!isOpen) return null;

  return (
    <div className="global-logs-viewer">
      <div className="logs-header">
        <h2>Server Logs</h2>
        <div className="logs-controls">
          <input
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter logs..."
            className="logs-filter"
          />
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
            <button onClick={onClose} className="close-button">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>
      
      {error && (
        <div className="error-message">
          Error: {error}
        </div>
      )}

      <div ref={scrollRef} className="global-logs-container">
        {filteredLogs.length === 0 ? (
          <div className="no-logs">
            No logs available
          </div>
        ) : (
          filteredLogs.map((log, index) => (
            <div 
              key={index} 
              className={`global-log-entry ${log.level.toLowerCase()}`}
            >
              <div className="log-timestamp">
                {log.timestamp}
              </div>
              <div className="log-level">
                {log.level}
              </div>
              <div className="log-message">
                {log.message}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default GlobalLogsViewer;
