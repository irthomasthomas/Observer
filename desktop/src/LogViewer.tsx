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
      
      // Filter logs based on view type
      const filteredLogs = data
        .filter((log: Log) => viewType === 'cot' ? log.type === 'cot' : log.type === 'action')
        .slice(0, MAX_LOGS);
      
      setLogs(filteredLogs);
      
      // Auto-scroll to bottom for new logs
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
      const interval = setInterval(fetchLogs, 2000);
      return () => clearInterval(interval);
    }
  }, [viewType, agentId]);

  const handleViewToggle = (type: 'logs' | 'cot') => {
    setViewType(viewType === type ? null : type);
  };

  // Extract content between <think> tags
  const extractThinkContent = (message: string) => {
    const thinkMatch = message.match(/<think>([\s\S]*?)<\/think>/);
    return thinkMatch ? thinkMatch[1].trim() : message;
  };

  return (
    <div className="w-full max-w-2xl mx-auto p-4">
      <div className="flex gap-4 mb-4">
        <button 
          onClick={() => handleViewToggle('logs')}
          className={`flex items-center gap-2 px-4 py-2 rounded ${
            viewType === 'logs' ? 'bg-blue-500 text-white' : 'bg-gray-200'
          }`}
        >
          {viewType === 'logs' ? <ChevronUp /> : <ChevronDown />}
          <span>{viewType === 'logs' ? 'Hide' : 'Show'} Logs</span>
        </button>
        
        <button 
          onClick={() => handleViewToggle('cot')}
          className={`flex items-center gap-2 px-4 py-2 rounded ${
            viewType === 'cot' ? 'bg-green-500 text-white' : 'bg-gray-200'
          }`}
        >
          {viewType === 'cot' ? <ChevronUp /> : <ChevronDown />}
          <span>{viewType === 'cot' ? 'Hide' : 'Show'} CoT</span>
        </button>

        {viewType && (
          <button
            onClick={fetchLogs}
            className={`p-2 rounded ${isLoading ? 'animate-spin' : ''}`}
            disabled={isLoading}
          >
            <RefreshCw className="w-5 h-5" />
          </button>
        )}
      </div>
      
      {error && (
        <div className="text-red-500 mb-4">
          Error: {error}
        </div>
      )}

      {viewType && (
        <div ref={scrollRef} className="border rounded-lg max-h-96 overflow-y-auto">
          <div className="p-4 space-y-4">
            {logs.length === 0 ? (
              <div className="text-gray-500 text-center py-4">
                No {viewType === 'cot' ? 'Chain of Thought' : 'logs'} available
              </div>
            ) : (
              [...logs].reverse().map((log, index) => (
                <div 
                  key={index} 
                  className={`p-3 rounded ${
                    viewType === 'cot' 
                      ? 'bg-gray-50' 
                      : 'bg-white border'
                  }`}
                >
                  <div className="text-sm text-gray-500 mb-1">
                    [{log.timestamp}]
                  </div>
                  <div className={`${
                    viewType === 'cot' 
                      ? 'whitespace-pre-wrap font-mono text-sm' 
                      : ''
                  }`}>
                    {viewType === 'cot' 
                      ? extractThinkContent(log.message)
                      : log.message}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default LogViewer;
