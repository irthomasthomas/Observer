// src/components/EditAgent/Modal.tsx
import React, { ReactNode, useEffect } from 'react';
import ReactDOM from 'react-dom';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  className?: string;      // width / height / flex etc.
  backdropClassName?: string;
}

let openCount = 0; // track how many modals are mounted for scroll-lock

const Modal: React.FC<ModalProps> = ({
  open,
  onClose,
  children,
  className = '',
  backdropClassName = 'bg-black/50'
}) => {
  // 1. Early exit
  if (!open) return null;

  // 2. Target element for the portal
  const portalTarget =
    document.getElementById('modal-root') ?? document.body;

  // 3. Close on <Esc>
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  // 4. Disable body scroll while any modal is open
  useEffect(() => {
    openCount += 1;
    document.body.classList.add('overflow-hidden');
    return () => {
      openCount -= 1;
      if (openCount === 0) document.body.classList.remove('overflow-hidden');
    };
  }, []);

  // 5. Backdrop click only when the *originating* target *is* the backdrop
  const handleBackdropMouseDown = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  };

  return ReactDOM.createPortal(
    <div
      className={`fixed inset-0 z-[1000] flex items-center justify-center ${backdropClassName}`}
      onMouseDown={handleBackdropMouseDown}
    >
      <div
        className={`relative bg-white rounded-lg shadow-xl ${className}`}
        // stop bubbling so clicks inside never reach the backdrop
        onMouseDown={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>,
    portalTarget
  );
};

export default Modal;

