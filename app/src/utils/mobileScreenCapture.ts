import { invoke } from '@tauri-apps/api/core';
import { isMobile } from './platform';

export interface CaptureConfig {
  width: number;
  height: number;
  frameRate: number;
}

class MobileScreenCapture {
  private capturing = false;

  async startCapture(config: CaptureConfig = { width: 1920, height: 1080, frameRate: 30 }): Promise<boolean> {
    if (!isMobile()) {
      throw new Error('Mobile screen capture only available on iOS/Android');
    }

    try {
      const result = await invoke<boolean>('plugin:screen-capture|start_capture_cmd', {
        config
      });
      this.capturing = result;
      console.log('Mobile screen capture started:', result);
      return result;
    } catch (error) {
      console.error('Failed to start mobile screen capture:', error);
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
      console.log('Mobile screen capture stopped');
    } catch (error) {
      console.error('Failed to stop mobile screen capture:', error);
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
      console.error('Failed to get frame:', error);
      throw error;
    }
  }

  isCapturing(): boolean {
    return this.capturing;
  }
}

export const mobileScreenCapture = new MobileScreenCapture();
