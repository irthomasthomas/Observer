import React, { useState, useEffect, useRef } from 'react';
import { LogEntry, LogLevel, Logger } from '../utils/logging';
import { MessageCircle } from 'lucide-react';

interface AgentLogViewerProps {
  agentId: string;
  maxEntries?: number;
}

const AgentLogViewer: React.FC<AgentLogViewerProps> = ({ 
  agentId, 
  maxEntries = 50
}) => {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const [isExpanded, setIsExpanded] = useState<boolean>(true);

  // Load logs when component mounts
  useEffect(() => {
    // Get initial logs for this agent
    const initialLogs = Logger.getFilteredLogs({ 
      source: agentId,
      level: LogLevel.INFO 
    });
    
    // Only keep the most recent logs based on maxEntries
    setLogs(initialLogs.slice(-maxEntries));

    // Subscribe to new logs
    const handleNewLog = (log: LogEntry) => {
      if (log.source !== agentId || log.level < LogLevel.INFO) return;
      
      setLogs(prevLogs => {
        const newLogs = [...prevLogs, log];
        return newLogs.slice(-maxEntries);
      });
    };

    Logger.addListener(handleNewLog);
    
    return () => {
      Logger.removeListener(handleNewLog);
    };
  }, [agentId, maxEntries]);

  // Scroll to bottom when new logs come in
  useEffect(() => {
    if (isExpanded && logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, isExpanded]);

  if (logs.length === 0) {
    return (
      <div className="py-10 text-center text-gray-500 italic">
        No activity yet
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <div className="flex items-center space-x-2">
          <MessageCircle className="h-5 w-5 text-blue-600" />
          <h3 className="font-medium">Activity</h3>
        </div>
        <button 
          onClick={() => setIsExpanded(!isExpanded)}
          className="text-gray-500 hover:text-gray-700"
        >
          {isExpanded ? 'Hide' : 'Show'}
        </button>
      </div>

      {/* Log Content */}
      {isExpanded && (
        <div className="max-h-80 overflow-y-auto p-4 space-y-3">
          {logs.map((log, index) => (
            <div key={index} className="mb-3">
              <div className="flex">
                <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center mr-2 flex-shrink-0">
                  <MessageCircle className="h-4 w-4 text-blue-600" />
                </div>
                <div className="bg-blue-50 px-3 py-2 rounded-lg max-w-[85%]">
                  <div className="text-sm">{log.message}</div>
                  {log.details && (
                    <div className="mt-1 text-xs text-gray-600 border-t border-gray-200 pt-1">
                      {typeof log.details === 'string'
                        ? log.details
                        : JSON.stringify(log.details, null, 2)}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
          <div ref={logsEndRef} />
        </div>
      )}
    </div>
  );
};

export default AgentLogViewer;
