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
  sessionId: string;
  sessionIterationNumber: number; // 1, 2, 3... within this session
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

export interface AgentSession {
  sessionId: string;
  agentId: string;
  startTime: string;
  endTime?: string;
  iterations: IterationData[];
}

class IterationStoreClass {
  private iterations = new Map<string, IterationData>();
  private currentSessions = new Map<string, string>(); // agentId -> sessionId
  private sessionIterationCounts = new Map<string, number>(); // sessionId -> count
  private listeners: Array<(iterations: Map<string, IterationData>) => void> = [];

  constructor() {
    // Subscribe to all log entries
    Logger.addListener(this.handleLogEntry.bind(this));
    // Load persisted data on startup
    this.loadFromIndexedDB();
  }

  private handleLogEntry(log: LogEntry) {
    const iterationId = log.details?.iterationId;
    if (!iterationId) return;

    // Get or create iteration
    let iteration = this.iterations.get(iterationId);
    if (!iteration) {
      const agentId = log.source;
      const sessionId = this.currentSessions.get(agentId);
      
      if (!sessionId) {
        // Silently skip - iterations will be processed once session loads from IndexedDB
        return;
      }

      // Get session iteration number
      const currentCount = this.sessionIterationCounts.get(sessionId) || 0;
      const sessionIterationNumber = currentCount + 1;
      this.sessionIterationCounts.set(sessionId, sessionIterationNumber);

      iteration = {
        id: iterationId,
        agentId,
        sessionId,
        sessionIterationNumber,
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

  // IndexedDB setup
  private async openIterationDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('IterationStoreDB', 1);
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
      
      request.onupgradeneeded = () => {
        const db = request.result;
        
        // Store for current sessions tracking
        if (!db.objectStoreNames.contains('currentSessions')) {
          db.createObjectStore('currentSessions', { keyPath: 'agentId' });
        }
        
        // Store for agent session history
        if (!db.objectStoreNames.contains('agentSessions')) {
          db.createObjectStore('agentSessions', { keyPath: 'key' }); // key will be agentId
        }
      };
    });
  }

  private async loadFromIndexedDB() {
    try {
      const db = await this.openIterationDB();
      
      // Load current sessions
      const tx = db.transaction('currentSessions', 'readonly');
      const store = tx.objectStore('currentSessions');
      const request = store.getAll();
      
      await new Promise<void>((resolve, reject) => {
        request.onsuccess = () => {
          const sessions = request.result;
          sessions.forEach((item: { agentId: string, sessionId: string }) => {
            this.currentSessions.set(item.agentId, item.sessionId);
          });
          resolve();
        };
        request.onerror = () => reject(request.error);
      });
    } catch (error) {
      Logger.error('IterationStore', 'Failed to load from IndexedDB', error);
    }
  }

  private async saveToIndexedDB() {
    try {
      const db = await this.openIterationDB();
      const tx = db.transaction('currentSessions', 'readwrite');
      const store = tx.objectStore('currentSessions');
      
      // Clear and rebuild current sessions
      await new Promise<void>((resolve, reject) => {
        const clearRequest = store.clear();
        clearRequest.onsuccess = () => resolve();
        clearRequest.onerror = () => reject(clearRequest.error);
      });
      
      // Add all current sessions
      for (const [agentId, sessionId] of this.currentSessions.entries()) {
        await new Promise<void>((resolve, reject) => {
          const request = store.add({ agentId, sessionId });
          request.onsuccess = () => resolve();
          request.onerror = () => reject(request.error);
        });
      }
    } catch (error) {
      Logger.error('IterationStore', 'Failed to save to IndexedDB', error);
    }
  }

  private async saveSessionToIndexedDB(agentId: string, sessionId: string) {
    try {
      const db = await this.openIterationDB();
      
      // Get existing agent data or create new
      const tx = db.transaction('agentSessions', 'readwrite');
      const store = tx.objectStore('agentSessions');
      
      let agentData: { key: string, currentSession: string, sessions: Record<string, AgentSession> } = {
        key: agentId,
        currentSession: sessionId,
        sessions: {}
      };

      // Try to get existing data
      const existingRequest = store.get(agentId);
      await new Promise<void>((resolve, reject) => {
        existingRequest.onsuccess = () => {
          if (existingRequest.result) {
            agentData = existingRequest.result;
          }
          resolve();
        };
        existingRequest.onerror = () => reject(existingRequest.error);
      });

      // Get all iterations for this session
      const sessionIterations = this.getIterationsForSession(sessionId);
      
      agentData.currentSession = sessionId;
      agentData.sessions[sessionId] = {
        sessionId,
        agentId,
        startTime: sessionIterations.length > 0 ? sessionIterations[0].startTime : new Date().toISOString(),
        iterations: sessionIterations
      };

      // Save updated data
      await new Promise<void>((resolve, reject) => {
        const request = store.put(agentData);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
      
    } catch (error) {
      Logger.error('IterationStore', `Failed to save session ${sessionId} for agent ${agentId}`, error);
    }
  }

  // Public API
  public startSession(agentId: string, sessionId: string) {
    this.currentSessions.set(agentId, sessionId);
    this.sessionIterationCounts.set(sessionId, 0);
    this.saveToIndexedDB();
    Logger.info('IterationStore', `Started session ${sessionId} for agent ${agentId}`);
  }

  public async endSession(agentId: string): Promise<void> {
    const sessionId = this.currentSessions.get(agentId);
    if (sessionId) {
      // Save current session to persistent storage
      await this.saveSessionToIndexedDB(agentId, sessionId);
      
      // Clean up current session data
      this.currentSessions.delete(agentId);
      this.sessionIterationCounts.delete(sessionId);
      
      // Remove iterations from memory (they're now persisted)
      const iterationsToRemove = Array.from(this.iterations.values())
        .filter(iteration => iteration.sessionId === sessionId);
      
      iterationsToRemove.forEach(iteration => {
        this.iterations.delete(iteration.id);
      });
      
      await this.saveToIndexedDB();
      this.notifyListeners();
      
      Logger.info('IterationStore', `Ended session ${sessionId} for agent ${agentId}`);
    }
  }

  public getIterationsForAgent(agentId: string): IterationData[] {
    // Only return current session iterations (from memory)
    const currentSessionId = this.currentSessions.get(agentId);
    if (!currentSessionId) return [];

    return Array.from(this.iterations.values())
      .filter(iteration => iteration.agentId === agentId && iteration.sessionId === currentSessionId)
      .sort((a, b) => a.sessionIterationNumber - b.sessionIterationNumber);
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

  public getIterationsForSession(sessionId: string): IterationData[] {
    return Array.from(this.iterations.values())
      .filter(iteration => iteration.sessionId === sessionId)
      .sort((a, b) => a.sessionIterationNumber - b.sessionIterationNumber);
  }

  public getAllIterations(): IterationData[] {
    return Array.from(this.iterations.values())
      .sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime());
  }

  public async getHistoricalSessions(agentId: string): Promise<AgentSession[]> {
    try {
      const db = await this.openIterationDB();
      const tx = db.transaction('agentSessions', 'readonly');
      const store = tx.objectStore('agentSessions');
      const request = store.get(agentId);
      
      return new Promise((resolve, reject) => {
        request.onsuccess = () => {
          const result = request.result;
          if (!result) {
            resolve([]);
            return;
          }
          
          const sessions = (Object.values(result.sessions || {}) as AgentSession[]).sort((a: AgentSession, b: AgentSession) => 
            new Date(b.startTime).getTime() - new Date(a.startTime).getTime()
          );
          resolve(sessions);
        };
        request.onerror = () => reject(request.error);
      });
    } catch (error) {
      Logger.error('IterationStore', `Failed to get historical sessions for agent ${agentId}`, error);
      return [];
    }
  }

  // Debug method
  public debug() {
    console.log('IterationStore Debug:', {
      totalIterations: this.iterations.size,
      currentSessions: Array.from(this.currentSessions.entries()),
      sessionCounts: Array.from(this.sessionIterationCounts.entries()),
      iterations: Array.from(this.iterations.values())
    });
  }
}

// Export singleton instance
export const IterationStore = new IterationStoreClass();