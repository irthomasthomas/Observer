import React, { Suspense, useState, useEffect } from 'react';
import Modal from '@components/EditAgent/Modal';
import { Wrench, X } from 'lucide-react';

import LazyCodeMirror from '@uiw/react-codemirror';
import { javascript } from '@codemirror/lang-javascript';
import { python } from '@codemirror/lang-python';
import { vscodeDark } from '@uiw/codemirror-theme-vscode';

interface ToolsModalProps {
  isOpen: boolean;
  onClose: () => void;
  code: string;
  agentName: string;
}

const ToolsModal: React.FC<ToolsModalProps> = ({ isOpen, onClose, code, agentName }) => {
  const [editorIsLoaded, setEditorIsLoaded] = useState(false);
  const [isPythonMode, setIsPythonMode] = useState(false);

  useEffect(() => {
    if (isOpen && !editorIsLoaded) {
      import('@uiw/react-codemirror').then(() => setEditorIsLoaded(true));
    }
  }, [isOpen, editorIsLoaded]);

  // Detect if code is Python or JavaScript
  useEffect(() => {
    if (code) {
      const isPython = code.includes('def ') || code.includes('import ') || code.includes('print(');
      setIsPythonMode(isPython);
    }
  }, [code]);

  if (!isOpen) return null;

  return (
    <Modal
      open={isOpen}
      onClose={onClose}
      className="w-full max-w-4xl max-h-[85vh] flex flex-col"
    >
      {/* Header */}
      <div className="flex-shrink-0 flex justify-between items-center p-4 border-b border-gray-200 bg-gradient-to-r from-blue-600 to-indigo-600 text-white">
        <div className="flex items-center space-x-3">
          <Wrench className="h-6 w-6" />
          <div>
            <h2 className="text-xl font-semibold">Agent Code</h2>
            <p className="text-sm text-blue-100">{agentName}</p>
          </div>
        </div>
        <div className="flex items-center space-x-3">
          <div className="flex border border-white/30 rounded-md overflow-hidden text-sm">
            <button
              onClick={() => setIsPythonMode(false)}
              className={`px-3 py-1 ${!isPythonMode ? 'bg-white text-indigo-600' : 'bg-transparent text-white'}`}
            >
              JS
            </button>
            <button
              onClick={() => setIsPythonMode(true)}
              className={`px-3 py-1 ${isPythonMode ? 'bg-white text-indigo-600' : 'bg-transparent text-white'}`}
            >
              Py
            </button>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-blue-700 hover:bg-opacity-50 text-indigo-100 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-grow p-6 overflow-hidden bg-gray-50">
        <div className="mb-3">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Code Editor
          </label>
          <p className="text-xs text-gray-500 mb-3">
            This code is read-only. Use the Edit button to modify the agent.
          </p>
        </div>
        <div className="h-[calc(100%-4rem)] border border-gray-300 rounded-md overflow-hidden relative">
          <Suspense fallback={
            <div className="absolute inset-0 flex items-center justify-center bg-gray-100 text-gray-500 text-sm">
              Loading editor…
            </div>
          }>
            {editorIsLoaded && (
              <LazyCodeMirror
                value={code}
                height="100%"
                className="h-full"
                theme={vscodeDark}
                extensions={[isPythonMode ? python() : javascript()]}
                editable={false}
                readOnly={true}
                basicSetup={{
                  lineNumbers: true,
                  foldGutter: true,
                  highlightActiveLine: true,
                  autocompletion: false,
                  bracketMatching: true,
                  closeBrackets: false
                }}
              />
            )}
          </Suspense>
        </div>
      </div>

      {/* Footer */}
      <div className="flex-shrink-0 flex justify-end p-4 border-t border-gray-200 bg-gray-50">
        <button
          onClick={onClose}
          className="px-5 py-2 bg-indigo-600 text-white rounded-md text-sm hover:bg-indigo-700"
        >
          Close
        </button>
      </div>
    </Modal>
  );
};

export default ToolsModal;
