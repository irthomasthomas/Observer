import React, { useState, useEffect, useRef } from 'react';
import { LogEntry, LogLevel, Logger } from '../utils/logging';
import { MessageCircle } from 'lucide-react';

interface AgentLogViewerProps {
  agentId: string;
  maxEntries?: number;
  expanded?: boolean; // Support the expanded prop from original component
}

const AgentLogViewer: React.FC<AgentLogViewerProps> = ({ 
  agentId, 
  maxEntries = 50,
  expanded = true
}) => {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const logsEndRef = useRef<HTMLDivElement>(null);

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

  if (logs.length === 0) {
    return (
      <div className="py-10 text-center text-gray-500 italic">
        No activity yet
      </div>
    );
  }

  return (
    <div>
      {logs.map((log, index) => (
        <div key={index} className="mb-6">
          <div className="flex">
            <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center mr-4 flex-shrink-0">
              <MessageCircle className="h-5 w-5 text-blue-600" />
            </div>
            <div className="bg-blue-50 px-4 py-3 rounded-lg max-w-full">
              <div className="text-base">{log.message}</div>
            </div>
          </div>
        </div>
      ))}
      <div ref={logsEndRef} />
    </div>
  );
};

export default AgentLogViewer;
