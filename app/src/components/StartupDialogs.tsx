import React from 'react';

interface StartupDialogProps {
  onDismiss: () => void;
  onLogin?: () => void;
  onToggleObServer?: () => void;
  isAuthenticated: boolean;
  hostingContext: 'official-web' | 'self-hosted' | 'tauri';
}


const StartupDialog: React.FC<StartupDialogProps> = ({
  onDismiss,
  onLogin,
  onToggleObServer,
  isAuthenticated,
  hostingContext
}) => {

  // Don't show dialog if user is already authenticated
  if (isAuthenticated) {
    return null;
  }

  const handleSignIn = () => {
    if (onLogin) {
      onLogin();
    }
    // Enable ObServer after signing in
    if (onToggleObServer) {
      onToggleObServer();
    }
  };

  const handleSkip = () => {
    onDismiss();
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100] backdrop-blur-sm p-4">
      <div className="bg-white rounded-xl shadow-xl p-6 sm:p-8 max-w-md w-full transition-all duration-300 relative">
        <div className="text-center">
          {/* Observer Logo/Icon */}
          <div className="flex justify-center mb-6">
            <img
              src="/eye-logo-black.svg"
              alt="Observer Logo"
              className="h-16 w-16"
            />
          </div>

          {/* Welcome Message */}
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Welcome to Observer</h1>
          <p className="text-gray-600 mb-8 leading-relaxed">
            Local open-source micro-agents that observe, log and react, so you don't have to.
          </p>

          {/* Action Buttons */}
          <div className="space-y-3">
            <button
              onClick={handleSignIn}
              className="w-full px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors font-medium shadow-sm hover:shadow-md"
            >
              Sign In to Start Creating Agents
            </button>
          </div>

          {/* Small Skip button positioned bottom-right for Tauri and Self-hosted */}
          {(hostingContext === 'tauri' || hostingContext === 'self-hosted') && (
            <button
              onClick={handleSkip}
              className="absolute bottom-4 right-4 text-xs text-gray-500 hover:text-gray-700 transition-colors flex items-center gap-1"
            >
              Skip →
            </button>
          )}

          {/* Footer - only show for self-hosted and tauri */}
          {hostingContext !== 'official-web' && (
            <p className="text-xs text-gray-500 mt-6">
              You can always sign in later from the app header to unlock cloud features.
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

export default StartupDialog;
