import { StreamManager } from './streamManager';
// FIX: Imported 'ClipMarker' type (PascalCase) instead of 'clipMarker' value.
import { saveRecordingToDb, ClipMarker } from './recordingsDB';
import { Logger } from './logging';

type RecordableStreamType = 'screen' | 'camera';
type RecordingState = 'IDLE' | 'BUFFERING' | 'RECORDING';

// FIX: Renamed class from 'Manager' to 'RecordingManager' as requested.
class RecordingManager {
  private state: RecordingState = 'IDLE';
  private recorders = new Map<RecordableStreamType, MediaRecorder>();
  private chunks = new Map<RecordableStreamType, Blob[]>();
  // FIX: This now correctly references the imported 'ClipMarker' type.
  private pendingMarkers: ClipMarker[] = [];


  // --- Public API for Agent Lifecycle ---

  public initialize(): void {
    if (this.state === 'IDLE') {
      Logger.info("RecordingManager", "Initializing and starting the first buffer.");
      this.startNewBuffer();
    }
  }

  public handleEndOfLoop(): void {
    if (this.state === 'BUFFERING') {
      Logger.debug("RecordingManager", "End of loop: In BUFFERING state. Cycling buffer.");
      this.discardCurrentBuffer();
      this.startNewBuffer();
    } else if (this.state === 'RECORDING') {
      Logger.debug("RecordingManager", "End of loop: In RECORDING state. Continuing recording.");
    }
  }

  public async forceStop(): Promise<void> {
    Logger.info("RecordingManager", `forceStop called. Current state: ${this.state}`);
    if (this.state === 'RECORDING') {
      await this.saveAndFinishClip();
    } else if (this.state === 'BUFFERING') {
      this.discardAndShutdown();
    }
    this.state = 'IDLE';
  }

  public addMarker(label: string): void {
    if (this.state === 'IDLE') {
      Logger.warn("RecordingManager", `markClip called while IDLE. Marker will be stored and attached to the next recording session.`);
    }
    // FIX: This now correctly references the imported 'ClipMarker' type.
    const marker: ClipMarker = {
      label,
      timestamp: Date.now(),
    };
    this.pendingMarkers.push(marker);
    Logger.info("RecordingManager", `Marker added: "${label}" at ${new Date(marker.timestamp).toLocaleTimeString()}`);
  }

  // --- Public API for Agent Tools ---

  public startClip(): void {
    if (this.state === 'BUFFERING') {
      this.state = 'RECORDING';
      Logger.info("RecordingManager", "startClip called. State changed to RECORDING. The current buffer will be saved.");
    } else {
      Logger.warn("RecordingManager", `startClip called in unexpected state: ${this.state}. No action taken.`);
    }
  }

  public async stopClip(): Promise<void> {
    if (this.state === 'RECORDING') {
      Logger.info("RecordingManager", "stopClip called. Saving clip and returning to BUFFERING state.");
      await this.saveAndFinishClip();
      this.startNewBuffer();
    } else {
      Logger.warn("RecordingManager", `stopClip called in unexpected state: ${this.state}. No action taken.`);
    }
  }

  // --- Private Implementation ---

  private async saveAndFinishClip(): Promise<void> {
    if (this.recorders.size === 0) {
      Logger.warn("recordingManager", "saveAndFinishClip called but no active recorders.");
      return;
    }
  
    const saveJobs: Promise<void>[] = [];
  
    this.recorders.forEach((recorder, type) => {
      const chunks = this.chunks.get(type) ?? [];
      Logger.debug("recordingManager",
        `Preparing to stop '${type}' recorder. Current chunks: ${chunks.length}, state: ${recorder.state}`);
  
      const job = new Promise<void>((resolve) => {
        const handleData = (e: BlobEvent) => {
          if (e.data.size) {
            chunks.push(e.data);
            Logger.debug("recordingManager",
              `'${type}' got data chunk (${e.data.size} bytes). Total chunks: ${chunks.length}`);
          }
        };
  
        const handleStop = async () => {
          recorder.removeEventListener('dataavailable', handleData);
          recorder.removeEventListener('stop', handleStop);
  
          if (chunks.length === 0) {
            Logger.warn("recordingManager", `'${type}' stopped – no data, nothing saved.`);
            resolve();
            return;
          }
  
          const blob = new Blob(chunks, { type: recorder.mimeType });
          const filename = `${type}-clip-${Date.now()}`;
          Logger.info("recordingManager",
            `'${type}' stopped. Saving ${chunks.length} chunks (${blob.size} bytes) as '${filename}'.`);
  
          try {
            await saveRecordingToDb(blob, this.pendingMarkers); 
            Logger.info("recordingManager", `Saved clip for '${type}' with ${this.pendingMarkers.length} markers successfully.`);
          } catch (err) {
            Logger.error("recordingManager", `Failed to save clip for '${type}'.`, err);
          }

          resolve();
        };
  
        recorder.addEventListener('dataavailable', handleData);
        recorder.addEventListener('stop', handleStop);
        recorder.stop();
      });
  
      saveJobs.push(job);
    });
  
    await Promise.all(saveJobs);

    if (this.pendingMarkers.length > 0) {
        Logger.info("RecordingManager", `All clips for this session saved. Clearing ${this.pendingMarkers.length} markers.`);
        this.pendingMarkers = [];
    }
  
    this.recorders.clear();
    this.chunks.clear();
    Logger.debug("recordingManager", "All recorders saved & cleared.");
  }
  
  private startNewBuffer(): void {
    if (this.recorders.size > 0) {
      this.discardAndShutdown();
    }
  
    const { screenStream, cameraStream, audioStream } = StreamManager.getCurrentState();
    const streamsToRecord = [
      { type: 'screen' as RecordableStreamType, stream: screenStream },
      { type: 'camera' as RecordableStreamType, stream: cameraStream }
    ];
    
    let bufferStarted = false;
    for (const { type, stream } of streamsToRecord) {
      if (!stream) continue;
  
      const tracks = [...stream.getVideoTracks()];
      if (audioStream) {
        tracks.push(...audioStream.getAudioTracks());
      }
      const combinedStream = new MediaStream(tracks);
      
      const mediaRecorder = new MediaRecorder(combinedStream, { mimeType: 'video/mp4' });
      const chunksForType: Blob[] = [];
      this.chunks.set(type, chunksForType);
  
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksForType.push(event.data);
      };
      
      this.recorders.set(type, mediaRecorder);
      mediaRecorder.start(1000);
      bufferStarted = true;
    }
  
    if (bufferStarted) {
      this.state = 'BUFFERING';
      Logger.debug("RecordingManager", "New buffer started successfully. State is now BUFFERING.");
    } else {
      this.state = 'IDLE';
      Logger.warn("RecordingManager", "startNewBuffer called, but no active streams found to record.");
    }
  }

  private discardCurrentBuffer(): void {
    this.chunks.clear();
    this.recorders.forEach(recorder => recorder.stop());
  }

  private discardAndShutdown(): void {
    this.discardCurrentBuffer();
    this.state = 'IDLE';
    Logger.info("RecordingManager", "Buffer discarded and manager is now IDLE.");
  }

  public getState(): RecordingState {
    return this.state;
  }
}

// FIX: Instantiating the renamed 'RecordingManager' class.
export const recordingManager = new RecordingManager();
