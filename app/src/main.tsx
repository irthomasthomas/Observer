import React from 'react';
import ReactDOM from 'react-dom/client';

// Import the shared CSS
import '@/index.css'; 

// Import the two possible application entry points
import App from './web/App'; // Your existing App.tsx, now the "WebApp"
import LauncherShell from './desktop/LauncherShell'; // The new "DesktopApp"

// Helper function to safely check for the Tauri environment
function isTauri() {
  return Boolean(
    typeof window !== 'undefined' &&
    (window as any).__TAURI__
  );
}

// Decide which component to render at the root level
const RootComponent = isTauri() ? LauncherShell : App;

// Render the chosen component
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <RootComponent />
  </React.StrictMode>
);
