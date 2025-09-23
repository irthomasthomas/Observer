// components/TerminalModal.tsx

import React, { useState, useEffect } from 'react';
import Modal from '@components/EditAgent/Modal';
import { Download, CheckCircle, AlertTriangle, X, StopCircle } from 'lucide-react';
import pullModelManager, { PullState } from '@utils/pullModelManager';

interface TerminalModalProps {
  isOpen: boolean;
  onClose: () => void;
  onPullComplete?: () => void;
  noModels?: boolean;
}

const suggestedModels = [
  'gemma3:4b',
  'gemma3:12b',
  'gemma3:27b',
  'gemma3:27b-it-qat',
  'qwen2.5vl:3b',
  'qwen2.5vl:7b',
  'llava:7b',
  'llava:13b'
];

const formatBytes = (bytes: number, decimals = 2) => {
  if (!+bytes) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
};

const TerminalModal: React.FC<TerminalModalProps> = ({ isOpen, onClose, onPullComplete, noModels = false }) => {
  // Local state is now only for the user's input
  const [modelToPull, setModelToPull] = useState('');
  // All display state comes from the manager
  const [downloadState, setDownloadState] = useState<PullState>(pullModelManager.getInitialState());
  // State to control showing welcome screen for no-models case
  const [showWelcomeScreen, setShowWelcomeScreen] = useState(noModels);

  useEffect(() => {
    if (isOpen) {
      // When modal opens, subscribe to the manager's updates
      const unsubscribe = pullModelManager.subscribe((newState) => {
        setDownloadState(newState);
        if (newState.status === 'success' && onPullComplete) {
            onPullComplete();
        }
      });
      // Return the unsubscribe function to be called on cleanup (modal close)
      return unsubscribe;
    }
  }, [isOpen, onPullComplete]);
  
  const handleStartPull = () => {
    if (modelToPull.trim()) {
      pullModelManager.pullModel(modelToPull.trim());
    }
  };

  const handlePullModelClick = () => {
    setModelToPull('gemma3:4b'); // Pre-fill with recommended model
    setShowWelcomeScreen(false); // Switch to input screen
    pullModelManager.pullModel('gemma3:4b'); // Start pulling immediately
  };

  const handleSkipForNow = () => {
    setShowWelcomeScreen(false); // Go to regular input screen
  };

  const handleCancelPull = () => {
    pullModelManager.cancelPull();
  };

  const handleDone = () => {
    // If the download was successful or had an error, reset the manager state before closing.
    if (downloadState.status === 'success' || downloadState.status === 'error') {
        pullModelManager.resetState();
    }
    onClose();
  };

  const { status, progress, statusText, errorText, completedBytes, totalBytes } = downloadState;
  const isPulling = status === 'pulling';
  const isFinished = status === 'success' || status === 'error';

  // Reset welcome screen state when modal reopens
  useEffect(() => {
    if (isOpen) {
      setShowWelcomeScreen(noModels);
    }
  }, [isOpen, noModels]);

  return (
    <Modal open={isOpen} onClose={handleDone} className="w-full max-w-xl">
      <div className="p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold text-gray-800">Add Model</h2>
          <button onClick={handleDone} className="text-gray-400 hover:text-gray-600 rounded-full p-1">
            <X size={20} />
          </button>
        </div>

        {showWelcomeScreen ? (
          <div>
            <div className="flex items-center gap-3 mb-4">
              <Download className="h-7 w-7 text-green-500 flex-shrink-0" />
              <h2 className="text-xl sm:text-2xl font-semibold">Let's Get Your First Model</h2>
            </div>

            <p className="text-gray-700 mb-6">
              Your local server is running, but it looks like you don't have any AI models installed yet. Models are the "brains" that power your agents. Let's download the recommended one to get you started.
            </p>

            <div className="bg-green-50 border border-green-200 rounded-lg p-6 text-center">
              <h3 className="font-semibold text-green-800 mb-2 text-lg">Recommended Model: Gemma3 4B</h3>
              <button
                onClick={handlePullModelClick}
                className="w-full sm:w-auto px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium text-base shadow-sm hover:shadow-md"
              >
                Pull Your First Model!
              </button>
            </div>

            <div className="mt-8 flex flex-col-reverse sm:flex-row justify-between items-center gap-4">
              <button onClick={handleSkipForNow} className="text-sm text-gray-600 hover:underline">
                Choose a different model
              </button>
              <button onClick={handleDone} className="text-sm text-gray-600 hover:underline">
                I'll do this later
              </button>
            </div>
          </div>
        ) : !isFinished && !isPulling && (
          <>
            <p className="text-gray-600 mb-5">
              Enter a model name from the Ollama library (e.g., <code className="bg-gray-100 px-1 rounded text-sm">gemma3:4b</code>).
            </p>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="text" list="model-suggestions" value={modelToPull}
                onChange={(e) => setModelToPull(e.target.value)}
                placeholder="Enter model name..."
                className="flex-grow p-2.5 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
              />
              <datalist id="model-suggestions">
                {suggestedModels.map(model => <option key={model} value={model} />)}
              </datalist>
              <button
                onClick={handleStartPull}
                className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
              >
                <Download size={18} />
                <span>Start Download</span>
              </button>
            </div>
          </>
        )}

        {isPulling && (
          <div className="mt-6 space-y-3">
            <div className="flex justify-between items-baseline">
              <p className="text-sm font-medium text-gray-700">{statusText}</p>
              <p className="text-sm font-semibold text-blue-600">{progress}%</p>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2.5">
              <div
                className="bg-blue-500 h-2.5 rounded-full transition-all duration-150"
                style={{ width: `${progress}%` }}
              ></div>
            </div>
            <div className="flex justify-between items-center">
                {totalBytes > 0 ? (
                    <p className="text-xs text-gray-500 font-mono">
                    {formatBytes(completedBytes)} / {formatBytes(totalBytes)}
                    </p>
                ) : <div/>}
                <button 
                    onClick={handleCancelPull} 
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-red-600 bg-red-50 hover:bg-red-100 rounded-md font-semibold"
                >
                    <StopCircle size={14}/> Cancel
                </button>
            </div>
          </div>
        )}

        {status === 'success' && (
           <div className="mt-4 p-4 bg-green-50 border border-green-200 text-green-800 rounded-md flex flex-col items-center gap-3 text-center">
              <CheckCircle size={32} className="text-green-500" />
              <div>
                <h3 className="font-semibold">Download Complete!</h3>
                <p className="text-sm">{statusText}</p>
              </div>
           </div>
        )}
        
        {status === 'error' && (
          <div className="mt-4 p-4 bg-red-50 border border-red-200 text-red-800 rounded-md flex flex-col items-center gap-3 text-center">
            <AlertTriangle size={32} className="text-red-500" />
            <div>
                <h3 className="font-semibold">An Error Occurred</h3>
                <p className="text-sm">{errorText}</p>
            </div>
          </div>
        )}

        {isFinished && (
            <div className="mt-6 flex justify-end">
                <button onClick={handleDone} className="px-5 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-800 font-medium">
                    Done
                </button>
            </div>
        )}
      </div>
    </Modal>
  );
};

export default TerminalModal;
