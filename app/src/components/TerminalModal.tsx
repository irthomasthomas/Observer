import React, { useState, useRef, useEffect } from 'react';
import Modal from '@components/EditAgent/Modal';
import { getOllamaServerAddress } from '@utils/main_loop';

interface TerminalModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const suggestions = [
  'ollama run gemma3:4b',
  'ollama run llava:7b',
  'ollama run gemma3:12b',
  'ollama run gemma3:27b'
];

const TerminalModal: React.FC<TerminalModalProps> = ({ isOpen, onClose }) => {
  const [output, setOutput] = useState('');
  const [command, setCommand] = useState('');
  const outputRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [output]);

  const runCommand = () => {
    if (!command.trim()) return;
    const { host, port } = getOllamaServerAddress();
    const url = `${host}:${port}/exec?cmd=${encodeURIComponent(command)}`;
    const es = new EventSource(url);
    setOutput(prev => prev + `> ${command}\n`);
    setCommand('');

    es.onmessage = (ev) => {
      setOutput(prev => prev + ev.data + '\n');
    };

    es.addEventListener('done', () => {
      es.close();
    });

    es.onerror = () => {
      setOutput(prev => prev + '[error]\n');
      es.close();
    };
  };

  if (!isOpen) return null;

  return (
    <Modal open={isOpen} onClose={onClose} className="w-full max-w-2xl">
      <div className="flex flex-col h-96">
        <div
          ref={outputRef}
          className="flex-1 bg-black text-green-500 font-mono text-sm p-2 overflow-y-auto"
        >
          <pre>{output}</pre>
        </div>
        <div className="flex items-center border-t p-2 gap-2">
          <input
            type="text"
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                runCommand();
              }
            }}
            className="flex-1 bg-gray-800 text-green-200 font-mono text-sm px-2 py-1 rounded"
            placeholder="Enter command"
          />
          <button
            onClick={runCommand}
            className="px-3 py-1 bg-blue-500 text-white rounded"
          >
            Run
          </button>
        </div>
        <div className="border-t text-xs text-gray-700 p-2">
          Try: {suggestions.join(' | ')}
        </div>
      </div>
    </Modal>
  );
};

export default TerminalModal;
