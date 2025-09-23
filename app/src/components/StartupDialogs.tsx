import React from 'react';

interface StartupDialogProps {
  onDismiss: () => void;
  onLogin?: () => void;
  isAuthenticated: boolean;
  hostingContext: 'official-web' | 'self-hosted' | 'tauri';
}


const StartupDialog: React.FC<StartupDialogProps> = ({
  onDismiss,
  onLogin,
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
  };

  const handleSkip = () => {
    onDismiss();
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100] backdrop-blur-sm p-4">
      <div className="bg-white rounded-xl shadow-xl p-6 sm:p-8 max-w-md w-full transition-all duration-300">
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

            {/* Show Skip button only for Tauri app */}
            {hostingContext === 'tauri' && (
              <button
                onClick={handleSkip}
                className="w-full px-6 py-3 text-gray-600 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors font-medium"
              >
                Skip & Use Local Models Only
              </button>
            )}
          </div>

          {/* Footer */}
          <p className="text-xs text-gray-500 mt-6">
            You can always sign in later from the app header to unlock cloud features.
          </p>
        </div>
      </div>
    </div>
  );
};

export default StartupDialog;
