import { invoke } from '@tauri-apps/api/core';
import { isMobile } from './platform';

export interface BroadcastStatus {
  isActive: boolean;
  isStale: boolean;
  frame: string | null;
  timestamp: number | null;
  frameCount: number;
}

class MobileScreenCapture {
  private capturing = false;

  async startCapture(): Promise<boolean> {
    if (!isMobile()) {
      throw new Error('Mobile screen capture only available on iOS/Android');
    }

    try {
      const result = await invoke<boolean>('plugin:screen-capture|start_capture_cmd');
      this.capturing = result;
      return result;
    } catch (error) {
      throw error;
    }
  }

  async stopCapture(): Promise<void> {
    if (!isMobile()) {
      throw new Error('Mobile screen capture only available on iOS/Android');
    }

    try {
      await invoke('plugin:screen-capture|stop_capture_cmd');
      this.capturing = false;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Unified status + frame query - the single source of truth for broadcast state.
   * Returns broadcast state and the latest frame in one call.
   */
  async getStatus(): Promise<BroadcastStatus> {
    if (!isMobile()) {
      throw new Error('Mobile screen capture only available on iOS/Android');
    }

    try {
      const result = await invoke<BroadcastStatus>('get_broadcast_status');
      return result;
    } catch (error) {
      console.error('[ScreenCapture] ❌ Error getting status:', error);
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
}

export const mobileScreenCapture = new MobileScreenCapture();
