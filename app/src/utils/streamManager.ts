// src/utils/streamManager.ts
import { startCameraCapture, stopCameraCapture } from './cameraCapture';
import { startScreenCapture, stopScreenCapture } from './screenCapture';
import { startSystemAudioCapture, stopSystemAudioCapture } from './systemAudioCapture';
import { ContinuousTranscriptionService } from './continuousTranscriptionService';


// Add 'audio' to the list of stream types
type StreamType = 'screen' | 'camera' | 'audio';

export interface StreamState {
  screenStream: MediaStream | null;
  cameraStream: MediaStream | null;
  // Add the new audio stream state
  audioStream: MediaStream | null;
}

// The callback function signature for our listeners
type StreamListener = (state: StreamState) => void;

class Manager {
  private screenStream: MediaStream | null = null;
  private cameraStream: MediaStream | null = null;
  // Add a property for the audio stream
  private audioStream: MediaStream | null = null;

  private screenStreamUsers = new Set<string>();
  private cameraStreamUsers = new Set<string>();
  // Add a set for audio stream users
  private audioStreamUsers = new Set<string>();

  private listeners = new Set<StreamListener>();

  // --- Public API ---

  public addListener(listener: StreamListener): void {
    this.listeners.add(listener);
    listener(this.getCurrentState());
  }

  public removeListener(listener: StreamListener): void {
    this.listeners.delete(listener);
  }

  public async requestStream(type: StreamType, agentId: string): Promise<void> {
    const userSet = this.getUserSet(type);
    userSet.add(agentId);

    if (userSet.size === 1) {
      try {
        // Updated to handle the 'audio' type
        let stream: MediaStream | null;
        if (type === 'screen') {
          stream = await startScreenCapture();
        } else if (type === 'camera') {
          stream = await startCameraCapture();
        } else { // 'audio'
          stream = await startSystemAudioCapture();
        }

        if (type === 'audio' && stream) {
            ContinuousTranscriptionService.start(stream);
        }

        this.setStream(type, stream);
        
        // This logic works for all stream types
        stream?.getTracks()[0].addEventListener('ended', () => {
            this.releaseStream(type, agentId, true);
        });

      } catch (error) {
        console.error(`StreamManager: Failed to start ${type} stream`, error);
        userSet.delete(agentId);
        throw error;
      }
    }
  }

  public releaseStream(type: StreamType, agentId: string, streamEndedManually = false): void {
    const userSet = this.getUserSet(type);

    if (streamEndedManually) {
        userSet.clear();
    } else {
        userSet.delete(agentId);
    }

    if (userSet.size === 0 && this.getStream(type)) {
      // Updated to handle 'audio'
      if (type === 'screen') stopScreenCapture();
      else if (type === 'camera') stopCameraCapture();
      else stopSystemAudioCapture(); // 'audio'
      this.setStream(type, null);
    }

    if (type === 'audio') {
          ContinuousTranscriptionService.stop();
    }
  }

  // --- Public Helpers ---

  // Helper to get the current stream state for listeners
  public getCurrentState(): StreamState {
    return {
      screenStream: this.screenStream,
      cameraStream: this.cameraStream,
      audioStream: this.audioStream, // Add audio stream to the state
    };
  }

  private notifyListeners(): void {
    const state = this.getCurrentState();
    this.listeners.forEach(listener => listener(state));
  }
  
  private setStream(type: StreamType, stream: MediaStream | null): void {
    if (type === 'screen') this.screenStream = stream;
    else if (type === 'camera') this.cameraStream = stream;
    else this.audioStream = stream; // 'audio'
    this.notifyListeners();
  }
  
  public getStream(type: StreamType): MediaStream | null {
    if (type === 'screen') return this.screenStream;
    if (type === 'camera') return this.cameraStream;
    return this.audioStream; // 'audio'
  }

  private getUserSet(type: StreamType): Set<string> {
    if (type === 'screen') return this.screenStreamUsers;
    if (type === 'camera') return this.cameraStreamUsers;
    return this.audioStreamUsers; // 'audio'
  }
}

export const StreamManager = new Manager();
