import React from 'react';
import ReactDOM from 'react-dom/client';

// Import the shared CSS
import '@/index.css'; 

// Import the application entry point
import App from './web/App'; // Your existing App.tsx, now the "WebApp"

// Decide which component to render at the root level
const RootComponent = App;

// Render the chosen component
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <RootComponent />
  </React.StrictMode>
);
