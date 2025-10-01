import React from 'react';
import Modal from '@components/EditAgent/Modal';
import SensorInputText from '@components/EditAgent/SensorInputText';
import { Eye, X } from 'lucide-react';

interface SensorModalProps {
  isOpen: boolean;
  onClose: () => void;
  systemPrompt: string;
  agentName: string;
}

const SensorModal: React.FC<SensorModalProps> = ({ isOpen, onClose, systemPrompt, agentName }) => {
  if (!isOpen) return null;

  return (
    <Modal
      open={isOpen}
      onClose={onClose}
      className="w-full max-w-3xl max-h-[80vh] flex flex-col"
    >
      {/* Header */}
      <div className="flex-shrink-0 flex justify-between items-center p-4 border-b border-gray-200 bg-gradient-to-r from-blue-600 to-indigo-600 text-white">
        <div className="flex items-center space-x-3">
          <Eye className="h-6 w-6" />
          <div>
            <h2 className="text-xl font-semibold">System Prompt</h2>
            <p className="text-sm text-blue-100">{agentName}</p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded-full hover:bg-blue-700 hover:bg-opacity-50 text-indigo-100 hover:text-white"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-grow p-6 overflow-y-auto bg-gray-50">
        <div className="mb-3">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            System Prompt with Sensors
          </label>
          <p className="text-xs text-gray-500 mb-3">
            Sensor variables are highlighted in color. This prompt is read-only.
          </p>
        </div>
        <SensorInputText
          value={systemPrompt}
          onChange={() => {}} // Read-only
          className="h-96 bg-white"
          placeholder="No system prompt defined"
        />
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

export default SensorModal;
