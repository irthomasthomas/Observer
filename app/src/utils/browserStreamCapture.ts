/**
 * Browser-specific stream capture using Web APIs (getDisplayMedia, getUserMedia)
 * Handles browser environment where screen audio requires the display stream
 */

import { Logger } from './logging';

export type MasterStreamType = 'display' | 'camera' | 'microphone' | 'screenAudio';

export interface BrowserCaptureStreams {
  masterDisplayStream: MediaStream | null;
  masterCameraStream: MediaStream | null;
  masterMicrophoneStream: MediaStream | null;
  screenVideoStream: MediaStream | null;
  screenAudioStream: MediaStream | null;
  cameraStream: MediaStream | null;
  microphoneStream: MediaStream | null;
}

class BrowserStreamCapture {
  private streams: BrowserCaptureStreams = {
    masterDisplayStream: null,
    masterCameraStream: null,
    masterMicrophoneStream: null,
    screenVideoStream: null,
    screenAudioStream: null,
    cameraStream: null,
    microphoneStream: null,
  };

  private pendingAcquisitions = new Map<MasterStreamType, Promise<void>>();

  /**
   * Acquire a master stream (deduplicates concurrent requests)
   */
  async acquireMasterStream(type: MasterStreamType): Promise<void> {
    // If already pending, return existing promise
    if (this.pendingAcquisitions.has(type)) {
      Logger.debug("BrowserCapture", `Joining pending request for '${type}' stream`);
      return this.pendingAcquisitions.get(type)!;
    }

    // Create new acquisition promise
    const promise = this._acquireMasterStreamImpl(type).finally(() => {
      this.pendingAcquisitions.delete(type);
    });

    this.pendingAcquisitions.set(type, promise);
    return promise;
  }

  /**
   * Internal implementation of master stream acquisition
   */
  private async _acquireMasterStreamImpl(type: MasterStreamType): Promise<void> {
    switch (type) {
      case 'display':
        if (this.streams.masterDisplayStream) return;

        Logger.info("BrowserCapture", "Requesting display media with audio");
        const displayStream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: true,
        });

        this.streams.masterDisplayStream = displayStream;
        this.streams.screenVideoStream = new MediaStream(displayStream.getVideoTracks());

        // Screen audio is part of the display stream in browsers
        if (displayStream.getAudioTracks().length > 0) {
          const audioStream = new MediaStream(displayStream.getAudioTracks());
          this.streams.screenAudioStream = audioStream;
          Logger.info("BrowserCapture", "Screen audio captured from display stream");
        } else {
          Logger.warn("BrowserCapture", "No audio track in display stream");
        }

        // Handle stream end
        displayStream.getVideoTracks()[0]?.addEventListener('ended', () => {
          Logger.warn("BrowserCapture", "Display stream ended unexpectedly");
          this.handleStreamEnd('display');
        });
        break;

      case 'screenAudio':
        // In browser, screen audio is captured via display stream
        // This case handles when screenAudio is requested separately
        Logger.info("BrowserCapture", "Screen audio requested - acquiring via display stream");
        await this._acquireMasterStreamImpl('display');
        break;

      case 'camera':
        if (this.streams.masterCameraStream) return;

        Logger.info("BrowserCapture", "Requesting camera access");
        const cameraStream = await navigator.mediaDevices.getUserMedia({ video: true });
        this.streams.masterCameraStream = cameraStream;
        this.streams.cameraStream = cameraStream;

        cameraStream.getVideoTracks()[0]?.addEventListener('ended', () => {
          Logger.warn("BrowserCapture", "Camera stream ended unexpectedly");
          this.handleStreamEnd('camera');
        });
        break;

      case 'microphone':
        if (this.streams.masterMicrophoneStream) return;

        Logger.info("BrowserCapture", "Requesting microphone access");
        const micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        this.streams.masterMicrophoneStream = micStream;
        this.streams.microphoneStream = micStream;
        break;
    }

    Logger.info("BrowserCapture", `Master '${type}' stream acquired`);
  }

  /**
   * Teardown a specific master stream
   */
  teardownMasterStream(type: MasterStreamType): void {
    switch (type) {
      case 'display':
        if (this.streams.masterDisplayStream) {
          Logger.info("BrowserCapture", "Tearing down display stream");
          this.streams.masterDisplayStream.getTracks().forEach(track => track.stop());
          this.streams.masterDisplayStream = null;
          this.streams.screenVideoStream = null;
          this.streams.screenAudioStream = null;
        }
        break;

      case 'screenAudio':
        // In browser, screen audio is part of display stream
        // Tearing down screenAudio alone doesn't make sense, but we handle it gracefully
        Logger.info("BrowserCapture", "Screen audio teardown requested - screen audio is part of display stream");
        // Only clear the audio reference, don't stop the display stream
        this.streams.screenAudioStream = null;
        break;

      case 'camera':
        if (this.streams.masterCameraStream) {
          Logger.info("BrowserCapture", "Tearing down camera stream");
          this.streams.masterCameraStream.getTracks().forEach(track => track.stop());
          this.streams.masterCameraStream = null;
          this.streams.cameraStream = null;
        }
        break;

      case 'microphone':
        if (this.streams.masterMicrophoneStream) {
          Logger.info("BrowserCapture", "Tearing down microphone stream");
          this.streams.masterMicrophoneStream.getTracks().forEach(track => track.stop());
          this.streams.masterMicrophoneStream = null;
          this.streams.microphoneStream = null;
        }
        break;
    }
  }

  /**
   * Handle unexpected stream end
   */
  private handleStreamEnd(type: MasterStreamType): void {
    Logger.warn("BrowserCapture", `Master ${type} stream ended unexpectedly`);
    // Notify streamManager (will be handled via callback)
  }

  /**
   * Get current streams
   */
  getStreams(): BrowserCaptureStreams {
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
   * Map pseudo-stream type to required master streams (browser-specific logic)
   * In browser, screenAudio requires the display stream (can't be captured separately)
   */
  getMasterStreamsForPseudoStream(pseudoStream: string): MasterStreamType[] {
    switch (pseudoStream) {
      case 'camera':
        return ['camera'];
      case 'screenVideo':
        return ['display'];
      case 'screenAudio':
        return ['display']; // Browser requires display stream for audio
      case 'microphone':
        return ['microphone'];
      case 'allAudio':
        return ['display', 'microphone']; // Need both for combined audio
      default:
        return [];
    }
  }
}

export const browserStreamCapture = new BrowserStreamCapture();
