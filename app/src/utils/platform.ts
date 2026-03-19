// Platform detection utilities for Observer
import { platform as getPlatform } from '@tauri-apps/plugin-os';
import { Logger, LogLevel } from './logging';

/**
 * Check if the app is running in Tauri
 */
export const isTauri = (): boolean => {
  return Boolean(
    typeof window !== 'undefined' &&
    (window as any).__TAURI__
  );
};

/**
 * Check if the app is running on a mobile platform (iOS or Android)
 */
export const isMobile = (): boolean => {
  if (!isTauri()) {
    return false;
  }

  try {
    // Use the official Tauri OS plugin
    const platform = getPlatform();
    return platform === 'android' || platform === 'ios';
  } catch (err) {
    return false;
  }
};

/**
 * Check if the app is running on desktop (Windows, macOS, or Linux)
 */
export const isDesktop = (): boolean => {
  return isTauri() && !isMobile();
};

/**
 * Check if the app is running on iOS
 */
export const isIOS = (): boolean => {
  if (!isTauri()) return false;
  return getPlatform() === 'ios';
};

/**
 * Check if the app is running on Android
 */
export const isAndroid = (): boolean => {
  if (!isTauri()) return false;
  return getPlatform() === 'android';
};

/**
 * Check if the app is running in a web browser (not Tauri)
 */
export const isWeb = (): boolean => {
  return !isTauri();
};

// Feature detection

/**
 * Check if overlay window support is available (desktop only)
 */
export const hasOverlaySupport = (): boolean => {
  return isDesktop();
};

/**
 * Check if global keyboard shortcuts are available (desktop only)
 */
export const hasGlobalShortcuts = (): boolean => {
  return isDesktop();
};

/**
 * Check if system tray is available (desktop only)
 */
export const hasSystemTray = (): boolean => {
  return isDesktop();
};

/**
 * Check if native Tauri screen capture is available
 * Now available on all Tauri platforms (mobile AND desktop)
 */
export const hasNativeScreenCapture = (): boolean => {
  return isTauri();
};

/**
 * Check if web-based screen capture (getDisplayMedia) is available
 */
export const hasWebScreenCapture = (): boolean => {
  return isDesktop() || isWeb();
};

/**
 * Check if camera access is available
 * (Available on all platforms via getUserMedia)
 */
export const hasCameraAccess = (): boolean => {
  return typeof navigator !== 'undefined' &&
         typeof navigator.mediaDevices !== 'undefined' &&
         typeof navigator.mediaDevices.getUserMedia === 'function';
};

/**
 * Get the current platform name
 */
export const getPlatformName = (): string => {
  if (!isTauri()) return 'Web';

  const platform = getPlatform();
  switch (platform) {
    case 'ios':
      return 'iOS';
    case 'android':
      return 'Android';
    case 'macos':
      return 'macOS';
    case 'windows':
      return 'Windows';
    case 'linux':
      return 'Linux';
    default:
      return platform || 'Unknown';
  }
};

/**
 * Cross-platform confirm dialog.
 * Uses @tauri-apps/plugin-dialog in any Tauri context (where window.confirm may be
 * suppressed by the native webview), and falls back to window.confirm in the browser.
 */
export const confirm = async (message: string): Promise<boolean> => {
  if (isTauri()) {
    const { confirm: tauriConfirm } = await import('@tauri-apps/plugin-dialog');
    return tauriConfirm(message);
  }
  return window.confirm(message);
};

/**
 * Log platform information for debugging
 */
export const logPlatformInfo = (): void => {
  console.log('[Platform]', {
    name: getPlatformName(),
    isTauri: isTauri(),
    isMobile: isMobile(),
    isDesktop: isDesktop(),
    hasOverlay: hasOverlaySupport(),
    hasShortcuts: hasGlobalShortcuts(),
    hasNativeScreenCapture: hasNativeScreenCapture(),
    hasWebScreenCapture: hasWebScreenCapture(),
  });
};

/**
 * Initialize Tauri log forwarding to the frontend Logger.
 * This captures Rust logs (log::info!, log::debug!, etc.) and forwards them
 * to the TypeScript Logger service.
 *
 * Call this once at app startup.
 */
export const initTauriLogForwarding = async (): Promise<(() => void) | null> => {
  if (!isTauri()) {
    return null;
  }

  try {
    const { attachLogger } = await import('@tauri-apps/plugin-log');

    const detach = await attachLogger(({ level, message }) => {
      // Map Tauri log levels to our LogLevel enum
      const logLevel = level <= 1 ? LogLevel.ERROR
        : level === 2 ? LogLevel.WARNING
        : level === 3 ? LogLevel.INFO
        : LogLevel.DEBUG;

      Logger.log(logLevel, 'rust', message);
    });

    Logger.info('platform', 'Tauri log forwarding initialized');
    return detach;
  } catch (err) {
    console.warn('[Platform] Failed to initialize Tauri log forwarding:', err);
    return null;
  }
};

/**
 * Patch window.fetch on desktop to use Tauri's HTTP plugin for localhost requests.
 *
 * This fixes an issue on Windows where WebView2 blocks fetch requests from
 * the tauri.localhost origin to http://localhost:* due to Private Network Access
 * security restrictions. The Tauri HTTP plugin uses native Rust HTTP (reqwest)
 * which bypasses WebView2's restrictions entirely.
 *
 * This patch only affects localhost/127.0.0.1 requests - external API calls
 * continue to use the browser's native fetch.
 *
 * Call this once at app startup, before any fetch requests are made.
 */
export const patchFetchForDesktop = async (): Promise<void> => {
  if (!isDesktop()) {
    return;
  }

  try {
    const { fetch: tauriFetch } = await import('@tauri-apps/plugin-http');
    const originalFetch = window.fetch.bind(window);

    window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.href
          : input.url;

      // Use Tauri HTTP plugin for localhost/127.0.0.1 requests
      // This bypasses WebView2's Private Network Access restrictions on Windows
      if (url.includes('localhost') || url.includes('127.0.0.1')) {
        Logger.debug('platform', `Using Tauri HTTP for: ${url}`);
        return tauriFetch(input as any, init as any);
      }

      // Use original browser fetch for external requests
      return originalFetch(input, init);
    };

    Logger.info('platform', 'Desktop fetch patched for localhost requests');
  } catch (err) {
    console.warn('[Platform] Failed to patch fetch for desktop:', err);
  }
};
