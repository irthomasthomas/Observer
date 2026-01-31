// hooks/useIOSKeyboard.ts
// Handles iOS keyboard by detecting viewport changes and updating CSS variables

import { useEffect } from 'react';
import { isMobile } from '@utils/platform';

export function useIOSKeyboard() {
  useEffect(() => {
    let mobile = false;
    try { mobile = isMobile(); } catch { return; }
    if (!mobile) return;

    const root = document.documentElement;

    // Listen for edge-to-edge plugin's safeAreaChanged event
    const handleSafeAreaChanged = (e: CustomEvent) => {
      const detail = e.detail || {};
      const keyboardHeight = detail.keyboardHeight ?? 0;
      const keyboardVisible = detail.keyboardVisible ?? false;

      // Set CSS variable for modals
      if (keyboardVisible && keyboardHeight > 0) {
        root.style.setProperty('--keyboard-height', `${keyboardHeight}px`);
        document.body.style.setProperty('--keyboard-height', `${keyboardHeight}px`);

        // For non-modal content: scroll focused input into view
        setTimeout(() => {
          const focused = document.activeElement as HTMLElement;
          if (focused?.tagName === 'INPUT' || focused?.tagName === 'TEXTAREA') {
            focused.scrollIntoView({ block: 'center', behavior: 'smooth' });
          }
        }, 100);
      } else {
        root.style.setProperty('--keyboard-height', '0px');
        document.body.style.setProperty('--keyboard-height', '0px');
      }
    };

    window.addEventListener('safeAreaChanged', handleSafeAreaChanged as EventListener);

    return () => {
      window.removeEventListener('safeAreaChanged', handleSafeAreaChanged as EventListener);
    };
  }, []);
}
