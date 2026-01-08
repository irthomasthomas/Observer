import { invoke } from '@tauri-apps/api/core';
import { isMobile } from './platform';

class MobileScreenCapture {
  private capturing = false;

  async startCapture(): Promise<boolean> {
    if (!isMobile()) {
      throw new Error('Mobile screen capture only available on iOS/Android');
    }

    try {
      console.log('[ScreenCapture] 🎬 Calling start_capture_cmd (showing picker)...');
      const result = await invoke<boolean>('plugin:screen-capture|start_capture_cmd');
      this.capturing = result;
      console.log('[ScreenCapture] ✅ Picker shown, capturing =', result);
      console.log('[ScreenCapture] 💡 User must now select Observer and approve broadcast');
      console.log('[ScreenCapture] 💡 Frames will arrive after user approves...');
      return result;
    } catch (error) {
      console.error('[ScreenCapture] ❌ Failed to start:', error);
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
      console.log('[ScreenCapture] 🔍 Calling get_broadcast_frame...');

      // NEW: Use broadcast frame server instead of plugin command
      const result = await invoke<{ frame: string; timestamp: number; age: number } | null>(
        'get_broadcast_frame'
      );

      console.log('[ScreenCapture] 📦 Result:', result ? `frame=${result.frame.length} bytes, age=${result.age.toFixed(2)}s` : 'null');

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
