import { invoke, Channel } from '@tauri-apps/api/core';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import { isTauri, isDesktop } from './platform';
import { Logger } from '@utils/logging';

export interface BroadcastStatus {
  isActive: boolean;
  isStale: boolean;
  frame: string | null;
  timestamp: number | null;
  frameCount: number;
  targetId?: string | null;
}

export interface CaptureTarget {
  id: string;
  kind: 'monitor' | 'window';
  name: string;
  appName?: string;
  thumbnail?: string;
  width: number;
  height: number;
  isPrimary: boolean;
  x: number;
  y: number;
}

/** Frame data received from Rust via Channel */
export interface FrameData {
  frame: string;      // Base64-encoded JPEG
  timestamp: number;  // Unix timestamp
  width: number;
  height: number;
  frameCount: number;
}

/** Audio data received from Rust via Channel */
export interface AudioData {
  samples: string;      // Base64-encoded PCM (f32 samples, little-endian, mono)
  timestamp: number;    // Unix timestamp
  sampleRate: number;   // e.g., 48000
  chunkCount: number;   // Sequence number
}

/** Result of starting a capture stream */
export interface CaptureStreamResult {
  /** Clean stream for AI/main_loop - no overlay */
  cleanStream: MediaStream;
  /** Stream with PiP overlay for user display */
  pipStream: MediaStream;
  /** Screen audio as MediaStream (like browser's getDisplayMedia audio) */
  screenAudioStream: MediaStream | null;
  /** Stop the capture and cleanup */
  stop: () => Promise<void>;
  /** Get the latest base64 frame directly (for pre-processor) */
  getLatestFrame: () => string | null;
  /** Get the latest audio data (raw PCM) */
  getLatestAudio: () => AudioData | null;
}

/** Callback for PiP overlay drawing */
export type PipOverlayDrawer = (
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number
) => void;

/** Result of starting a video-only stream */
export interface VideoStreamResult {
  /** Clean stream for AI/main_loop - no overlay */
  cleanStream: MediaStream;
  /** Stream with PiP overlay for user display */
  pipStream: MediaStream;
  /** Stop the video capture and cleanup */
  stop: () => Promise<void>;
  /** Get the latest base64 frame directly (for pre-processor) */
  getLatestFrame: () => string | null;
}

/** Result of starting an audio-only stream */
export interface AudioStreamResult {
  /** Screen audio as MediaStream */
  audioStream: MediaStream;
  /** Stop the audio capture and cleanup */
  stop: () => Promise<void>;
  /** Get the latest audio data (raw PCM) */
  getLatestAudio: () => AudioData | null;
}

/**
 * Unified Tauri screen capture - works on both mobile and desktop
 * Uses the screen-capture plugin which handles platform-specific capture internally
 */
export type MasterStreamType = 'display' | 'camera' | 'microphone' | 'screenAudio';

export interface TauriCaptureStreams {
  screenVideoStream: MediaStream | null;
  screenAudioStream: MediaStream | null;
  cameraStream: MediaStream | null;
  microphoneStream: MediaStream | null;
}

class TauriStreamCapture {
  private capturing = false;
  private latestBase64Frame: string | null = null;
  private latestAudioData: AudioData | null = null;
  private pipOverlayDrawer: PipOverlayDrawer | null = null;

  // Stream state for new interface
  private streams: TauriCaptureStreams = {
    screenVideoStream: null,
    screenAudioStream: null,
    cameraStream: null,
    microphoneStream: null,
  };

  private pendingAcquisitions = new Map<MasterStreamType, Promise<void>>();

  // Active stream results (for cleanup)
  private videoStreamResult: VideoStreamResult | null = null;
  private audioStreamResult: AudioStreamResult | null = null;

  /**
   * Acquire a master stream (Tauri implementation)
   * Tauri-specific: screenAudio is independent from display
   */
  async acquireMasterStream(type: MasterStreamType): Promise<void> {
    if (this.pendingAcquisitions.has(type)) {
      Logger.debug("TauriCapture", `Joining pending request for '${type}' stream`);
      return this.pendingAcquisitions.get(type)!;
    }

    const promise = this._acquireMasterStreamImpl(type).finally(() => {
      this.pendingAcquisitions.delete(type);
    });

    this.pendingAcquisitions.set(type, promise);
    return promise;
  }

  private async _acquireMasterStreamImpl(type: MasterStreamType): Promise<void> {
    switch (type) {
      case 'display':
        if (this.streams.screenVideoStream) return;

        Logger.info("TauriCapture", "Starting video capture");
        const videoResult = await this.startVideoStream();
        this.streams.screenVideoStream = videoResult.cleanStream;
        this.videoStreamResult = videoResult;
        break;

      case 'screenAudio':
        if (this.streams.screenAudioStream) return;

        Logger.info("TauriCapture", "Starting independent system audio capture");
        const audioResult = await this.startAudioStream();
        this.streams.screenAudioStream = audioResult.audioStream;
        this.audioStreamResult = audioResult;
        break;

      case 'camera':
        if (this.streams.cameraStream) return;

        Logger.info("TauriCapture", "Starting camera capture");
        const cameraStream = await navigator.mediaDevices.getUserMedia({ video: true });
        this.streams.cameraStream = cameraStream;
        break;

      case 'microphone':
        if (this.streams.microphoneStream) return;

        Logger.info("TauriCapture", "Starting microphone capture");
        const micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        this.streams.microphoneStream = micStream;
        break;
    }

    Logger.info("TauriCapture", `Master '${type}' stream acquired`);
  }

  /**
   * Teardown a specific master stream
   */
  teardownMasterStream(type: MasterStreamType): void {
    switch (type) {
      case 'display':
        if (this.videoStreamResult) {
          Logger.info("TauriCapture", "Tearing down video stream");
          this.videoStreamResult.stop();
          this.videoStreamResult = null;
          this.streams.screenVideoStream = null;
        }
        break;

      case 'screenAudio':
        if (this.audioStreamResult) {
          Logger.info("TauriCapture", "Tearing down audio stream");
          this.audioStreamResult.stop();
          this.audioStreamResult = null;
          this.streams.screenAudioStream = null;
        }
        break;

      case 'camera':
        if (this.streams.cameraStream) {
          Logger.info("TauriCapture", "Tearing down camera stream");
          this.streams.cameraStream.getTracks().forEach(track => track.stop());
          this.streams.cameraStream = null;
        }
        break;

      case 'microphone':
        if (this.streams.microphoneStream) {
          Logger.info("TauriCapture", "Tearing down microphone stream");
          this.streams.microphoneStream.getTracks().forEach(track => track.stop());
          this.streams.microphoneStream = null;
        }
        break;
    }
  }

  /**
   * Get current streams
   */
  getStreams(): TauriCaptureStreams {
    return { ...this.streams };
  }

  /**
   * Check if a stream is available
   */
  isStreamAvailable(type: 'camera' | 'screenVideo' | 'screenAudio' | 'microphone'): boolean {
    switch (type) {
      case 'camera':
        return !!this.streams.cameraStream;
      case 'screenVideo':
        return !!this.streams.screenVideoStream;
      case 'screenAudio':
        return !!this.streams.screenAudioStream;
      case 'microphone':
        return !!this.streams.microphoneStream;
    }
  }

  /**
   * Map pseudo-stream type to required master streams (Tauri-specific logic)
   * In Tauri, screenAudio is INDEPENDENT from display (unlike browser)
   */
  getMasterStreamsForPseudoStream(pseudoStream: string): MasterStreamType[] {
    switch (pseudoStream) {
      case 'camera':
        return ['camera'];
      case 'screenVideo':
        return ['display'];
      case 'screenAudio':
        return ['screenAudio']; // Tauri: independent audio capture
      case 'microphone':
        return ['microphone'];
      case 'allAudio':
        return ['screenAudio', 'microphone']; // Both independent
      default:
        return [];
    }
  }

  /**
   * Set a custom PiP overlay drawer function.
   * This will be called after each frame is drawn to the PiP canvas.
   */
  setPipOverlayDrawer(drawer: PipOverlayDrawer | null): void {
    this.pipOverlayDrawer = drawer;
  }

  /**
   * Get the latest base64 frame directly (for pre-processor).
   * Avoids re-encoding from canvas.
   */
  getLatestBase64Frame(): string | null {
    return this.latestBase64Frame;
  }

  /**
   * Get the latest audio data directly.
   * Returns raw PCM audio data (base64-encoded f32 samples).
   */
  getLatestAudioData(): AudioData | null {
    return this.latestAudioData;
  }

  /**
   * Start video-only capture stream.
   * Independent from audio - use startAudioStream separately if you also need audio.
   * Works on both desktop and iOS.
   */
  async startVideoStream(targetId?: string): Promise<VideoStreamResult> {
    if (!isTauri()) {
      throw new Error('Screen capture only available in Tauri');
    }

    Logger.info("TAURI_STREAM", `Starting video-only capture stream`);

    // Desktop: Show selector and wait for target selection (unless targetId provided)
    // iOS: Will trigger ReplayKit picker later
    let selectedTargetId: string | undefined = targetId;
    if (isDesktop() && !selectedTargetId) {
      const selected = await this.waitForTargetSelection();
      if (!selected) {
        throw new Error('Screen capture cancelled by user');
      }
      selectedTargetId = selected;
    }

    Logger.info("TAURI_STREAM", `Starting video capture with target: ${selectedTargetId || 'iOS broadcast'}`);

    // Create two canvases: clean (for AI) and pip (for display with overlay)
    const canvasClean = document.createElement('canvas');
    const canvasPip = document.createElement('canvas');

    canvasClean.width = 1920;
    canvasClean.height = 1080;
    canvasPip.width = 1920;
    canvasPip.height = 1080;

    const ctxClean = canvasClean.getContext('2d');
    const ctxPip = canvasPip.getContext('2d');

    if (!ctxClean || !ctxPip) {
      throw new Error('Failed to create canvas contexts');
    }

    const cleanStream = canvasClean.captureStream(30);
    const pipStream = canvasPip.captureStream(30);

    let canvasSizeInitialized = false;
    let frameCount = 0;
    let isActive = true;
    const cachedImage = new Image();

    const frameChannel = new Channel<FrameData>();

    frameChannel.onmessage = (frameData: FrameData) => {
      if (!isActive) return;

      frameCount++;
      this.latestBase64Frame = frameData.frame;

      if (frameCount === 1) {
        Logger.info("TAURI_STREAM", `First video frame received`);
      }
      if (frameCount % 100 === 0) {
        Logger.debug("TAURI_STREAM", `Received ${frameCount} video frames`);
      }

      cachedImage.onload = () => {
        if (!isActive) return;

        if (!canvasSizeInitialized && cachedImage.naturalWidth > 0) {
          canvasClean.width = cachedImage.naturalWidth;
          canvasClean.height = cachedImage.naturalHeight;
          canvasPip.width = cachedImage.naturalWidth;
          canvasPip.height = cachedImage.naturalHeight;
          canvasSizeInitialized = true;
          Logger.info("TAURI_STREAM", `Video canvas adapted to ${cachedImage.naturalWidth}x${cachedImage.naturalHeight}`);
        }

        ctxClean.drawImage(cachedImage, 0, 0);
        ctxPip.drawImage(cachedImage, 0, 0);

        if (this.pipOverlayDrawer) {
          this.pipOverlayDrawer(ctxPip, canvasPip.width, canvasPip.height);
        }
      };

      cachedImage.src = 'data:image/jpeg;base64,' + frameData.frame;
    };

    // Start video-only capture
    if (isDesktop()) {
      // Desktop: Use screen-capture plugin
      await invoke('plugin:screen-capture|start_video_stream_cmd', {
        targetId: selectedTargetId || null,
        onFrame: frameChannel,
      });
    } else {
      // iOS: Get App Group path, register channel then trigger ReplayKit picker
      let appGroupPath: string | null = null;
      try {
        appGroupPath = await invoke<string>('plugin:screen-capture|get_app_group_path_cmd');
        Logger.info("TAURI_STREAM", `iOS App Group path for video: ${appGroupPath}`);
      } catch (e) {
        Logger.warn("TAURI_STREAM", `Could not get App Group path: ${e}`);
      }

      await invoke('start_capture_stream_cmd', {
        onFrame: frameChannel,
        appGroupPath: appGroupPath,
      });
      await invoke<boolean>('plugin:screen-capture|start_capture_cmd');
    }

    this.capturing = true;
    Logger.info("TAURI_STREAM", "Video-only capture stream started");

    return {
      cleanStream,
      pipStream,
      stop: async () => {
        isActive = false;
        this.capturing = false;
        this.latestBase64Frame = null;

        if (isDesktop()) {
          await invoke('plugin:screen-capture|stop_video_cmd');
        } else {
          // iOS: Stop capture stream and broadcast
          try {
            await invoke('stop_capture_stream_cmd');
          } catch (e) {
            Logger.warn("TAURI_STREAM", `Error stopping capture stream: ${e}`);
          }
          await invoke('plugin:screen-capture|stop_capture_cmd');
        }

        cleanStream.getTracks().forEach(track => track.stop());
        pipStream.getTracks().forEach(track => track.stop());

        Logger.info("TAURI_STREAM", `Video stream stopped after ${frameCount} frames`);
      },
      getLatestFrame: () => this.latestBase64Frame,
    };
  }

  /**
   * Start audio-only capture stream.
   * Independent from video - use startVideoStream separately if you also need video.
   * Works on both desktop (macOS) and iOS.
   */
  async startAudioStream(): Promise<AudioStreamResult> {
    if (!isTauri()) {
      throw new Error('Audio capture only available in Tauri');
    }

    Logger.info("TAURI_STREAM", `Starting audio-only capture stream`);

    let audioContext: AudioContext | null = null;
    let workletNode: AudioWorkletNode | null = null;
    let audioStream: MediaStream | null = null;
    let audioDestination: MediaStreamAudioDestinationNode | null = null;
    let audioChunkCount = 0;
    let isActive = true;
    let configuredSampleRate = 0;

    // AudioWorklet code for mono PCM playback using efficient ring buffer
    const workletCode = `
      class PCMPlayerProcessor extends AudioWorkletProcessor {
        constructor() {
          super();
          // Ring buffer: ~1.3 seconds at 48kHz (power of 2 for fast modulo)
          this.bufferSize = 65536;
          this.bufferMask = this.bufferSize - 1;
          this.buffer = new Float32Array(this.bufferSize);
          this.writeIndex = 0;
          this.readIndex = 0;

          this.port.onmessage = (e) => {
            const samples = e.data;
            const len = samples.length;
            for (let i = 0; i < len; i++) {
              this.buffer[(this.writeIndex + i) & this.bufferMask] = samples[i];
            }
            this.writeIndex = (this.writeIndex + len) & this.bufferMask;
          };
        }

        process(inputs, outputs, parameters) {
          const output = outputs[0];
          const frameSize = output[0].length;
          const available = (this.writeIndex - this.readIndex) & this.bufferMask;

          if (available >= frameSize) {
            // Output mono to all channels (typically L and R)
            for (let i = 0; i < frameSize; i++) {
              const sample = this.buffer[(this.readIndex + i) & this.bufferMask];
              for (let ch = 0; ch < output.length; ch++) {
                output[ch][i] = sample;
              }
            }
            this.readIndex = (this.readIndex + frameSize) & this.bufferMask;
          } else {
            // Underrun: silence
            for (let ch = 0; ch < output.length; ch++) {
              output[ch].fill(0);
            }
          }
          return true;
        }
      }
      registerProcessor('pcm-player-processor', PCMPlayerProcessor);
    `;

    // Initialize AudioContext with 48000Hz (Rust resamples iOS 44100Hz to match desktop)
    const defaultSampleRate = 48000;
    const blob = new Blob([workletCode], { type: 'application/javascript' });
    const workletUrl = URL.createObjectURL(blob);

    audioContext = new AudioContext({ sampleRate: defaultSampleRate });
    await audioContext.audioWorklet.addModule(workletUrl);
    URL.revokeObjectURL(workletUrl);

    workletNode = new AudioWorkletNode(audioContext, 'pcm-player-processor', {
      outputChannelCount: [2],
    });

    audioDestination = audioContext.createMediaStreamDestination();
    workletNode.connect(audioDestination);
    audioStream = audioDestination.stream;
    configuredSampleRate = defaultSampleRate;

    Logger.info("TAURI_STREAM", `Audio MediaStream initialized (${defaultSampleRate}Hz, mono)`);

    const audioChannel = new Channel<AudioData>();

    audioChannel.onmessage = (audioData: AudioData) => {
      if (!isActive) return;

      audioChunkCount++;
      this.latestAudioData = audioData;

      if (audioChunkCount === 1) {
        Logger.info("TAURI_STREAM", `First audio chunk received (${audioData.sampleRate}Hz, mono)`);
        if (audioData.sampleRate !== configuredSampleRate) {
          Logger.warn("TAURI_STREAM", `Sample rate mismatch: source=${audioData.sampleRate}Hz, context=${configuredSampleRate}Hz`);
        }
      }
      if (audioChunkCount % 500 === 0) {
        Logger.debug("TAURI_STREAM", `Received ${audioChunkCount} audio chunks`);
      }

      if (workletNode) {
        try {
          // Decode base64 to bytes
          const binaryString = atob(audioData.samples);
          const bytes = new Uint8Array(binaryString.length);
          for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
          }
          // Send mono samples directly to worklet
          const samples = new Float32Array(bytes.buffer);
          workletNode.port.postMessage(samples);
        } catch (error) {
          Logger.error("TAURI_STREAM", `Failed to decode audio chunk: ${error}`);
        }
      }
    };

    // Start audio-only capture
    if (isDesktop()) {
      // Desktop: Use screen-capture plugin
      await invoke('plugin:screen-capture|start_audio_stream_cmd', {
        onAudio: audioChannel,
      });
    } else {
      // iOS: Get App Group path, register audio channel, then trigger ReplayKit picker
      let appGroupPath: string | null = null;
      try {
        appGroupPath = await invoke<string>('plugin:screen-capture|get_app_group_path_cmd');
        Logger.info("TAURI_STREAM", `iOS App Group path: ${appGroupPath}`);
      } catch (e) {
        Logger.warn("TAURI_STREAM", `Could not get App Group path: ${e}`);
      }

      await invoke('start_audio_stream_cmd', {
        onAudio: audioChannel,
        appGroupPath: appGroupPath,
      });
      await invoke<boolean>('plugin:screen-capture|start_capture_cmd');
    }

    Logger.info("TAURI_STREAM", "Audio-only capture stream started");

    return {
      audioStream,
      stop: async () => {
        isActive = false;
        this.latestAudioData = null;

        if (isDesktop()) {
          await invoke('plugin:screen-capture|stop_audio_cmd');
        } else {
          // iOS: Stop audio stream and broadcast
          try {
            await invoke('stop_audio_stream_cmd');
          } catch (e) {
            Logger.warn("TAURI_STREAM", `Error stopping audio stream: ${e}`);
          }
          await invoke('plugin:screen-capture|stop_capture_cmd');
        }

        if (audioStream) {
          audioStream.getTracks().forEach(track => track.stop());
        }
        if (workletNode) {
          workletNode.disconnect();
        }
        if (audioContext) {
          await audioContext.close();
        }

        Logger.info("TAURI_STREAM", `Audio stream stopped after ${audioChunkCount} chunks`);
      },
      getLatestAudio: () => this.latestAudioData,
    };
  }

  /**
   * Start capture with channel-based streaming.
   * Works on both desktop and iOS - frames are pushed from Rust as they arrive.
   *
   * On desktop: Shows selector window, waits for target selection, then starts xcap with channel
   * On iOS: Triggers ReplayKit picker, then HTTP-received frames are pushed via channel
   *
   * Returns MediaStreams for display and a cleanup function.
   */
  async startCaptureStream(targetId?: string): Promise<CaptureStreamResult> {
    if (!isTauri()) {
      throw new Error('Screen capture only available in Tauri');
    }

    Logger.info("TAURI_STREAM", `Starting channel-based capture stream`);

    // On desktop, show selector and wait for target selection (unless targetId provided)
    let selectedTargetId: string | undefined = targetId;
    if (isDesktop() && !selectedTargetId) {
      const selected = await this.waitForTargetSelection();
      if (!selected) {
        throw new Error('Screen capture cancelled by user');
      }
      selectedTargetId = selected;
    }

    Logger.info("TAURI_STREAM", `Starting capture with target: ${selectedTargetId || 'default'}`);

    // Create two canvases: clean (for AI) and pip (for display with overlay)
    const canvasClean = document.createElement('canvas');
    const canvasPip = document.createElement('canvas');

    // Initial size - will be adapted to actual frame dimensions
    canvasClean.width = 1920;
    canvasClean.height = 1080;
    canvasPip.width = 1920;
    canvasPip.height = 1080;

    const ctxClean = canvasClean.getContext('2d');
    const ctxPip = canvasPip.getContext('2d');

    if (!ctxClean || !ctxPip) {
      throw new Error('Failed to create canvas contexts');
    }

    // Create MediaStreams from canvases
    const cleanStream = canvasClean.captureStream(30);
    const pipStream = canvasPip.captureStream(30);

    let canvasSizeInitialized = false;
    let frameCount = 0;
    let isActive = true;
    const cachedImage = new Image();

    // Create channels to receive frames and audio from Rust
    const frameChannel = new Channel<FrameData>();
    const audioChannel = new Channel<AudioData>();
    let audioChunkCount = 0;

    // Set up audio processing to convert PCM to MediaStream
    let audioContext: AudioContext | null = null;
    let workletNode: AudioWorkletNode | null = null;
    let screenAudioStream: MediaStream | null = null;
    let audioInitialized = false;
    let audioDestination: MediaStreamAudioDestinationNode | null = null;
    let configuredSampleRate = 0;

    // AudioWorklet code for mono PCM playback
    const workletCode = `
      class PCMPlayerProcessor extends AudioWorkletProcessor {
        constructor() {
          super();
          // Ring buffer: ~1.3 seconds at 48kHz (power of 2 for fast modulo)
          this.bufferSize = 65536;
          this.bufferMask = this.bufferSize - 1;
          this.buffer = new Float32Array(this.bufferSize);
          this.writeIndex = 0;
          this.readIndex = 0;

          this.port.onmessage = (e) => {
            const samples = e.data;
            const len = samples.length;
            for (let i = 0; i < len; i++) {
              this.buffer[(this.writeIndex + i) & this.bufferMask] = samples[i];
            }
            this.writeIndex = (this.writeIndex + len) & this.bufferMask;
          };
        }

        process(inputs, outputs, parameters) {
          const output = outputs[0];
          const frameSize = output[0].length;
          const available = (this.writeIndex - this.readIndex) & this.bufferMask;

          if (available >= frameSize) {
            // Output mono to all channels (typically L and R)
            for (let i = 0; i < frameSize; i++) {
              const sample = this.buffer[(this.readIndex + i) & this.bufferMask];
              for (let ch = 0; ch < output.length; ch++) {
                output[ch][i] = sample;
              }
            }
            this.readIndex = (this.readIndex + frameSize) & this.bufferMask;
          } else {
            // Underrun: silence
            for (let ch = 0; ch < output.length; ch++) {
              output[ch].fill(0);
            }
          }
          return true;
        }
      }
      registerProcessor('pcm-player-processor', PCMPlayerProcessor);
    `;

    // Initialize AudioContext with 48000Hz (Rust resamples iOS 44100Hz to match desktop)
    const initializeAudio = async () => {
      try {
        const defaultSampleRate = 48000;
        const blob = new Blob([workletCode], { type: 'application/javascript' });
        const workletUrl = URL.createObjectURL(blob);

        audioContext = new AudioContext({ sampleRate: defaultSampleRate });
        await audioContext.audioWorklet.addModule(workletUrl);
        URL.revokeObjectURL(workletUrl);

        workletNode = new AudioWorkletNode(audioContext, 'pcm-player-processor', {
          outputChannelCount: [2],
        });

        audioDestination = audioContext.createMediaStreamDestination();
        workletNode.connect(audioDestination);
        screenAudioStream = audioDestination.stream;

        audioInitialized = true;
        configuredSampleRate = defaultSampleRate;
        Logger.info("TAURI_STREAM", `Audio MediaStream initialized (${defaultSampleRate}Hz, mono)`);
      } catch (error) {
        Logger.error("TAURI_STREAM", `Failed to initialize audio stream: ${error}`);
      }
    };

    // Initialize audio upfront
    await initializeAudio();

    frameChannel.onmessage = (frameData: FrameData) => {
      if (!isActive) return;

      frameCount++;
      this.latestBase64Frame = frameData.frame;

      if (frameCount === 1) {
        Logger.info("TAURI_STREAM", `First frame received via channel`);
      }
      if (frameCount % 100 === 0) {
        Logger.debug("TAURI_STREAM", `Received ${frameCount} frames via channel`);
      }

      // Decode and draw frame
      cachedImage.onload = () => {
        if (!isActive) return;

        // Adapt canvas size on first frame
        if (!canvasSizeInitialized && cachedImage.naturalWidth > 0) {
          canvasClean.width = cachedImage.naturalWidth;
          canvasClean.height = cachedImage.naturalHeight;
          canvasPip.width = cachedImage.naturalWidth;
          canvasPip.height = cachedImage.naturalHeight;
          canvasSizeInitialized = true;
          Logger.info("TAURI_STREAM", `Canvas adapted to ${cachedImage.naturalWidth}x${cachedImage.naturalHeight}`);
        }

        // Draw to clean canvas (no overlay)
        ctxClean.drawImage(cachedImage, 0, 0);

        // Draw to PiP canvas (with overlay for iOS background mode)
        ctxPip.drawImage(cachedImage, 0, 0);

        // Draw PiP overlay if set (used on iOS for background indicator)
        if (this.pipOverlayDrawer) {
          this.pipOverlayDrawer(ctxPip, canvasPip.width, canvasPip.height);
        }
      };

      cachedImage.src = 'data:image/jpeg;base64,' + frameData.frame;
    };

    audioChannel.onmessage = (audioData: AudioData) => {
      if (!isActive) return;

      audioChunkCount++;
      this.latestAudioData = audioData;

      if (audioChunkCount === 1) {
        Logger.info("TAURI_STREAM", `First audio chunk received via channel (${audioData.sampleRate}Hz, mono)`);
        if (audioData.sampleRate !== configuredSampleRate) {
          Logger.warn("TAURI_STREAM", `Sample rate mismatch: source=${audioData.sampleRate}Hz, context=${configuredSampleRate}Hz`);
        }
      }
      if (audioChunkCount % 500 === 0) {
        Logger.debug("TAURI_STREAM", `Received ${audioChunkCount} audio chunks via channel`);
      }

      // Decode base64 PCM and send to worklet
      if (audioInitialized && workletNode) {
        try {
          // Decode base64 to bytes
          const binaryString = atob(audioData.samples);
          const bytes = new Uint8Array(binaryString.length);
          for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
          }

          // Send mono samples directly to worklet
          const samples = new Float32Array(bytes.buffer);
          workletNode.port.postMessage(samples);
        } catch (error) {
          Logger.error("TAURI_STREAM", `Failed to decode audio chunk: ${error}`);
        }
      }
    };

    // Start the capture stream
    try {
      if (isDesktop()) {
        // Desktop: Use the screen-capture plugin with selected target and audio
        await invoke('plugin:screen-capture|start_capture_stream_cmd', {
          targetId: selectedTargetId || null,
          onFrame: frameChannel,
          onAudio: audioChannel,
        });
      } else {
        // Mobile (iOS): First set up the channels, then trigger ReplayKit picker
        // Get App Group path for shared memory video and audio
        let appGroupPath: string | null = null;
        try {
          appGroupPath = await invoke<string>('plugin:screen-capture|get_app_group_path_cmd');
          Logger.info("TAURI_STREAM", `iOS App Group path: ${appGroupPath}`);
        } catch (e) {
          Logger.warn("TAURI_STREAM", `Could not get App Group path: ${e}`);
        }

        // Video: Register frame channel with App Group path for shared memory buffer
        await invoke('start_capture_stream_cmd', {
          onFrame: frameChannel,
          appGroupPath: appGroupPath,
        });

        // Audio: Register audio channel with App Group path for ring buffer
        await invoke('start_audio_stream_cmd', {
          onAudio: audioChannel,
          appGroupPath: appGroupPath,
        });

        // Trigger the ReplayKit picker to start broadcast
        await invoke<boolean>('plugin:screen-capture|start_capture_cmd');
      }
    } catch (error) {
      Logger.error("TAURI_STREAM", `Failed to start capture stream: ${error}`);
      throw error;
    }

    this.capturing = true;
    Logger.info("TAURI_STREAM", "Channel-based capture stream started");

    // Return streams and control functions
    return {
      cleanStream,
      pipStream,
      screenAudioStream,
      stop: async () => {
        isActive = false;
        this.capturing = false;
        this.latestBase64Frame = null;
        this.latestAudioData = null;

        if (isDesktop()) {
          // Desktop: Stop the xcap capture (also stops audio)
          await this.stopCapture();
        } else {
          // Mobile: Stop the channels and broadcast
          try {
            await invoke('stop_capture_stream_cmd');
          } catch (e) {
            Logger.warn("TAURI_STREAM", `Error stopping capture stream: ${e}`);
          }
          try {
            await invoke('stop_audio_stream_cmd');
          } catch (e) {
            Logger.warn("TAURI_STREAM", `Error stopping audio stream: ${e}`);
          }
          await this.stopCapture();
        }

        // Stop canvas streams
        cleanStream.getTracks().forEach(track => track.stop());
        pipStream.getTracks().forEach(track => track.stop());

        // Stop audio stream and close context
        if (screenAudioStream) {
          screenAudioStream.getTracks().forEach(track => track.stop());
        }
        if (workletNode) {
          workletNode.disconnect();
        }
        if (audioContext) {
          await audioContext.close();
        }

        Logger.info("TAURI_STREAM", `Capture stream stopped after ${frameCount} frames, ${audioChunkCount} audio chunks`);
      },
      getLatestFrame: () => this.latestBase64Frame,
      getLatestAudio: () => this.latestAudioData,
    };
  }

  /**
   * Show the selector window and wait for user to pick a target.
   * Returns the selected targetId, or null if cancelled.
   */
  private async waitForTargetSelection(): Promise<string | null> {
    return new Promise(async (resolve) => {
      let unlistenSelected: UnlistenFn | null = null;
      let unlistenCancelled: UnlistenFn | null = null;

      const cleanup = () => {
        if (unlistenSelected) unlistenSelected();
        if (unlistenCancelled) unlistenCancelled();
      };

      try {
        // Listen for target selection
        unlistenSelected = await listen<{ targetId: string }>('screen-capture-target-selected', (event) => {
          Logger.info("TAURI_STREAM", `Target selected: ${event.payload.targetId}`);
          cleanup();
          resolve(event.payload.targetId);
        });

        // Listen for cancellation
        unlistenCancelled = await listen('screen-capture-target-cancelled', () => {
          Logger.info("TAURI_STREAM", `Target selection cancelled`);
          cleanup();
          resolve(null);
        });

        // Show the selector window
        await this.showSelector();
      } catch (error) {
        Logger.error("TAURI_STREAM", `Error showing selector: ${error}`);
        cleanup();
        resolve(null);
      }
    });
  }

  async startCapture(): Promise<boolean> {
    if (!isTauri()) {
      throw new Error('Screen capture only available in Tauri');
    }

    try {
      Logger.info("TAURI_STREAM", `Started Capturing tauri screen`);

      // On desktop, show the selector first so user can pick what to capture
      if (isDesktop()) {
        Logger.info("TAURI_STREAM", `Popping up the screen capture window`);
        await this.showSelector();
        // The selector window will call startCaptureWithTarget when user picks
        // Return true to indicate the flow started (actual capture starts after selection)
        return true;
      }

      // On mobile, start capture directly (uses system picker)
      const result = await invoke<boolean>('plugin:screen-capture|start_capture_cmd');
      this.capturing = result;
      Logger.info("TAURI_STREAM", `start_capture_cmd called`);
      return result;
    } catch (error) {
      throw error;
    }
  }

  async stopCapture(): Promise<void> {
    if (!isTauri()) {
      throw new Error('Screen capture only available in Tauri');
    }

    try {
      await invoke('plugin:screen-capture|stop_capture_cmd');
      this.capturing = false;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Stop only video capture.
   * Works on both desktop and iOS.
   */
  async stopVideo(): Promise<void> {
    if (!isTauri()) {
      throw new Error('Screen capture only available in Tauri');
    }

    try {
      if (isDesktop()) {
        await invoke('plugin:screen-capture|stop_video_cmd');
      } else {
        // iOS: Stop capture stream and broadcast
        await invoke('stop_capture_stream_cmd');
        await invoke('plugin:screen-capture|stop_capture_cmd');
      }
      this.capturing = false;
      this.latestBase64Frame = null;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Stop only audio capture.
   * Works on desktop (macOS) and iOS.
   */
  async stopAudio(): Promise<void> {
    if (!isTauri()) {
      throw new Error('Audio capture only available in Tauri');
    }

    try {
      if (isDesktop()) {
        await invoke('plugin:screen-capture|stop_audio_cmd');
      } else {
        // iOS: Stop audio stream and broadcast
        await invoke('stop_audio_stream_cmd');
        await invoke('plugin:screen-capture|stop_capture_cmd');
      }
      this.latestAudioData = null;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Unified status + frame query - the single source of truth for broadcast state.
   * Returns broadcast state and the latest frame in one call.
   * Works on both mobile (iOS/Android) and desktop (macOS/Windows/Linux).
   */
  async getStatus(): Promise<BroadcastStatus> {
    if (!isTauri()) {
      // Return safe defaults when not in Tauri
      return {
        isActive: false,
        isStale: false,
        frame: null,
        timestamp: null,
        frameCount: 0,
      };
    }

    try {
      const result = await invoke<BroadcastStatus>('get_broadcast_status');
      return result;
    } catch (error) {
      console.error("[ScreenCapture]", error);
      // Return safe defaults on error
      return {
        isActive: false,
        isStale: false,
        frame: null,
        timestamp: null,
        frameCount: 0,
      };
    }
  }

  isCapturing(): boolean {
    return this.capturing;
  }

  // ================== Screen/Window Selector Methods ==================

  /**
   * Get all available capture targets (monitors and windows).
   * Desktop only.
   */
  async getTargets(includeThumbnails: boolean = true): Promise<CaptureTarget[]> {
    if (!isTauri() || !isDesktop()) {
      throw new Error('Target selection only available on desktop');
    }

    return invoke<CaptureTarget[]>('plugin:screen-capture|get_capture_targets_cmd', {
      includeThumbnails
    });
  }

  /**
   * Open the screen selector window.
   * This shows a custom UI for selecting screens/windows.
   * Desktop only.
   */
  async showSelector(): Promise<void> {
    if (!isTauri() || !isDesktop()) {
      throw new Error('Screen selector only available on desktop');
    }

    // Import dynamically to avoid bundling desktop-only code
    const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow');

    // Get or create the selector window
    let selectorWindow = await WebviewWindow.getByLabel('screen-selector');

    if (!selectorWindow) {
      // Window doesn't exist, might have been closed - create it
      Logger.warn("TAURI_STREAM", "Screen selector window not found, it may need to be recreated");
      throw new Error('Screen selector window not available');
    }

    // Show and focus the window
    await selectorWindow.show();
    await selectorWindow.setFocus();
  }
}

export const tauriStreamCapture = new TauriStreamCapture();

// Re-export with old names for backward compatibility
export const tauriScreenCapture = tauriStreamCapture;
export const mobileScreenCapture = tauriStreamCapture;
