// src/components/AgentLogViewer.tsx
import React, { useState, useEffect, useRef } from 'react';
import { LogEntry, LogLevel, Logger } from '../utils/logging';
import { MessageCircle, ChevronDown, ChevronUp, Settings, Image as ImageIcon, Brain } from 'lucide-react'; // Removed Trash2

interface AgentLogViewerProps {
  agentId: string;
  maxEntries?: number;
  // The 'expanded' prop from parent (AgentCard) determines if this component is visible.
  // Local 'expandedLogs' state handles individual log item expansion.
  maxHeight?: string;
}

const AgentLogViewer: React.FC<AgentLogViewerProps> = ({
  agentId,
  maxEntries = 50,
  maxHeight = '400px'
}) => {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [expandedLogs, setExpandedLogs] = useState<Record<string, boolean>>({});
  // logsEndRef is kept in case you want to add manual scroll buttons later, but auto-scroll is removed.
  const logsEndRef = useRef<HTMLDivElement>(null);

  // Load logs when component mounts or agentId/maxEntries change
  useEffect(() => {
    const initialLogs = Logger.getFilteredLogs({
      source: agentId,
      level: LogLevel.INFO
    });
    // Get the most recent 'maxEntries' logs and then reverse them so newest is first.
    setLogs(initialLogs.slice(-maxEntries).reverse());

    const handleNewLog = (log: LogEntry) => {
      if (log.source !== agentId || log.level < LogLevel.INFO) return;

      setLogs(prevLogs => {
        // Add new log to the beginning of the array
        const updatedLogs = [log, ...prevLogs];
        // Keep only the newest 'maxEntries' logs
        return updatedLogs.slice(0, maxEntries);
      });
    };

    Logger.addListener(handleNewLog);

    return () => {
      Logger.removeListener(handleNewLog);
    };
  }, [agentId, maxEntries]);

  // Auto-scrolling logic removed as newest logs are now at the top.
  // useEffect(() => {
  //   if (logs.length > 0 && logsEndRef.current) {
  //     // If you wanted to scroll to top for new logs:
  //     // logsContainerRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  //     // But generally, users prefer manual control when newest is at top.
  //   }
  // }, [logs]);

  const toggleExpanded = (logId: string) => {
    setExpandedLogs(prev => ({
      ...prev,
      [logId]: !prev[logId]
    }));
  };

  // renderPromptContent, renderResponseContent, renderMemoryContent remain the same

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
                        const imgElement = e.target as HTMLImageElement;
                        const currentSrc = imgElement.src;
                        if (currentSrc.includes('image/png')) {
                          imgElement.src = `data:image/jpeg;base64,${imageData}`;
                        } else if (currentSrc.includes('image/jpeg')) {
                          imgElement.src = `data:image/webp;base64,${imageData}`;
                        } else {
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
    return <pre className="text-sm overflow-auto">{JSON.stringify(content, null, 2)}</pre>;
  };

  const renderResponseContent = (content: string) => {
    return <div className="whitespace-pre-wrap">{content}</div>;
  };

  const renderMemoryContent = (content: any, details?: any) => {
    if (details?.update?.appended) {
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
    if (typeof content === 'string') {
      return <div className="whitespace-pre-wrap">{content}</div>;
    } else {
      return <pre className="text-sm overflow-auto">{JSON.stringify(content, null, 2)}</pre>;
    }
  };

  if (logs.length === 0) {
    return (
      <div className="py-10 text-center text-gray-500 italic">
        No activity yet.
      </div>
    );
  }

  return (
    <div
      className="overflow-y-auto scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-gray-100"
      style={{ maxHeight }}
      // ref={logsContainerRef} // If you need a ref to the scrollable container for manual scroll-to-top
    >
      {/* Clear Logs button and its container div removed */}
      <div className="pt-2"> {/* Ensure some padding at the top */}
        {logs.map((log, index) => { // .map() will render in the order of the 'logs' array
          const logType = log.details?.logType || 'system';
          let bgColor = "bg-gray-50";
          let iconBgColor = "bg-gray-100";
          let textColor = "text-gray-700";
          let icon = <Settings className="h-5 w-5 text-gray-600" />;

          if (logType === 'model-prompt') {
            bgColor = "bg-blue-50";
            iconBgColor = "bg-blue-100";
            textColor = "text-blue-700";
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

          const isExpandable = logType === 'model-prompt' || logType === 'model-response' || logType === 'memory-update';
          const isLogItemExpanded = expandedLogs[log.id] || false;

          return (
            <div key={log.id || index} className="mb-6 px-1">
              <div className="flex">
                <div className={`w-10 h-10 rounded-full ${iconBgColor} flex items-center justify-center mr-4 flex-shrink-0`}>
                  {icon}
                </div>
                <div className={`${bgColor} px-4 py-3 rounded-lg max-w-full w-full shadow-sm`}>
                  <div className={`text-base ${textColor} flex justify-between items-center`}>
                    <div className="font-medium">{log.message}</div>
                    {isExpandable && (
                      <button
                        onClick={() => toggleExpanded(log.id)}
                        className="ml-2 text-gray-500 hover:text-gray-700 focus:outline-none"
                      >
                        {isLogItemExpanded ?
                          <ChevronUp className="h-5 w-5" /> :
                          <ChevronDown className="h-5 w-5" />
                        }
                      </button>
                    )}
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    {new Date(log.timestamp).toLocaleString()}
                  </div>

                  {isExpandable && isLogItemExpanded && (
                    <div className="mt-3 pt-3 border-t border-gray-200">
                      {log.details?.content ?
                        (logType === 'model-prompt'
                          ? renderPromptContent(log.details.content)
                          : logType === 'memory-update'
                            ? renderMemoryContent(log.details.content, log.details)
                            : renderResponseContent(log.details.content)
                        )
                        : <span className="text-gray-500 italic">No content details.</span>}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <div ref={logsEndRef} /> {/* This ref is now at the very bottom of the rendered list (oldest logs) */}
    </div>
  );
};

export default AgentLogViewer;
