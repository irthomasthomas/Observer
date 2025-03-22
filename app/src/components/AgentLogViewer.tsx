import React, { useState, useEffect, useRef } from 'react';
import { LogEntry, LogLevel, Logger } from '../utils/logging';
import { MessageCircle, ChevronDown, ChevronUp, Settings, Image as ImageIcon, Brain } from 'lucide-react';

interface AgentLogViewerProps {
  agentId: string;
  maxEntries?: number;
  expanded?: boolean;
  maxHeight?: string; // Added prop for customizable height
}

const AgentLogViewer: React.FC<AgentLogViewerProps> = ({ 
  agentId, 
  maxEntries = 50,
  expanded = true,
  maxHeight = '400px' // Default height of 400px
}) => {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [expandedLogs, setExpandedLogs] = useState<Record<string, boolean>>({});
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
  
  // Toggle expanded state for collapsible logs
  const toggleExpanded = (logId: string) => {
    setExpandedLogs(prev => ({
      ...prev,
      [logId]: !prev[logId]
    }));
  };

  // Render the prompt content (which is always an object)
  const renderPromptContent = (content: any) => {
    if (content.modifiedPrompt && Array.isArray(content.images)) {
      return (
        <div className="space-y-4">
          <div className="font-medium text-gray-800 mb-2">Prompt:</div>
          <div className="whitespace-pre-wrap bg-gray-50 p-3 rounded border border-gray-200">
            {content.modifiedPrompt}
          </div>
          
          {content.images && content.images.length > 0 && (
            <div>
              <div className="font-medium text-gray-800 mb-2">Images:</div>
              <div className="grid grid-cols-1 gap-4">
                {content.images.map((imageData: string, index: number) => (
                  <div key={index} className="border border-gray-200 rounded p-2">
                    <img 
                      src={`data:image/png;base64,${imageData}`} 
                      alt={`Image ${index + 1}`} 
                      className="max-w-full h-auto rounded"
                      onError={(e) => {
                        // Try different image formats if PNG fails
                        const imgElement = e.target as HTMLImageElement;
                        const currentSrc = imgElement.src;
                        
                        if (currentSrc.includes('image/png')) {
                          // Try JPEG instead
                          imgElement.src = `data:image/jpeg;base64,${imageData}`;
                        } else if (currentSrc.includes('image/jpeg')) {
                          // Try webp
                          imgElement.src = `data:image/webp;base64,${imageData}`;
                        } else {
                          // Show fallback image if all formats fail
                          imgElement.src = "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9ImN1cnJlbnRDb2xvciIgc3Ryb2tlLXdpZHRoPSIyIiBzdHJva2UtbGluZWNhcD0icm91bmQiIHN0cm9rZS1saW5lam9pbj0icm91bmQiIGNsYXNzPSJsdWNpZGUgbHVjaWRlLWltYWdlLW9mZiI+PHBhdGggZD0iTTIuOTkgMy41SC4wMDEiLz48cGF0aCBkPSJNMTIuOTkgMy41aC0zIi8+PHBhdGggZD0iTTIwLjk5IDMuNWgtMyIvPjxwYXRoIGQ9Ik0xLjk5IDguNWgyIi8+PHBhdGggZD0iTTguOTkgOC41aDEwIi8+PHBhdGggZD0iTTEuOTkgMTMuNWgyIi8+PHBhdGggZD0iTTguOTkgMTMuNWg5Ljk5Ii8+PHBhdGggZD0iTTEuOTkgMTguNWgyIi8+PHBhdGggZD0iTTEzLjk5IDE4LjVoNiIvPjxwYXRoIGQ9Ik03Ljk5IDE4LjVoMSIvPjwvc3ZnPg==";
                          imgElement.style.padding = "20px";
                          imgElement.style.backgroundColor = "#f3f4f6";
                        }
                      }}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      );
    }
    
    // Fallback for other object types
    return <pre className="text-sm overflow-auto">{JSON.stringify(content, null, 2)}</pre>;
  };
  
  // Render the response content (which is always a string)
  const renderResponseContent = (content: string) => {
    return <div className="whitespace-pre-wrap">{content}</div>;
  };
  
  // Render the memory content
  const renderMemoryContent = (content: any, details?: any) => {
    // For memory updates, check if we have the "update" details from appendMemory
    if (details?.update?.appended) {
      // Just show what was appended, not the entire memory
      return (
        <div className="space-y-4">
          <div className="font-medium text-gray-800 mb-2">Appended:</div>
          <div className="whitespace-pre-wrap bg-gray-50 p-3 rounded border border-gray-200">
            {details.update.appended}
          </div>
          {details.update.separator !== '\n' && (
            <div className="text-sm text-gray-600">
              Separator: "{details.update.separator}"
            </div>
          )}
        </div>
      );
    }
    
    // Default behavior for setMemory or other cases
    if (typeof content === 'string') {
      return <div className="whitespace-pre-wrap">{content}</div>;
    } else {
      return <pre className="text-sm overflow-auto">{JSON.stringify(content, null, 2)}</pre>;
    }
  };
  
  if (logs.length === 0) {
    return (
      <div className="py-10 text-center text-gray-500 italic">
        No activity yet
      </div>
    );
  }
  
  return (
    <div 
      className="overflow-y-auto scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-gray-100" 
      style={{ maxHeight }}
    >
      {logs.map((log, index) => {
        // Determine log type
        const logType = log.details?.logType || 'system';
        
        // Select background color based on log type
        let bgColor = "bg-gray-50"; // Default for system logs
        let iconBgColor = "bg-gray-100";
        let textColor = "text-gray-700";
        let icon = <Settings className="h-5 w-5 text-gray-600" />;
        
        if (logType === 'model-prompt') {
          bgColor = "bg-blue-50";
          iconBgColor = "bg-blue-100";
          textColor = "text-blue-700";
          
          // Check if this prompt contains images
          const hasImages = !!(log.details?.content && 
                             log.details.content.images && 
                             Array.isArray(log.details.content.images));
          
          icon = hasImages ? 
            <ImageIcon className="h-5 w-5 text-blue-600" /> : 
            <MessageCircle className="h-5 w-5 text-blue-600" />;
        } else if (logType === 'model-response') {
          bgColor = "bg-green-50";
          iconBgColor = "bg-green-100";
          textColor = "text-green-700";
          icon = <MessageCircle className="h-5 w-5 text-green-600" />;
        } else if (logType === 'memory-update') {
          bgColor = "bg-purple-50";
          iconBgColor = "bg-purple-100";
          textColor = "text-purple-700";
          icon = <Brain className="h-5 w-5 text-purple-600" />;
        }
        
        // Check if this log is expandable (has content in details)
        const isExpandable = logType === 'model-prompt' || logType === 'model-response' || logType === 'memory-update';
        const isExpanded = expandedLogs[log.id] || false;
        
        return (
          <div key={log.id || index} className="mb-6">
            <div className="flex">
              <div className={`w-10 h-10 rounded-full ${iconBgColor} flex items-center justify-center mr-4 flex-shrink-0`}>
                {icon}
              </div>
              <div className={`${bgColor} px-4 py-3 rounded-lg max-w-full w-full`}>
                <div className={`text-base ${textColor} flex justify-between`}>
                  <div>{log.message}</div>
                  {isExpandable && (
                    <button 
                      onClick={() => toggleExpanded(log.id)}
                      className="ml-2 text-gray-500 hover:text-gray-700 focus:outline-none"
                    >
                      {isExpanded ? 
                        <ChevronUp className="h-5 w-5" /> : 
                        <ChevronDown className="h-5 w-5" />
                      }
                    </button>
                  )}
                </div>
                
                {/* Expandable content section */}
                {isExpandable && isExpanded && (
                  <div className="mt-3 pt-3 border-t border-gray-200">
                    {log.details?.content ? 
                      (logType === 'model-prompt' 
                        ? renderPromptContent(log.details.content)
                        : logType === 'memory-update'
                          ? renderMemoryContent(log.details.content, log.details)
                          : renderResponseContent(log.details.content)
                      )
                      : "No content available"}
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })}
      <div ref={logsEndRef} />
    </div>
  );
};

export default AgentLogViewer;
