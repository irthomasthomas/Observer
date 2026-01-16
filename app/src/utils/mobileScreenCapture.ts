import { invoke } from '@tauri-apps/api/core';
import { isMobile } from './platform';

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

  async getFrame(): Promise<string> {
    if (!isMobile()) {
      throw new Error('Mobile screen capture only available on iOS/Android');
    }

    if (!this.capturing) {
      throw new Error('Screen capture not started');
    }

    try {
      const result = await invoke<{ frame: string; timestamp: number; age: number } | null>(
        'get_broadcast_frame'
      );

      if (!result) {
        throw new Error('No frame available from server');
      }

      // Warn if frame is stale (>2 seconds old)
      if (result.age > 2.0) {
        console.warn(`[ScreenCapture] ⚠️ Frame is ${result.age.toFixed(1)}s old - broadcast may have stopped`);
      }

      return result.frame;
    } catch (error) {
      console.error('[ScreenCapture] ❌ Error:', error);
      throw error;
    }
  }

  async getBroadcastStatus(): Promise<{ isActive: boolean; lastFrameTimestamp: number }> {
    if (!isMobile()) {
      throw new Error('Mobile screen capture only available on iOS/Android');
    }

    try {
      const status = await invoke<{ isActive: boolean; lastFrameTimestamp: number }>(
        'plugin:screen-capture|get_broadcast_status_cmd'
      );
      return status;
    } catch (error) {
      console.error('[ScreenCapture] Failed to get status:', error);
      return { isActive: false, lastFrameTimestamp: 0 };
    }
  }

  isCapturing(): boolean {
    return this.capturing;
  }
}

export const mobileScreenCapture = new MobileScreenCapture();
