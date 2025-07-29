// src/utils/IterationStore.ts

import { LogEntry, Logger } from './logging';

export interface SensorData {
  type: 'screenshot' | 'camera' | 'ocr' | 'audio' | 'clipboard' | 'memory';
  content: any;
  timestamp: string;
  size?: number; // For images
  source?: string; // For audio (microphone, screenAudio, allAudio)
}

export interface ToolCall {
  name: string;
  status: 'success' | 'error';
  params?: any;
  error?: string;
  timestamp: string;
}

export interface IterationData {
  id: string;
  agentId: string;
  startTime: string;
  sensors: SensorData[];
  modelPrompt?: string;
  modelImages?: string[]; // Base64 images sent to model
  modelResponse?: string;
  modelResponseTime?: string;
  tools: ToolCall[];
  duration?: number;
  hasError: boolean;
}

class IterationStoreClass {
  private iterations = new Map<string, IterationData>();
  private listeners: Array<(iterations: Map<string, IterationData>) => void> = [];

  constructor() {
    // Subscribe to all log entries
    Logger.addListener(this.handleLogEntry.bind(this));
  }

  private handleLogEntry(log: LogEntry) {
    const iterationId = log.details?.iterationId;
    if (!iterationId) return;

    // Get or create iteration
    let iteration = this.iterations.get(iterationId);
    if (!iteration) {
      iteration = {
        id: iterationId,
        agentId: log.source,
        startTime: log.timestamp.toISOString(),
        sensors: [],
        tools: [],
        hasError: false
      };
      this.iterations.set(iterationId, iteration);
    }

    // At this point, iteration is guaranteed to exist
    const currentIteration = iteration;

    // Process different log types
    const logType = log.details?.logType;
    
    if (logType?.startsWith('sensor-')) {
      this.processSensorLog(currentIteration, log);
    } else if (logType === 'model-prompt') {
      if (typeof log.details?.content === 'object') {
        currentIteration.modelPrompt = log.details.content.modifiedPrompt;
        currentIteration.modelImages = log.details.content.images || [];
      } else {
        currentIteration.modelPrompt = log.details?.content;
        currentIteration.modelImages = [];
      }
    } else if (logType === 'model-response') {
      currentIteration.modelResponse = typeof log.details?.content === 'string' 
        ? log.details.content 
        : '';
      currentIteration.modelResponseTime = log.timestamp.toISOString();
      this.calculateDuration(currentIteration);
    } else if (logType === 'tool-success' || logType === 'tool-error') {
      this.processToolLog(currentIteration, log);
    }

    // Update error status
    if (logType === 'tool-error') {
      currentIteration.hasError = true;
    }

    // Notify listeners
    this.notifyListeners();
  }

  private processSensorLog(iteration: IterationData, log: LogEntry) {
    const logType = log.details?.logType;
    const content = log.details?.content;

    let sensorData: SensorData | null = null;

    switch (logType) {
      case 'sensor-screenshot':
        sensorData = {
          type: 'screenshot',
          content: content,
          timestamp: log.timestamp.toISOString(),
          size: content?.size
        };
        break;
      
      case 'sensor-camera':
        sensorData = {
          type: 'camera',
          content: content,
          timestamp: log.timestamp.toISOString(),
          size: content?.size
        };
        break;
      
      case 'sensor-ocr':
        sensorData = {
          type: 'ocr',
          content: content,
          timestamp: log.timestamp.toISOString()
        };
        break;
      
      case 'sensor-audio':
        sensorData = {
          type: 'audio',
          content: content,
          timestamp: log.timestamp.toISOString(),
          source: content?.source
        };
        break;
      
      case 'sensor-clipboard':
        sensorData = {
          type: 'clipboard',
          content: content,
          timestamp: log.timestamp.toISOString()
        };
        break;
      
      case 'sensor-memory':
        sensorData = {
          type: 'memory',
          content: content,
          timestamp: log.timestamp.toISOString()
        };
        break;
    }

    if (sensorData) {
      iteration.sensors.push(sensorData);
    }
  }

  private processToolLog(iteration: IterationData, log: LogEntry) {
    const isSuccess = log.details?.logType === 'tool-success';
    const content = log.details?.content;

    const toolCall: ToolCall = {
      name: content?.tool || 'unknown',
      status: isSuccess ? 'success' : 'error',
      timestamp: log.timestamp.toISOString()
    };

    if (isSuccess) {
      toolCall.params = content?.params;
    } else {
      toolCall.error = content?.error;
    }

    iteration.tools.push(toolCall);
  }

  private calculateDuration(iteration: IterationData) {
    if (iteration.modelResponseTime) {
      const startTime = new Date(iteration.startTime).getTime();
      const endTime = new Date(iteration.modelResponseTime).getTime();
      iteration.duration = (endTime - startTime) / 1000; // in seconds
    }
  }

  private notifyListeners() {
    this.listeners.forEach(listener => listener(this.iterations));
  }

  // Public API
  public getIterationsForAgent(agentId: string): IterationData[] {
    return Array.from(this.iterations.values())
      .filter(iteration => iteration.agentId === agentId)
      .sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime());
  }

  public getIteration(iterationId: string): IterationData | undefined {
    return this.iterations.get(iterationId);
  }

  public subscribe(listener: (iterations: Map<string, IterationData>) => void) {
    this.listeners.push(listener);
    return () => {
      const index = this.listeners.indexOf(listener);
      if (index > -1) {
        this.listeners.splice(index, 1);
      }
    };
  }

  public getAllIterations(): IterationData[] {
    return Array.from(this.iterations.values())
      .sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime());
  }

  // Debug method
  public debug() {
    console.log('IterationStore Debug:', {
      totalIterations: this.iterations.size,
      iterations: Array.from(this.iterations.values())
    });
  }
}

// Export singleton instance
export const IterationStore = new IterationStoreClass();