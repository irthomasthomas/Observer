// PersonalInfoWarningModal.tsx
import React from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { getDetectedDataTypes, getPlaceholderSuggestion } from '@utils/code_sanitizer';

interface PersonalInfoWarningModalProps {
  isOpen: boolean;
  onClose: () => void;
  detectedFunctions: string[];
  codePreview: string;
  lineNumbers: Record<string, number[]>;
  onCancel: () => void;
  onEditAgent: () => void;
  onUploadAnyway: () => void;
}

const PersonalInfoWarningModal: React.FC<PersonalInfoWarningModalProps> = ({
  isOpen,
  onClose,
  detectedFunctions,
  codePreview,
  lineNumbers,
  onCancel,
  onEditAgent,
  onUploadAnyway
}) => {
  if (!isOpen) return null;

  const dataTypes = getDetectedDataTypes(detectedFunctions);

  // Create a map of line number to function names for that line
  const lineToFunctions: Record<number, string[]> = {};
  Object.entries(lineNumbers).forEach(([funcName, lines]) => {
    lines.forEach(lineNum => {
      if (!lineToFunctions[lineNum]) {
        lineToFunctions[lineNum] = [];
      }
      lineToFunctions[lineNum].push(funcName);
    });
  });

  // Highlight lines in code preview with inline placeholder suggestions
  const getHighlightedCode = () => {
    const lines = codePreview.split('\n');

    return lines.map((line, index) => {
      const lineNum = index + 1;
      const functionsOnLine = lineToFunctions[lineNum] || [];
      const isHighlighted = functionsOnLine.length > 0;

      return (
        <div
          key={index}
          className={`${
            isHighlighted
              ? 'bg-yellow-100 border-l-4 border-yellow-500'
              : ''
          } px-2 py-1 flex items-center justify-between`}
        >
          <div className="flex items-center">
            <span className="text-gray-400 select-none mr-4 inline-block w-8 text-right">
              {lineNum}
            </span>
            <span className="font-mono text-sm">{line}</span>
          </div>
          {isHighlighted && (
            <div className="flex items-center gap-2 ml-4 flex-shrink-0">
              {functionsOnLine.map((funcName, idx) => (
                <span
                  key={idx}
                  className="text-xs px-2 py-1 bg-blue-100 text-blue-800 rounded border border-blue-300 whitespace-nowrap"
                >
                  Suggested: {getPlaceholderSuggestion(funcName)}
                </span>
              ))}
            </div>
          )}
        </div>
      );
    });
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[80]">
      <div className="bg-white rounded-lg shadow-xl w-11/12 max-w-4xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-yellow-200 bg-yellow-50">
          <div className="flex items-center space-x-3">
            <AlertTriangle className="h-7 w-7 text-yellow-600" />
            <h2 className="text-2xl font-bold text-yellow-900">
              Warning: Potential Personal Information Detected
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-full hover:bg-yellow-100 text-yellow-700"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 p-6 overflow-auto">
          {/* Compact Warning Message with Detected Functions */}
          <div className="mb-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
            <p className="text-gray-700 mb-2">
              Your agent contains notification functions that may include personal information such as:{' '}
              <span className="font-semibold">
                {dataTypes.join(', ')}
              </span>
              . Please review your code and replace any sensitive information with placeholders before uploading to the community.
            </p>
            <div className="flex flex-wrap gap-2 mt-2">
              {detectedFunctions.map((func) => (
                <span
                  key={func}
                  className="px-2 py-1 bg-blue-100 text-blue-800 rounded font-mono text-xs border border-blue-300"
                >
                  {func}() <span className="text-gray-500 font-normal">line {lineNumbers[func]?.join(', ')}</span>
                </span>
              ))}
            </div>
          </div>

          {/* Code Preview */}
          <div>
            <h3 className="font-semibold text-gray-900 mb-2">
              Code Preview:
            </h3>
            <div className="bg-gray-50 border border-gray-200 rounded-lg overflow-auto max-h-96">
              <div className="p-2">
                {getHighlightedCode()}
              </div>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="p-6 border-t border-gray-200 flex justify-end space-x-3 bg-gray-50">
          <button
            onClick={onCancel}
            className="px-6 py-2.5 border border-gray-300 rounded-lg hover:bg-gray-100 text-gray-700 font-medium transition-colors"
          >
            Cancel Upload
          </button>
          <button
            onClick={onEditAgent}
            className="px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition-colors"
          >
            Edit Agent
          </button>
          <button
            onClick={onUploadAnyway}
            className="px-6 py-2.5 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 font-medium transition-colors"
          >
            I've Removed Personal Info - Upload Anyway
          </button>
        </div>
      </div>
    </div>
  );
};

export default PersonalInfoWarningModal;
