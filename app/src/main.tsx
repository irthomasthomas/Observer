import React from 'react';
import ReactDOM from 'react-dom/client';

// Import the shared CSS
import '@/index.css'; 

// Import the three possible application entry points
import App from './web/App'; // Your existing App.tsx, now the "WebApp"
import LauncherShell from './desktop/LauncherShell'; // The new "DesktopApp"
import OverlayWindow from './desktop/OverlayWindow'; // The overlay window

// Helper function to safely check for the Tauri environment
function isTauri() {
  return Boolean(
    typeof window !== 'undefined' &&
    (window as any).__TAURI__
  );
}

// Decide which component to render at the root level
function getRootComponent() {
  // Check if we're on the overlay path
  if (window.location.pathname === '/overlay') {
    return OverlayWindow;
  }
  
  // Otherwise use the original logic
  return isTauri() ? LauncherShell : App;
}

const RootComponent = getRootComponent();

// Render the chosen component
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <RootComponent />
  </React.StrictMode>
);
