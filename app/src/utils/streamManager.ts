// src/utils/streamManager.ts
import { startCameraCapture, stopCameraCapture } from './cameraCapture';
import { startScreenCapture, stopScreenCapture } from './screenCapture';

type StreamType = 'screen' | 'camera';
export interface StreamState {
  screenStream: MediaStream | null;
  cameraStream: MediaStream | null;
}

// The callback function signature for our listeners
type StreamListener = (state: StreamState) => void;

/**
 * A centralized manager for handling MediaStreams (screen, camera).
 * It uses reference counting to ensure streams are only active when needed by at least one agent.
 * It uses a listener pattern to notify the UI about stream state changes.
 */
class Manager {
  private screenStream: MediaStream | null = null;
  private cameraStream: MediaStream | null = null;

  private screenStreamUsers = new Set<string>();
  private cameraStreamUsers = new Set<string>();

  private listeners = new Set<StreamListener>();

  // --- Public API ---

  /**
   * Adds a listener to be notified of stream state changes.
   * Immediately calls the listener with the current state.
   */
  public addListener(listener: StreamListener): void {
    this.listeners.add(listener);
    listener(this.getCurrentState()); // Immediately provide current state
  }

  /**
   * Removes a listener.
   */
  public removeListener(listener: StreamListener): void {
    this.listeners.delete(listener);
  }

  /**
   * An agent requests a stream. Starts the physical stream if it's the first user.
   */
  public async requestStream(type: StreamType, agentId: string): Promise<void> {
    const userSet = this.getUserSet(type);
    userSet.add(agentId);

    // If this is the first user, start the hardware stream
    if (userSet.size === 1) {
      try {
        const stream = type === 'screen' ? await startScreenCapture() : await startCameraCapture();
        this.setStream(type, stream);
        
        // When the user stops it via browser UI, clean up
        stream?.getVideoTracks()[0].addEventListener('ended', () => {
            this.releaseStream(type, agentId, true);
        });

      } catch (error) {
        console.error(`StreamManager: Failed to start ${type} stream`, error);
        // If starting failed, remove the user who just requested it
        userSet.delete(agentId);
        throw error; // Re-throw for the caller to handle
      }
    }
  }

  /**
   * An agent releases a stream. Stops the physical stream if it's the last user.
   */
  public releaseStream(type: StreamType, agentId: string, streamEndedManually = false): void {
    const userSet = this.getUserSet(type);

    if (streamEndedManually) {
        // If the stream was stopped from the browser, clear all users
        userSet.clear();
    } else {
        userSet.delete(agentId);
    }

    // If this was the last user, stop the hardware stream
    if (userSet.size === 0 && this.getStream(type)) {
      if (type === 'screen') stopScreenCapture();
      else stopCameraCapture();
      this.setStream(type, null);
    }
  }

  // --- Private Helpers ---

  private notifyListeners(): void {
    const state = this.getCurrentState();
    this.listeners.forEach(listener => listener(state));
  }

  private getCurrentState(): StreamState {
    return {
      screenStream: this.screenStream,
      cameraStream: this.cameraStream,
    };
  }

  private setStream(type: StreamType, stream: MediaStream | null): void {
    if (type === 'screen') this.screenStream = stream;
    else this.cameraStream = stream;
    this.notifyListeners();
  }
  
  private getStream(type: StreamType): MediaStream | null {
    return type === 'screen' ? this.screenStream : this.cameraStream;
  }

  private getUserSet(type: StreamType): Set<string> {
    return type === 'screen' ? this.screenStreamUsers : this.cameraStreamUsers;
  }
}

// Export a singleton instance of the manager
export const StreamManager = new Manager();
