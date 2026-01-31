// Mobile Picture-in-Picture to keep app alive in background
import { invoke } from '@tauri-apps/api/core';
import { Logger } from './logging';
import { isMobile } from './platform';

/**
 * Start Picture-in-Picture mode on iOS to keep app alive in background
 */
export async function startMobilePip(): Promise<void> {
  if (!isMobile()) {
    Logger.debug('PiP', 'Not on mobile, skipping PiP start');
    return;
  }

  try {
    Logger.info('PiP', 'Starting mobile Picture-in-Picture');
    await invoke('plugin:pip|start_pip_cmd');
    Logger.info('PiP', 'Picture-in-Picture started successfully');
  } catch (error) {
    Logger.error('PiP', `Failed to start Picture-in-Picture: ${error}`);
    throw error;
  }
}

/**
 * Stop Picture-in-Picture mode
 */
export async function stopMobilePip(): Promise<void> {
  if (!isMobile()) {
    Logger.debug('PiP', 'Not on mobile, skipping PiP stop');
    return;
  }

  try {
    Logger.info('PiP', 'Stopping mobile Picture-in-Picture');
    await invoke('plugin:pip|stop_pip_cmd');
    Logger.info('PiP', 'Picture-in-Picture stopped successfully');
  } catch (error) {
    Logger.error('PiP', `Failed to stop Picture-in-Picture: ${error}`);
    throw error;
  }
}
