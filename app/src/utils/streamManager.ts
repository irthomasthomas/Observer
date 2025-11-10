import { Logger } from './logging';
import { WhisperTranscriptionService } from './whisper/WhisperTranscriptionService';

// --- Core Type Definitions ---
export type AudioStreamType = 'screenAudio' | 'microphone' | 'allAudio';
export type PseudoStreamType = 'camera' | 'screenVideo' | AudioStreamType;
type MasterStreamType = 'display' | 'camera' | 'microphone';

/**
 * The single source of truth for the stream state provided to the UI.
 * It is clean, specific, and has no legacy/adapter properties.
 */
export interface StreamState {
  cameraStream: MediaStream | null;
  screenVideoStream: MediaStream | null;
  screenAudioStream: MediaStream | null;
  microphoneStream: MediaStream | null;
  allAudioStream: MediaStream | null;
}
type StreamListener = (state: StreamState) => void;

class Manager {
  // --- Clean Pseudo-Stream State ---
  private cameraStream: MediaStream | null = null;
  private screenVideoStream: MediaStream | null = null;
  private screenAudioStream: MediaStream | null = null;
  private microphoneStream: MediaStream | null = null;
  private allAudioStream: MediaStream | null = null;
  
  // --- Internal Management State ---
  private masterDisplayStream: MediaStream | null = null;
  private masterCameraStream: MediaStream | null = null;
  private masterMicrophoneStream: MediaStream | null = null;
  
  private userSets = new Map<PseudoStreamType, Set<string>>();
  private listeners = new Set<StreamListener>();
  private pendingMasterStreams = new Map<MasterStreamType, Promise<void>>();
  private transcriptionServices = new Map<AudioStreamType, WhisperTranscriptionService>();
  
  private audioContext: AudioContext | null = null;
  private sourceNodes = new Map<string, MediaStreamAudioSourceNode>();
  
  constructor() {
    const allStreamTypes: PseudoStreamType[] = ['camera', 'screenVideo', 'screenAudio', 'microphone', 'allAudio'];
    allStreamTypes.forEach(type => this.userSets.set(type, new Set()));
  }

  // --- Public API ---
  
  /** The primary method for acquiring streams, using a "blueprint" approach. */
  public async requestStreamsForAgent(agentId: string, requiredStreams: PseudoStreamType[]): Promise<void> {
    Logger.debug("StreamManager", `Processing stream blueprint for agent '${agentId}': [${requiredStreams.join(', ')}]`);
    
    const requiredMasterStreams = new Set<MasterStreamType>();
    for (const type of requiredStreams) {
      if (type === 'camera') requiredMasterStreams.add('camera');
      if (type === 'screenVideo' || type === 'screenAudio' || type === 'allAudio') requiredMasterStreams.add('display');
      if (type === 'microphone' || type === 'allAudio') requiredMasterStreams.add('microphone');
    }

    const acquisitionPromises: Promise<void>[] = [];
    requiredMasterStreams.forEach(masterType => acquisitionPromises.push(this.ensureMasterStream(masterType)));

    try {
      await Promise.all(acquisitionPromises);

      for (const type of requiredStreams) {
        if (!this.isPseudoStreamAvailable(type)) {
          throw new Error(`Failed to acquire required stream component '${type}'. Permission may have been denied.`);
        }
      }

      // --- ADDED: Centralized Transcription & Mixer Logic ---
      // This block ensures services are only started for the streams the agent explicitly requested.
      if (requiredStreams.includes('allAudio')) {
        this.initializeAudioMixer();
      }
      if (requiredStreams.includes('microphone') && this.microphoneStream) {
        this.startTranscriptionForStream('microphone', this.microphoneStream);
      }
      if (requiredStreams.includes('screenAudio') && this.screenAudioStream) {
        this.startTranscriptionForStream('screenAudio', this.screenAudioStream);
      }
      // --- END ADDED ---

      requiredStreams.forEach(type => this.userSets.get(type)?.add(agentId));

    } catch (error) {
      Logger.error("StreamManager", `Failed to fulfill stream blueprint for agent '${agentId}'.`, error);
      throw error;
    }
  }

  /** Releases all streams used by a specific agent. */
  public releaseStreamsForAgent(agentId: string): void {
    Logger.debug("StreamManager", `Releasing all streams for agent '${agentId}'`);
    this.userSets.forEach((users, _type) => {
        if (users.has(agentId)) {
            users.delete(agentId);
        }
    });
    this.checkForTeardown();
  }

  public getTranscript(type: AudioStreamType): string {
    return this.transcriptionServices.get(type)?.getTranscript() ?? '';
  }

  public addListener(listener: StreamListener): void { this.listeners.add(listener); listener(this.getCurrentState()); }
  public removeListener(listener: StreamListener): void { this.listeners.delete(listener); }
  
  public getCurrentState(): StreamState {
    return {
      cameraStream: this.cameraStream,
      screenVideoStream: this.screenVideoStream,
      screenAudioStream: this.screenAudioStream,
      microphoneStream: this.microphoneStream,
      allAudioStream: this.allAudioStream,
    };
  }

  // --- Camera Device Management ---

  /** Get list of available camera devices */
  public async getAvailableCameraDevices(): Promise<MediaDeviceInfo[]> {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter(device => device.kind === 'videoinput');
      Logger.debug("StreamManager", `Found ${videoDevices.length} camera devices.`);
      return videoDevices;
    } catch (error) {
      Logger.error("StreamManager", "Failed to enumerate camera devices.", error);
      return [];
    }
  }

  /** Get the stored preferred camera device ID from localStorage */
  public getPreferredCameraDevice(): string | null {
    return localStorage.getItem('observer_preferred_camera_device');
  }

  /** Set the preferred camera device ID in localStorage */
  public setPreferredCameraDevice(deviceId: string): void {
    localStorage.setItem('observer_preferred_camera_device', deviceId);
    Logger.info("StreamManager", `Preferred camera device set to: ${deviceId}`);
  }

  /** Switch to a different camera device (stops current stream and re-acquires with new device) */
  public async switchCameraDevice(deviceId: string): Promise<void> {
    Logger.info("StreamManager", `Switching camera to device: ${deviceId}`);

    // Save the preference
    this.setPreferredCameraDevice(deviceId);

    // Get all agents currently using the camera
    const cameraUsers = Array.from(this.userSets.get('camera') || []);

    // Teardown current camera stream
    this.teardownCameraStream();

    // Re-acquire camera with new device for all users
    if (cameraUsers.length > 0) {
      try {
        await this.ensureMasterStream('camera');
        Logger.info("StreamManager", "Camera switched successfully.");
      } catch (error) {
        Logger.error("StreamManager", "Failed to switch camera device.", error);
        throw error;
      }
    }
  }

  // --- Private Implementation ---

  private ensureMasterStream(type: MasterStreamType): Promise<void> {
    if (this.pendingMasterStreams.has(type)) {
      Logger.debug("StreamManager", `Joining pending request for '${type}' stream.`);
      return this.pendingMasterStreams.get(type)!;
    }
    
    const promise = this.acquireMasterStream(type).finally(() => {
      this.pendingMasterStreams.delete(type);
    });

    this.pendingMasterStreams.set(type, promise);
    return promise;
  }
  
  private async acquireMasterStream(type: MasterStreamType): Promise<void> {
    try {
      switch (type) {
        case 'display':
          if (this.masterDisplayStream) return;
          const displayStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
          this.masterDisplayStream = displayStream;
          this.screenVideoStream = new MediaStream(displayStream.getVideoTracks());
          if (displayStream.getAudioTracks().length > 0) {
              const audioStream = new MediaStream(displayStream.getAudioTracks());
              this.screenAudioStream = audioStream;
              // --- MODIFIED: Removed transcription start from here ---
          }
          displayStream.getVideoTracks()[0]?.addEventListener('ended', () => this.handleMasterStreamEnd('display'));
          break;
        case 'camera':
          if (this.masterCameraStream) return;

          // Try to use preferred camera device, fallback to default
          const preferredDeviceId = this.getPreferredCameraDevice();
          let constraints: MediaStreamConstraints = { video: true };

          if (preferredDeviceId) {
            constraints = { video: { deviceId: { exact: preferredDeviceId } } };
            Logger.debug("StreamManager", `Requesting camera with deviceId: ${preferredDeviceId}`);
          }

          try {
            const cameraStream = await navigator.mediaDevices.getUserMedia(constraints);
            this.masterCameraStream = cameraStream;
            this.cameraStream = cameraStream;
            cameraStream.getVideoTracks()[0]?.addEventListener('ended', () => this.handleMasterStreamEnd('camera'));
          } catch (error) {
            // If preferred device fails, try default camera
            if (preferredDeviceId) {
              Logger.warn("StreamManager", `Preferred camera device failed, falling back to default.`, error);
              const fallbackStream = await navigator.mediaDevices.getUserMedia({ video: true });
              this.masterCameraStream = fallbackStream;
              this.cameraStream = fallbackStream;
              fallbackStream.getVideoTracks()[0]?.addEventListener('ended', () => this.handleMasterStreamEnd('camera'));
            } else {
              throw error;
            }
          }
          break;
        case 'microphone':
          if (this.masterMicrophoneStream) return;
          const micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
          this.masterMicrophoneStream = micStream;
          this.microphoneStream = micStream;
          // --- MODIFIED: Removed transcription start from here ---
          break;
      }
      Logger.info("StreamManager", `Master '${type}' stream acquired.`);
      this.notifyListeners();
    } catch (error) {
      Logger.error("StreamManager", `Acquisition of master '${type}' stream failed.`, error);
      throw error;
    }
  }
  
  private isPseudoStreamAvailable(type: PseudoStreamType): boolean {
    switch (type) {
        case 'camera': return !!this.cameraStream;
        case 'screenVideo': return !!this.screenVideoStream;
        case 'screenAudio': return !!this.screenAudioStream;
        case 'microphone': return !!this.microphoneStream;
        case 'allAudio': return !!this.screenAudioStream && !!this.microphoneStream;
    }
    return false;
  }

  private initializeAudioMixer(): void {
    if (this.audioContext || !this.screenAudioStream || !this.microphoneStream) return;
    Logger.info("StreamManager", "Initializing audio mixer for 'allAudio'.");
    this.audioContext = new AudioContext();
    const destination = this.audioContext.createMediaStreamDestination();
    const screenSource = this.audioContext.createMediaStreamSource(this.screenAudioStream);
    screenSource.connect(destination);
    this.sourceNodes.set('screen', screenSource);
    const micSource = this.audioContext.createMediaStreamSource(this.microphoneStream);
    micSource.connect(destination);
    this.sourceNodes.set('microphone', micSource);
    this.allAudioStream = destination.stream;
    // This now correctly starts transcription only when the mixer is initialized
    this.startTranscriptionForStream('allAudio', this.allAudioStream);
    this.notifyListeners();
  }
  
  private checkForTeardown(): void {
    const isUsed = (type: PseudoStreamType) => (this.userSets.get(type)?.size || 0) > 0;
    // This logic is now robust because it correctly reflects the lifecycle based on user sets.
    if (!isUsed('screenVideo') && !isUsed('screenAudio') && !isUsed('allAudio')) this.teardownDisplayStream();
    if (!isUsed('microphone') && !isUsed('allAudio')) this.teardownMicrophoneStream();
    if (!isUsed('camera')) this.teardownCameraStream();
    if (!isUsed('allAudio')) this.teardownAudioMixer();
  }
  
  private handleMasterStreamEnd(type: MasterStreamType): void {
    Logger.warn("StreamManager", `Master ${type} stream ended unexpectedly.`);
    if (type === 'display') {
      this.userSets.get('screenVideo')?.clear();
      this.userSets.get('screenAudio')?.clear();
    } else {
      this.userSets.get('camera')?.clear();
    }
    this.userSets.get('allAudio')?.clear();
    this.checkForTeardown();
  }

  private teardownDisplayStream(): void {
    if (!this.masterDisplayStream) return;
    Logger.info("StreamManager", "Tearing down master display stream.");
    this.masterDisplayStream.getTracks().forEach(track => track.stop());
    this.stopTranscriptionForStream('screenAudio'); // This correctly stops the screen audio transcription
    this.masterDisplayStream = null;
    this.screenVideoStream = null;
    this.screenAudioStream = null;
    this.notifyListeners();
  }
  
  private teardownCameraStream(): void {
    if (!this.masterCameraStream) return;
    Logger.info("StreamManager", "Tearing down master camera stream.");
    this.masterCameraStream.getTracks().forEach(track => track.stop());
    this.masterCameraStream = null;
    this.cameraStream = null;
    this.notifyListeners();
  }

  private teardownMicrophoneStream(): void {
    if (!this.masterMicrophoneStream) return;
    Logger.info("StreamManager", "Tearing down master microphone stream.");
    this.masterMicrophoneStream.getTracks().forEach(track => track.stop());
    this.stopTranscriptionForStream('microphone'); // This correctly stops the microphone transcription
    this.masterMicrophoneStream = null;
    this.microphoneStream = null;
    this.notifyListeners();
  }
  
  private teardownAudioMixer(): void {
    if (!this.audioContext) return;
    Logger.info("StreamManager", "Tearing down audio mixer.");
    this.sourceNodes.forEach(node => node.disconnect());
    this.sourceNodes.clear();
    this.stopTranscriptionForStream('allAudio'); // This correctly stops the mixed audio transcription
    this.audioContext.close();
    this.audioContext = null;
    this.allAudioStream = null;
    this.notifyListeners();
  }

  private startTranscriptionForStream(type: AudioStreamType, stream: MediaStream): void {
    if (this.transcriptionServices.has(type)) return;
    Logger.info("StreamManager", `Starting transcription service for '${type}'.`);
    const newService = new WhisperTranscriptionService();
    newService.start(stream);
    this.transcriptionServices.set(type, newService);
  }

  private stopTranscriptionForStream(type: AudioStreamType): void {
    const service = this.transcriptionServices.get(type);
    if (service) {
      Logger.info("StreamManager", `Stopping transcription service for '${type}'.`);
      service.stop();
      this.transcriptionServices.delete(type);
    }
  }

  private notifyListeners(): void {
    const state = this.getCurrentState();
    this.listeners.forEach(listener => listener(state));
  }
}

export const StreamManager = new Manager();
