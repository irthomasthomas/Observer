// components/AgentCard/IterationStoreDebug.tsx
import React, { useState, useEffect } from 'react';
import { ChevronDown, ChevronRight, Database, CheckCircle, XCircle, Camera, Monitor, Mic, Clipboard, Brain } from 'lucide-react';
import { IterationStore, IterationData, SensorData } from '../../utils/IterationStore';

interface IterationStoreDebugProps {
  agentId: string;
}

const IterationStoreDebug: React.FC<IterationStoreDebugProps> = ({ agentId }) => {
  const [iterations, setIterations] = useState<IterationData[]>([]);
  const [expandedIterations, setExpandedIterations] = useState<Record<string, boolean>>({});
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({});

  useEffect(() => {
    // Initial load
    const loadIterations = () => {
      try {
        const agentIterations = IterationStore.getIterationsForAgent(agentId) || [];
        setIterations(agentIterations);
      } catch (error) {
        console.error('Error loading iterations:', error);
        setIterations([]);
      }
    };
    
    loadIterations();

    // Subscribe to updates
    const unsubscribe = IterationStore.subscribe(() => {
      loadIterations();
    });

    return unsubscribe;
  }, [agentId]);

  const toggleIteration = (iterationId: string) => {
    setExpandedIterations(prev => ({
      ...prev,
      [iterationId]: !prev[iterationId]
    }));
  };

  const toggleSection = (sectionId: string) => {
    setExpandedSections(prev => ({
      ...prev,
      [sectionId]: !prev[sectionId]
    }));
  };

  const getSensorIcon = (type: SensorData['type']) => {
    switch (type) {
      case 'screenshot': return <Camera className="h-4 w-4 text-blue-500" />;
      case 'camera': return <Camera className="h-4 w-4 text-red-500" />;
      case 'ocr': return <Monitor className="h-4 w-4 text-green-500" />;
      case 'audio': return <Mic className="h-4 w-4 text-orange-500" />;
      case 'clipboard': return <Clipboard className="h-4 w-4 text-purple-500" />;
      case 'memory': return <Brain className="h-4 w-4 text-indigo-500" />;
      default: return <Database className="h-4 w-4 text-gray-500" />;
    }
  };

  const formatDuration = (duration?: number) => {
    if (!duration) return 'N/A';
    return `${duration.toFixed(2)}s`;
  };

  const formatContent = (content: any) => {
    try {
      if (content === null || content === undefined) {
        return 'null';
      }
      if (typeof content === 'string') {
        return content.length > 100 ? content.slice(0, 100) + '...' : content;
      }
      return JSON.stringify(content, null, 2);
    } catch (error) {
      return '[Error formatting content]';
    }
  };

  const formatTimestamp = (timestamp: string) => {
    try {
      if (!timestamp) return 'N/A';
      const date = new Date(timestamp);
      if (isNaN(date.getTime())) return 'Invalid Date';
      return date.toLocaleTimeString();
    } catch (error) {
      return 'Invalid Date';
    }
  };

  return (
    <div className="bg-gray-50 p-4 rounded-lg border">
      <div className="flex items-center gap-2 mb-4">
        <Database className="h-5 w-5 text-blue-600" />
        <h3 className="font-semibold text-gray-900">IterationStore Debug</h3>
        <span className="text-sm text-gray-500">({iterations.length} iterations)</span>
      </div>

      {iterations.length === 0 ? (
        <div className="text-center text-gray-500 py-4">
          No iterations found for this agent
        </div>
      ) : (
        <div className="space-y-3 max-h-96 overflow-y-auto">
          {iterations.map((iteration) => {
            if (!iteration || !iteration.id) return null;
            
            const isExpanded = expandedIterations[iteration.id];
            const hasError = iteration.hasError;

            return (
              <div
                key={iteration.id}
                className={`border rounded-lg p-3 ${hasError ? 'border-red-200 bg-red-50' : 'border-gray-200 bg-white'}`}
              >
                {/* Iteration Header */}
                <div
                  className="flex items-center justify-between cursor-pointer"
                  onClick={() => toggleIteration(iteration.id)}
                >
                  <div className="flex items-center gap-2">
                    {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    <span className="font-medium text-sm">
                      {iteration.id}
                    </span>
                    {hasError && <XCircle className="h-4 w-4 text-red-500" />}
                  </div>
                  <div className="flex items-center gap-4 text-xs text-gray-500">
                    <span>{formatTimestamp(iteration.startTime)}</span>
                    <span>{formatDuration(iteration.duration)}</span>
                    <span>{(iteration.sensors || []).length} sensors</span>
                    <span>{(iteration.tools || []).length} tools</span>
                  </div>
                </div>

                {/* Expanded Content */}
                {isExpanded && (
                  <div className="mt-3 space-y-3 border-t pt-3">
                    {/* Basic Info */}
                    <div className="text-xs space-y-1">
                      <div><strong>ID:</strong> {iteration.id}</div>
                      <div><strong>Agent ID:</strong> {iteration.agentId}</div>
                      <div><strong>Start Time:</strong> {formatTimestamp(iteration.startTime)}</div>
                      <div><strong>Duration:</strong> {formatDuration(iteration.duration)}</div>
                      <div><strong>Has Error:</strong> {iteration.hasError ? 'Yes' : 'No'}</div>
                    </div>

                    {/* Model Prompt */}
                    {iteration.modelPrompt && (
                      <div>
                        <button
                          className="flex items-center gap-1 text-xs font-medium text-blue-600"
                          onClick={() => toggleSection(`${iteration.id}-prompt`)}
                        >
                          {expandedSections[`${iteration.id}-prompt`] ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                          Model Prompt ({iteration.modelPrompt.length} chars)
                        </button>
                        {expandedSections[`${iteration.id}-prompt`] && (
                          <pre className="text-xs bg-gray-100 p-2 rounded mt-1 max-h-32 overflow-auto">
                            {formatContent(iteration.modelPrompt)}
                          </pre>
                        )}
                      </div>
                    )}

                    {/* Model Images */}
                    {iteration.modelImages && iteration.modelImages.length > 0 && (
                      <div>
                        <div className="text-xs font-medium text-purple-600">
                          Model Images: {iteration.modelImages.length}
                        </div>
                      </div>
                    )}

                    {/* Model Response */}
                    {iteration.modelResponse && (
                      <div>
                        <button
                          className="flex items-center gap-1 text-xs font-medium text-green-600"
                          onClick={() => toggleSection(`${iteration.id}-response`)}
                        >
                          {expandedSections[`${iteration.id}-response`] ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                          Model Response ({iteration.modelResponse.length} chars)
                        </button>
                        {expandedSections[`${iteration.id}-response`] && (
                          <pre className="text-xs bg-gray-100 p-2 rounded mt-1 max-h-32 overflow-auto">
                            {formatContent(iteration.modelResponse)}
                          </pre>
                        )}
                      </div>
                    )}

                    {/* Sensors */}
                    {iteration.sensors.length > 0 && (
                      <div>
                        <button
                          className="flex items-center gap-1 text-xs font-medium text-gray-700"
                          onClick={() => toggleSection(`${iteration.id}-sensors`)}
                        >
                          {expandedSections[`${iteration.id}-sensors`] ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                          Sensors ({iteration.sensors.length})
                        </button>
                        {expandedSections[`${iteration.id}-sensors`] && (
                          <div className="mt-1 space-y-1">
                            {iteration.sensors.map((sensor, idx) => (
                              <div key={idx} className="flex items-start gap-2 text-xs bg-gray-100 p-2 rounded">
                                {getSensorIcon(sensor.type)}
                                <div className="flex-1">
                                  <div className="font-medium">{sensor.type}</div>
                                  <div className="text-gray-600">{formatTimestamp(sensor.timestamp)}</div>
                                  {sensor.source && <div className="text-gray-600">Source: {sensor.source}</div>}
                                  {sensor.size && <div className="text-gray-600">Size: {sensor.size}</div>}
                                  <pre className="mt-1 max-h-20 overflow-auto">{formatContent(sensor.content)}</pre>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Tools */}
                    {iteration.tools.length > 0 && (
                      <div>
                        <button
                          className="flex items-center gap-1 text-xs font-medium text-gray-700"
                          onClick={() => toggleSection(`${iteration.id}-tools`)}
                        >
                          {expandedSections[`${iteration.id}-tools`] ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                          Tools ({iteration.tools.length})
                        </button>
                        {expandedSections[`${iteration.id}-tools`] && (
                          <div className="mt-1 space-y-1">
                            {iteration.tools.map((tool, idx) => (
                              <div key={idx} className={`flex items-start gap-2 text-xs p-2 rounded ${
                                tool.status === 'success' ? 'bg-green-100' : 'bg-red-100'
                              }`}>
                                {tool.status === 'success' ? 
                                  <CheckCircle className="h-4 w-4 text-green-500" /> : 
                                  <XCircle className="h-4 w-4 text-red-500" />
                                }
                                <div className="flex-1">
                                  <div className="font-medium">{tool.name}</div>
                                  <div className="text-gray-600">{formatTimestamp(tool.timestamp)}</div>
                                  <div className={`font-medium ${tool.status === 'success' ? 'text-green-600' : 'text-red-600'}`}>
                                    Status: {tool.status}
                                  </div>
                                  {tool.params && (
                                    <div>
                                      <div className="font-medium">Params:</div>
                                      <pre className="mt-1 max-h-20 overflow-auto">{formatContent(tool.params)}</pre>
                                    </div>
                                  )}
                                  {tool.error && (
                                    <div>
                                      <div className="font-medium text-red-600">Error:</div>
                                      <div className="text-red-600">{tool.error}</div>
                                    </div>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default IterationStoreDebug;