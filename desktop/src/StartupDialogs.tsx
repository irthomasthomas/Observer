import React, { useState, useEffect } from 'react';
import { AlertCircle } from 'lucide-react';

interface StartupDialogsProps {
  serverStatus: 'unchecked' | 'online' | 'offline';
  onDismiss: () => void;
}

const StartupDialogs: React.FC<StartupDialogsProps> = ({ 
  serverStatus,
  onDismiss 
}) => {
  const [visible, setVisible] = useState(true);
  const [dismissed, setDismissed] = useState(false);
  const [showOnStartup, setShowOnStartup] = useState(true);

  useEffect(() => {
    // Check if the user has already seen the dialog
    const hasSeenDialog = localStorage.getItem('observerHasSeenStartupDialog');
    if (hasSeenDialog === 'true') {
      setVisible(false);
      setDismissed(true);
    }
    
    // Get saved preference for showing on startup
    const showDialogOnStartup = localStorage.getItem('observerShowDialogOnStartup');
    if (showDialogOnStartup === 'false') {
      setShowOnStartup(false);
    }
  }, []);
  
  const handleDismiss = () => {
    setVisible(false);
    // Add a small delay before fully removing from DOM
    setTimeout(() => {
      setDismissed(true);
      localStorage.setItem('observerHasSeenStartupDialog', 'true');
      localStorage.setItem('observerShowDialogOnStartup', showOnStartup.toString());
      onDismiss();
    }, 300);
  };
  


  if (dismissed || serverStatus === 'online') {
    return null;
  }

  return (
    <div 
      className={`startup-dialog-overlay ${visible ? 'visible' : 'hidden'}`}
      onClick={(e) => {
        // Only dismiss if clicking the overlay, not the dialog
        if (e.target === e.currentTarget) {
          handleDismiss();
        }
      }}
    >
      <div className="startup-dialog">
        <div className="dialog-header">
          <AlertCircle className="w-6 h-6 text-yellow-500" />
          <h2>Welcome to Observer</h2>
        </div>
        
        <div className="dialog-content">
          <p className="instruction">First, connect to an Ollama server</p>
          <p className="helper-text">
            Use the connection field at the top to connect to your Ollama server.
            If you don't have Ollama running, you can click the "Start Ollama Server" button.
          </p>
        </div>
        
        <div className="dialog-footer">
          <div className="show-on-startup">
            <input 
              type="checkbox" 
              id="show-on-startup" 
              checked={showOnStartup}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setShowOnStartup(e.target.checked)}
            />
            <label htmlFor="show-on-startup">Show when app starts</label>
          </div>
          
          <div className="dialog-actions">
            <button 
              className="dismiss-button"
              onClick={handleDismiss}
            >
              Got it
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default StartupDialogs;
