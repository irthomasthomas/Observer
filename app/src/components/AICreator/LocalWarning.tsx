import React, { useState, useEffect } from 'react';
import { X, AlertTriangle, Clipboard, Cpu } from 'lucide-react';
import { listModels, Model } from '@utils/inferenceServer';
import getConversationalSystemPrompt from '@utils/conversational_system_prompt';
import getMultiAgentSystemPrompt from '@utils/multi_agent_creator';

interface LocalWarningProps {
  isOpen: boolean;
  onClose: () => void;
  currentModel: string;
  onSelectModel: (modelName: string) => void;
  onSignIn?: () => void;
  onSwitchToObServer?: () => void;
  isAuthenticated: boolean;
  featureType: 'conversational' | 'multiagent';
}

interface ConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onProceed: () => void;
  onTurnOnObServer: () => void;
  onCopyPrompt: () => void;
  featureType: 'conversational' | 'multiagent';
}

const ConfirmationModal: React.FC<ConfirmationModalProps> = ({
  isOpen,
  onClose,
  onProceed,
  onTurnOnObServer,
  onCopyPrompt,
  featureType
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-[60] p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md transform transition-all">
        <div className="flex justify-between items-center p-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-800">Confirm Local Model Usage</h2>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-100">
            <X className="h-5 w-5 text-gray-500" />
          </button>
        </div>
        <div className="p-6 space-y-4">
          <p className="text-gray-700 text-center">
            This feature works best with large models ({featureType === 'conversational' ? '50B+' : '100B+'} parameters). How would you like to proceed?
          </p>
          <div className="space-y-3">
            <button
              onClick={onProceed}
              className="w-full px-4 py-3 text-sm font-medium text-gray-700 bg-gray-100 border border-gray-300 rounded-md hover:bg-gray-200 transition-colors"
            >
              Proceed, I realize a small model won't work for this feature
            </button>
            <button
              onClick={onTurnOnObServer}
              className="w-full px-4 py-3 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors"
            >
              Turn On ObServer
            </button>
            <button
              onClick={onCopyPrompt}
              className="w-full px-4 py-3 text-sm font-medium text-white bg-slate-700 rounded-md hover:bg-slate-800 transition-colors flex items-center justify-center"
            >
              <Clipboard className="h-4 w-4 mr-2" />
              Copy System Prompt
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

const LocalWarning: React.FC<LocalWarningProps> = ({
  isOpen,
  onClose,
  currentModel,
  onSelectModel,
  onSignIn,
  onSwitchToObServer,
  isAuthenticated,
  featureType
}) => {
  const [localModels, setLocalModels] = useState<Model[]>([]);
  const [isFetchingModels, setIsFetchingModels] = useState(false);
  const [localModelError, setLocalModelError] = useState<string | null>(null);
  const [isCopied, setIsCopied] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [pendingModel, setPendingModel] = useState<string>('');

  useEffect(() => {
    if (isOpen) {
      const fetchLocalModels = async () => {
        setIsFetchingModels(true);
        setLocalModelError(null);
        try {
          const result = listModels();
          if (result.error) throw new Error(result.error);
          if (result.models.length === 0) {
            setLocalModelError("No models found. Ensure your local server is running and has models available.");
          } else {
            setLocalModels(result.models);
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : "An unknown error occurred.";
          setLocalModelError(`Connection failed: ${message}`);
        } finally {
          setIsFetchingModels(false);
        }
      };
      fetchLocalModels();
    }
  }, [isOpen]);

  const handleCopyPrompt = () => {
    const promptText = featureType === 'conversational'
      ? getConversationalSystemPrompt()
      : getMultiAgentSystemPrompt();
    navigator.clipboard.writeText(promptText).then(() => {
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    });
  };

  const handleModelSelect = (modelName: string) => {
    setPendingModel(modelName);
    setShowConfirmation(true);
  };

  const handleConfirmationProceed = () => {
    onSelectModel(pendingModel);
    setShowConfirmation(false);
    onClose();
  };

  const handleConfirmationObServer = () => {
    setShowConfirmation(false);
    if (!isAuthenticated) {
      onSignIn?.();
    } else {
      onSwitchToObServer?.();
      onClose();
    }
  };

  const handleConfirmationCopyPrompt = () => {
    handleCopyPrompt();
    setShowConfirmation(false);
  };

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-xl shadow-2xl w-full max-w-md transform transition-all">
          <div className="flex justify-between items-center p-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-800">Configure Local Model</h2>
            <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-100">
              <X className="h-5 w-5 text-gray-500" />
            </button>
          </div>
          <div className="p-6 space-y-6">
            <div className="bg-red-100 border-l-4 border-red-500 text-red-800 p-4 rounded-md text-sm">
              <div className="flex items-start space-x-3">
                <AlertTriangle className="h-5 w-5 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-bold">Warning!</p>
                  <p>This feature requires models with {featureType === 'conversational' ? '50B+' : '100B+'} parameters for reliable results.</p>
                </div>
              </div>
            </div>

            <button
              onClick={handleCopyPrompt}
              className="w-full px-4 py-2 text-sm font-medium text-white bg-slate-700 rounded-md hover:bg-slate-800 transition-colors flex items-center justify-center"
            >
              <Clipboard className="h-4 w-4 mr-2" />
              {isCopied ? 'Copied!' : 'Copy System Prompt'}
            </button>

            <div>
              <label htmlFor="model-select" className="block text-sm font-medium text-gray-700 mb-2">
                Select a model to power the generator:
              </label>
              {isFetchingModels ? (
                <div className="text-sm text-gray-500">Loading models...</div>
              ) : localModelError ? (
                <div className="text-sm text-red-600">{localModelError}</div>
              ) : (
                <select
                  id="model-select"
                  value={currentModel}
                  onChange={(e) => handleModelSelect(e.target.value)}
                  className="block w-full p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                >
                  <option value="" disabled>-- Choose your model --</option>
                  {localModels.map(model => (
                    <option key={model.name} value={model.name}>{model.name}</option>
                  ))}
                </select>
              )}
            </div>

            <div className="text-right">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      </div>

      <ConfirmationModal
        isOpen={showConfirmation}
        onClose={() => setShowConfirmation(false)}
        onProceed={handleConfirmationProceed}
        onTurnOnObServer={handleConfirmationObServer}
        onCopyPrompt={handleConfirmationCopyPrompt}
        featureType={featureType}
      />
    </>
  );
};

export default LocalWarning;
