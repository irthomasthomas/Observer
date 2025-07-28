// src/components/AgentLogViewer.tsx
import React, { useState, useEffect } from 'react';
import { LogEntry, LogLevel, Logger } from '../utils/logging';
import { MessageCircle, ChevronDown, ChevronUp, Settings, Image as ImageIcon, Brain, HelpCircle, Monitor, Clipboard, Camera, Mic, CheckCircle, XCircle, Clock, Zap } from 'lucide-react';
import FeedbackBubble from './FeedbackBubble'; // <-- IMPORT THE NEW COMPONENT

interface AgentLogViewerProps {
  agentId: string;
  maxEntries?: number;
  maxHeight?: string;
  getToken: () => Promise<string | undefined>;
  isAuthenticated: boolean;
}

const AgentLogViewer: React.FC<AgentLogViewerProps> = ({
  agentId,
  maxEntries = 50,
  maxHeight = '400px',
  getToken,
  isAuthenticated
}) => {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [expandedLogs, setExpandedLogs] = useState<Record<string, boolean>>({});
  const [runCycleCount, setRunCycleCount] = useState(0); // <-- STATE FOR COUNTING CYCLES

  // Effect to load initial logs, subscribe to new ones, and count cycles
  useEffect(() => {
    // Reset cycle count when agentId changes
    setRunCycleCount(0); 

    const initialLogs = Logger.getFilteredLogs({
      source: agentId,
      level: LogLevel.INFO,
    });
    
    // Filter out iteration start/end logs and set the most recent 'maxEntries' logs, ordered newest first
    const filteredLogs = initialLogs.filter(log => {
      const logType = log.details?.logType;
      return logType !== 'iteration-start' && logType !== 'iteration-end';
    });
    setLogs(filteredLogs.slice(-maxEntries).reverse());
    
    // Count initial cycles from the loaded logs
    const initialCycles = initialLogs.filter(log => log.details?.logType === 'model-response').length;
    setRunCycleCount(initialCycles);

    // Handler for new log entries
    const handleNewLog = (log: LogEntry) => {
      // Filter logs for the current agent and minimum level
      if (log.source !== agentId || log.level < LogLevel.INFO) return;

      // Filter out iteration start/end logs
      const logType = log.details?.logType;
      if (logType === 'iteration-start' || logType === 'iteration-end') return;

      // Increment cycle count on each model response
      if (log.details?.logType === 'model-response') {
        setRunCycleCount(prev => prev + 1);
      }

      setLogs(prevLogs => {
        // Prepend the new log to maintain newest-first order
        const updatedLogs = [log, ...prevLogs];
        // Ensure we don't exceed maxEntries
        return updatedLogs.slice(0, maxEntries);
      });
    };

    // Subscribe to the logger
    Logger.addListener(handleNewLog);

    // Cleanup: remove listener when component unmounts or dependencies change
    return () => {
      Logger.removeListener(handleNewLog);
    };
  }, [agentId, maxEntries]); // Re-run if agentId or maxEntries changes

  // Handler to toggle the expanded state of an individual log item
  const toggleExpanded = (logId: string) => {
    setExpandedLogs(prev => ({
      ...prev,
      [logId]: !prev[logId],
    }));
  };

  // --- Content Rendering Functions ---

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
                      onError={(e) => { // Fallback for different image types
                        const imgElement = e.target as HTMLImageElement;
                        const currentSrc = imgElement.src;
                        if (currentSrc.includes('image/png')) {
                          imgElement.src = `data:image/jpeg;base64,${imageData}`;
                        } else if (currentSrc.includes('image/jpeg')) {
                          imgElement.src = `data:image/webp;base64,${imageData}`;
                        } else { // Fallback placeholder
                          imgElement.src = "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9ImN1cnJlbnRDb2xvciIgc3Ryb2tlLXdpZHRoPSIyIiBzdHJva2UtbGluZWNhcD0icm91bmQiIHN0cm9rZS1saW5lam9pbj0icm91bmQiIGNsYXNzPSJsdWNpZGUgbHVjaWRlLWltYWdlLW9mZiI+PHBhdGggZD0iTTIuOTkgMy41SC4wMDEiLz48cGF0aCBkPSJNMTIuOTkgMy41aC0zIi8+PHBhdGggZD0iTTIwLjk5IDMuNWgtMyIvPjxwYXRoIGQ9Ik0xLjk5IDguNWgyIi8+PHBhdGggZD0iTTguOTkgOC41aDEwIi8+PHBhdGggZD0iTTEuOTkgMTMuNWgyIi8+PHBhdGggZD0iTTguOTkgMTMuNWg5Ljk5Ii8+PHBhdGggZD0iTTEuOTkgMTguNWgyIi8+PHBhdGggZD0iTTEzLjk5IDE4LjVoNiIvPjxwYXRoIGQ9Ik03Ljk5IDE4LjVoMSIvPjwvc3ZnPg==";
                          imgElement.style.padding = "20px";
                          imgElement.style.backgroundColor = "#f3f4f6"; // bg-gray-100
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

  const renderResponseContent = (content: string) => {
    return <div className="whitespace-pre-wrap">{content}</div>;
  };

  const renderMemoryContent = (content: any, details?: any) => {
    // Specific rendering for "appendMemory" type updates
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
    // Default rendering for memory content
    if (typeof content === 'string') {
      return <div className="whitespace-pre-wrap">{content}</div>;
    } else {
      return <pre className="text-sm overflow-auto">{JSON.stringify(content, null, 2)}</pre>;
    }
  };

  const renderSensorContent = (content: any, logType: string) => {
    if (logType === 'sensor-ocr') {
      return (
        <div className="space-y-2">
          <div className="font-medium text-gray-800 mb-2">OCR Text Detected:</div>
          <div className="whitespace-pre-wrap bg-gray-50 p-3 rounded border border-gray-200 max-h-32 overflow-y-auto">
            {content}
          </div>
        </div>
      );
    } else if (logType === 'sensor-audio') {
      return (
        <div className="space-y-2">
          <div className="font-medium text-gray-800 mb-2">Audio Transcript ({content.source}):</div>
          <div className="whitespace-pre-wrap bg-gray-50 p-3 rounded border border-gray-200 max-h-32 overflow-y-auto">
            {content.transcript}
          </div>
        </div>
      );
    } else {
      return <pre className="text-sm overflow-auto">{JSON.stringify(content, null, 2)}</pre>;
    }
  };

  const renderToolContent = (content: any, logType: string) => {
    if (logType === 'tool-success') {
      return (
        <div className="space-y-2">
          <div className="font-medium text-gray-800 mb-2">Tool: {content.tool}()</div>
          <div className="bg-green-50 p-3 rounded border border-green-200">
            <div className="text-sm text-green-800">
              <div className="font-medium">Parameters:</div>
              <pre className="mt-1 text-xs overflow-auto">{JSON.stringify(content.params, null, 2)}</pre>
            </div>
          </div>
        </div>
      );
    } else if (logType === 'tool-error') {
      return (
        <div className="space-y-2">
          <div className="font-medium text-gray-800 mb-2">Tool Error</div>
          <div className="bg-red-50 p-3 rounded border border-red-200">
            <div className="text-sm text-red-800">
              <div className="font-medium">Error:</div>
              <div className="mt-1">{content.error}</div>
            </div>
          </div>
        </div>
      );
    } else {
      return <pre className="text-sm overflow-auto">{JSON.stringify(content, null, 2)}</pre>;
    }
  };

  // --- Main Render ---

  if (logs.length === 0) {
    return (
      <div className="p-4 text-center text-gray-500">
        <HelpCircle className="mx-auto h-8 w-8 text-gray-400 mb-2" />
        <p className="font-medium">No activity yet.</p>
        <p className="text-sm">Start the agent to see its activity log here.</p>
      </div>
    );
  }

  return (
    <div>
      {/* --- FEEDBACK BUBBLE INTEGRATION --- */}
      {runCycleCount >= 3 && (
        <div className="p-2 mb-4">
          <FeedbackBubble 
          agentId={agentId}
          getToken={getToken}
          isAuthenticated={isAuthenticated}
          />
        </div>
      )}

      <div
        className="overflow-y-auto scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-gray-100"
        style={{ maxHeight }}
      >
        <div className="pt-2"> {/* Padding for the first log item */}
          {logs.map((log, index) => { // Logs are already ordered newest first
            // Detect iteration start by looking for the first sensor after a model response
            const currentLogType = log.details?.logType;
            const prevLog = logs[index - 1];
            const prevLogType = prevLog?.details?.logType;
            
            // New iteration starts when we see a sensor log (like screenshot) after a model response or at the beginning
            const isNewIteration = (currentLogType?.startsWith('sensor-') && 
                                   (prevLogType === 'model-response' || index === 0)) ||
                                  (currentLogType === 'model-prompt' && index === 0);
            const logType = log.details?.logType || 'system';
            let bgColor = "bg-gray-50";
            let iconBgColor = "bg-gray-100";
            let textColor = "text-gray-700";
            let icon = <Settings className="h-5 w-5 text-gray-600" />;

            if (logType === 'model-prompt') {
              bgColor = "bg-blue-50";
              iconBgColor = "bg-blue-100";
              textColor = "text-blue-700";
              const hasImages = !!(log.details?.content?.images?.length > 0);
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
            } else if (logType === 'sensor-ocr') {
              bgColor = "bg-green-50";
              iconBgColor = "bg-green-100";
              textColor = "text-green-700";
              icon = <Monitor className="h-5 w-5 text-green-600" />;
            } else if (logType === 'sensor-screenshot') {
              bgColor = "bg-blue-50";
              iconBgColor = "bg-blue-100";
              textColor = "text-blue-700";
              icon = <ImageIcon className="h-5 w-5 text-blue-600" />;
            } else if (logType === 'sensor-clipboard') {
              bgColor = "bg-purple-50";
              iconBgColor = "bg-purple-100";
              textColor = "text-purple-700";
              icon = <Clipboard className="h-5 w-5 text-purple-600" />;
            } else if (logType === 'sensor-audio') {
              bgColor = "bg-orange-50";
              iconBgColor = "bg-orange-100";
              textColor = "text-orange-700";
              icon = <Mic className="h-5 w-5 text-orange-600" />;
            } else if (logType === 'sensor-camera') {
              bgColor = "bg-red-50";
              iconBgColor = "bg-red-100";
              textColor = "text-red-700";
              icon = <Camera className="h-5 w-5 text-red-600" />;
            } else if (logType === 'tool-success') {
              bgColor = "bg-green-50";
              iconBgColor = "bg-green-100";
              textColor = "text-green-700";
              icon = <CheckCircle className="h-5 w-5 text-green-600" />;
            } else if (logType === 'tool-error') {
              bgColor = "bg-red-50";
              iconBgColor = "bg-red-100";
              textColor = "text-red-700";
              icon = <XCircle className="h-5 w-5 text-red-600" />;
            } else if (logType === 'iteration-start') {
              bgColor = "bg-blue-50";
              iconBgColor = "bg-blue-100";
              textColor = "text-blue-700";
              icon = <Clock className="h-5 w-5 text-blue-600" />;
            } else if (logType === 'iteration-end') {
              bgColor = "bg-gray-50";
              iconBgColor = "bg-gray-100";
              textColor = "text-gray-700";
              icon = <Zap className="h-5 w-5 text-gray-600" />;
            }

            const isExpandable = logType === 'model-prompt' || logType === 'model-response' || logType === 'memory-update' || 
                                 logType === 'sensor-ocr' || logType === 'sensor-audio' || logType === 'tool-success' || logType === 'tool-error';
            const isLogItemExpanded = expandedLogs[log.id] || false;

            return (
              <div key={log.id || `${log.timestamp}-${log.message.slice(0,10)}`}>
                {/* Iteration separator */}
                {isNewIteration && index > 0 && (
                  <div className="mb-4 mt-6 flex items-center">
                    <div className="flex-grow h-px bg-gradient-to-r from-blue-200 to-transparent"></div>
                    <div className="px-4 text-sm font-medium text-blue-600 bg-blue-50 rounded-full border border-blue-200">
                      New Iteration
                    </div>
                    <div className="flex-grow h-px bg-gradient-to-l from-blue-200 to-transparent"></div>
                  </div>
                )}
                
                <div className="mb-6 px-1">
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
                          aria-label={isLogItemExpanded ? "Collapse log details" : "Expand log details"}
                        >
                          {isLogItemExpanded ?
                            <ChevronUp className="h-5 w-5" /> :
                            <ChevronDown className="h-5 w-5" />
                          }
                        </button>
                      )}
                    </div>
                    <div className="text-xs text-gray-400 mt-0.5">
                      {new Date(log.timestamp).toLocaleString()}
                    </div>

                    {/* Expandable content section */}
                    {isExpandable && isLogItemExpanded && (
                      <div className="mt-3 pt-3 border-t border-gray-200">
                        {log.details?.content ?
                          (logType === 'model-prompt'
                            ? renderPromptContent(log.details.content)
                            : logType === 'memory-update'
                              ? renderMemoryContent(log.details.content, log.details)
                            : logType === 'sensor-ocr' || logType === 'sensor-audio'
                              ? renderSensorContent(log.details.content, logType)
                            : logType === 'tool-success' || logType === 'tool-error'
                              ? renderToolContent(log.details.content, logType)
                              : renderResponseContent(log.details.content)
                          )
                          : <span className="text-gray-500 italic">No content details.</span>}
                      </div>
                    )}
                  </div>
                </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default AgentLogViewer;
