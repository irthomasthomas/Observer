import { invoke } from '@tauri-apps/api/core';
import { isMobile } from './platform';

class MobileScreenCapture {
  private capturing = false;

  async startCapture(): Promise<boolean> {
    if (!isMobile()) {
      throw new Error('Mobile screen capture only available on iOS/Android');
    }

    try {
      console.log('[ScreenCapture] Calling start_capture_cmd');
      const result = await invoke<boolean>('plugin:screen-capture|start_capture_cmd');
      this.capturing = result;
      console.log('[ScreenCapture] Started:', result);
      return result;
    } catch (error) {
      console.error('[ScreenCapture] Failed to start:', error);
      throw error;
    }
  }

  async stopCapture(): Promise<void> {
    if (!isMobile()) {
      throw new Error('Mobile screen capture only available on iOS/Android');
    }

    try {
      console.log('[ScreenCapture] Calling stop_capture_cmd');
      await invoke('plugin:screen-capture|stop_capture_cmd');
      this.capturing = false;
      console.log('[ScreenCapture] Stopped');
    } catch (error) {
      console.error('[ScreenCapture] Failed to stop:', error);
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
      const base64Image = await invoke<string>('plugin:screen-capture|get_frame_cmd');
      return base64Image;
    } catch (error) {
      // Frame might not be available yet - that's OK
      throw error;
    }
  }

  isCapturing(): boolean {
    return this.capturing;
  }
}

export const mobileScreenCapture = new MobileScreenCapture();
