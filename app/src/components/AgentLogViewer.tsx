import React, { useState, useEffect, useRef } from 'react';
import { LogEntry, LogLevel, Logger } from '../utils/logging';
import { MessageCircle, Brain } from 'lucide-react';

interface AgentLogViewerProps {
  agentId: string;
  maxEntries?: number;
  expanded?: boolean;
}

const AgentLogViewer: React.FC<AgentLogViewerProps> = ({ 
  agentId, 
  maxEntries = 50,
  expanded = true
}) => {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const logsEndRef = useRef<HTMLDivElement>(null);

  // Group logs by iteration
  const groupedLogs = logs.reduce((groups, log) => {
    // Look for logs that indicate a new iteration
    const isIterationStart = log.message.includes('Running first iteration') || 
                            log.message.includes('Starting iteration') ||
                            log.message.toLowerCase().includes('agent iteration');
    
    if (isIterationStart) {
      // Start a new group
      groups.push({
        iteration: groups.length + 1,
        timestamp: log.timestamp,
        logs: [log]
      });
    } else if (groups.length > 0) {
      // Add to the current group
      groups[groups.length - 1].logs.push(log);
    } else {
      // No groups yet, create the first one
      groups.push({
        iteration: 1,
        timestamp: log.timestamp,
        logs: [log]
      });
    }
    
    return groups;
  }, [] as Array<{iteration: number, timestamp: Date, logs: LogEntry[]}>);

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
    if (expanded && logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, expanded]);

  // Format timestamp for iteration header
  const formatIterationTime = (date: Date): string => {
    return date.toLocaleTimeString([], { 
      hour: '2-digit', 
      minute: '2-digit',
      hour12: false
    });
  };

  // Check if a log message is a memory entry
  const isMemoryEntry = (log: LogEntry): boolean => {
    return log.message.includes('COMMAND:') || 
           (log.details && typeof log.details === 'object' && 
            'isMemory' in log.details && log.details.isMemory === true);
  };

  if (logs.length === 0) {
    return (
      <div className="py-10 text-center text-gray-500 italic">
        No messages yet
      </div>
    );
  }

  return (
    <div className="max-h-80 overflow-y-auto bg-white p-4 space-y-4">
      {groupedLogs.map((group, groupIndex) => (
        <div key={groupIndex} className="space-y-3">
          {/* Iteration divider */}
          <div className="text-xs font-medium text-gray-500 text-center relative my-4">
            <span className="bg-white px-3 relative z-10">
              Iteration #{group.iteration} • {formatIterationTime(group.timestamp)}
            </span>
            <div className="absolute top-1/2 left-0 w-full h-px bg-gray-200 -z-0"></div>
          </div>
          
          {/* Messages in this iteration */}
          {group.logs.map((log, logIndex) => (
            <div key={`${groupIndex}-${logIndex}`} className="mb-3">
              <div className="flex">
                <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center mr-2 flex-shrink-0">
                  {isMemoryEntry(log) ? (
                    <Brain className="h-4 w-4 text-purple-600" />
                  ) : (
                    <MessageCircle className="h-4 w-4 text-blue-600" />
                  )}
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
        </div>
      ))}
      <div ref={logsEndRef} />
    </div>
  );
};

export default AgentLogViewer;
