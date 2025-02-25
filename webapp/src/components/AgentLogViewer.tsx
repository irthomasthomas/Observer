// src/components/AgentLogViewer.tsx
import React, { useState, useEffect, useRef } from 'react';
import { LogEntry, LogLevel, Logger } from '../utils/logging';
import { ChevronDown, ChevronUp } from 'lucide-react';

interface AgentLogViewerProps {
  agentId: string;
  maxEntries?: number;
  expanded?: boolean;
}

const AgentLogViewer: React.FC<AgentLogViewerProps> = ({ 
  agentId, 
  maxEntries = 50,
  expanded = false
}) => {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isExpanded, setIsExpanded] = useState(expanded);
  const [minLevel] = useState<LogLevel>(LogLevel.INFO);
  const [hasUnreadLogs, setHasUnreadLogs] = useState(false);
  const logsEndRef = useRef<HTMLDivElement>(null);

  // Load logs when component mounts
  useEffect(() => {
    // Get initial logs for this agent
    const initialLogs = Logger.getFilteredLogs({ 
      source: agentId,
      level: minLevel 
    });
    
    // Only keep the most recent logs based on maxEntries
    setLogs(initialLogs.slice(-maxEntries));

    // Subscribe to new logs
    const handleNewLog = (log: LogEntry) => {
      if (log.source !== agentId || log.level < minLevel) return;
      
      setLogs(prevLogs => {
        const newLogs = [...prevLogs, log];
        return newLogs.slice(-maxEntries);
      });
      
      // Set unread flag if the panel is collapsed
      if (!isExpanded) {
        setHasUnreadLogs(true);
      }
    };

    Logger.addListener(handleNewLog);
    
    return () => {
      Logger.removeListener(handleNewLog);
    };
  }, [agentId, maxEntries, minLevel]);

  // Scroll to bottom when new logs come in or when expanded
  useEffect(() => {
    if (isExpanded && logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, isExpanded]);

  // Clear unread flag when expanding the panel
  useEffect(() => {
    if (isExpanded) {
      setHasUnreadLogs(false);
    }
  }, [isExpanded]);

  // Format timestamp
  const formatTime = (date: Date): string => {
    return date.toLocaleTimeString([], { 
      hour: '2-digit', 
      minute: '2-digit', 
      second: '2-digit',
      hour12: false 
    });
  };

  // Helper function to get color for log level
  const getLevelColor = (level: LogLevel): string => {
    switch (level) {
      case LogLevel.DEBUG:
        return 'text-gray-500';
      case LogLevel.INFO:
        return 'text-blue-600';
      case LogLevel.WARNING:
        return 'text-amber-600';
      case LogLevel.ERROR:
        return 'text-red-600';
      default:
        return 'text-gray-800';
    }
  };

  // Toggle expanded state
  const toggleExpanded = () => {
    setIsExpanded(!isExpanded);
    if (!isExpanded) {
      setHasUnreadLogs(false);
    }
  };

  return (
    <div className="mt-4 border rounded-md overflow-hidden">
      {/* Header */}
      <div 
        className={`px-3 py-2 flex justify-between items-center cursor-pointer ${
          hasUnreadLogs 
            ? 'bg-blue-50 border-blue-200' 
            : 'bg-gray-50'
        }`}
        onClick={toggleExpanded}
      >
        <div className="flex items-center">
          <span className="font-medium text-sm">Activity Log</span>
          {hasUnreadLogs && (
            <span className="ml-2 bg-blue-500 text-white text-xs py-0.5 px-1.5 rounded-full">
              New
            </span>
          )}
        </div>
        <div>
          {isExpanded ? (
            <ChevronUp size={16} />
          ) : (
            <ChevronDown size={16} />
          )}
        </div>
      </div>

      {/* Log content */}
      {isExpanded && (
        <div className="max-h-48 overflow-y-auto text-xs bg-white p-2">
          {logs.length === 0 ? (
            <div className="text-gray-500 italic text-center py-2">
              No activity recorded yet
            </div>
          ) : (
            <div className="space-y-1">
              {logs.map((log) => (
                <div key={log.id} className="hover:bg-gray-50">
                  <div className="flex">
                    <span className="text-gray-500 mr-2">{formatTime(log.timestamp)}</span>
                    <span className={`${getLevelColor(log.level)} flex-grow`}>
                      {log.message}
                    </span>
                  </div>
                  {log.details && (
                    <div className="ml-14 text-xs bg-gray-50 p-1 mt-0.5 rounded border-l-2 border-gray-300 overflow-x-auto">
                      {typeof log.details === 'string'
                        ? log.details
                        : JSON.stringify(log.details, null, 2)}
                    </div>
                  )}
                </div>
              ))}
              <div ref={logsEndRef} />
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default AgentLogViewer;
