// Platform detection utilities for Observer

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
  if (!isTauri()) return false;

  // Check platform from Tauri internals
  const platform = (window as any).__TAURI_INTERNALS__?.metadata?.currentTarget?.platform;
  return platform === 'android' || platform === 'ios';
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
  const platform = (window as any).__TAURI_INTERNALS__?.metadata?.currentTarget?.platform;
  return platform === 'ios';
};

/**
 * Check if the app is running on Android
 */
export const isAndroid = (): boolean => {
  const platform = (window as any).__TAURI_INTERNALS__?.metadata?.currentTarget?.platform;
  return platform === 'android';
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
 * Check if native mobile screen capture is available
 */
export const hasNativeScreenCapture = (): boolean => {
  return isMobile();
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
  if (isIOS()) return 'iOS';
  if (isAndroid()) return 'Android';
  if (isDesktop()) {
    const platform = (window as any).__TAURI_INTERNALS__?.metadata?.currentTarget?.platform;
    return platform || 'Desktop';
  }
  return 'Web';
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
