// src/components/AICreator/MCPModal.tsx
import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import MCP from './MCP';
import type { TokenProvider } from '@utils/main_loop';

interface MCPModalProps {
  isOpen: boolean;
  onClose: () => void;
  getToken: TokenProvider;
  isAuthenticated: boolean;
  isUsingObServer: boolean;
  isPro?: boolean;
  onSignIn?: () => void;
  onSwitchToObServer?: () => void;
  onUpgrade?: () => void;
  onRefresh?: () => void;
  initialMessage?: string;
  onUpgradeClick?: () => void;
}

const MCPModal: React.FC<MCPModalProps> = ({
  isOpen,
  onClose,
  getToken,
  isAuthenticated,
  isUsingObServer,
  isPro,
  onSignIn,
  onSwitchToObServer,
  onUpgrade,
  onRefresh,
  initialMessage,
  onUpgradeClick: _onUpgradeClick,
}) => {
  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />

      {/* Modal */}
      <div
        className="relative z-10 w-full max-w-2xl bg-white rounded-xl shadow-2xl border border-gray-200 overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">MCP Co-pilot</h2>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-md"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* MCP content */}
        <div className="p-4">
          <MCP
            getToken={getToken}
            isAuthenticated={isAuthenticated}
            isUsingObServer={isUsingObServer}
            isPro={isPro}
            onSignIn={onSignIn}
            onSwitchToObServer={onSwitchToObServer}
            onUpgrade={onUpgrade}
            onRefresh={onRefresh}
            initialMessage={initialMessage}
            heightClass="h-[450px]"
          />
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default MCPModal;
