// components/AccountModal.tsx

import React, { useState } from 'react';
import { X, User } from 'lucide-react';

interface AccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: { name?: string; email?: string; picture?: string } | null;
  onLogout: () => void;
  onDeleteAccount: () => void;
}

const AccountModal: React.FC<AccountModalProps> = ({
  isOpen,
  onClose,
  user,
  onLogout,
  onDeleteAccount,
}) => {
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  if (!isOpen) return null;

  const handleClose = () => {
    setIsConfirmingDelete(false);
    setIsDeleting(false);
    onClose();
  };

  const handleDeleteClick = () => {
    if (!isConfirmingDelete) {
      setIsConfirmingDelete(true);
    } else {
      setIsDeleting(true);
      onDeleteAccount();
    }
  };

  const handleCancelDelete = () => {
    setIsConfirmingDelete(false);
  };

  // Get user initials for avatar fallback
  const getInitials = () => {
    if (user?.name) {
      return user.name
        .split(' ')
        .map(n => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2);
    }
    if (user?.email) {
      return user.email[0].toUpperCase();
    }
    return 'U';
  };

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 z-[70] flex items-center justify-center p-4"
      onClick={handleClose}
    >
      <div
        className="bg-white rounded-xl shadow-xl w-full max-w-sm border border-gray-200 relative"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex justify-between items-center p-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-800">Account</h2>
          <button
            onClick={handleClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 flex flex-col items-center">
          {/* Avatar */}
          {user?.picture ? (
            <img
              src={user.picture}
              alt={user.name || 'User avatar'}
              className="w-16 h-16 rounded-full object-cover"
            />
          ) : (
            <div className="w-16 h-16 rounded-full bg-gray-200 flex items-center justify-center">
              <span className="text-xl font-semibold text-gray-600">{getInitials()}</span>
            </div>
          )}

          {/* Name */}
          {user?.name && (
            <p className="mt-3 text-lg font-semibold text-gray-800">{user.name}</p>
          )}

          {/* Email */}
          {user?.email && (
            <p className="mt-1 text-sm text-gray-500">{user.email}</p>
          )}

          {/* Delete confirmation warning */}
          {isConfirmingDelete && (
            <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-center">
              <p className="text-sm text-red-700">
                ⚠️ This will permanently delete your account and all associated data.
              </p>
            </div>
          )}
        </div>

        {/* Footer buttons */}
        <div className="p-4 border-t border-gray-200 flex space-x-3">
          {!isConfirmingDelete ? (
            <>
              <button
                onClick={onLogout}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-100 text-gray-700 font-medium"
              >
                Log Out
              </button>
              <button
                onClick={handleDeleteClick}
                className="flex-1 px-4 py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 font-medium"
              >
                Delete Account
              </button>
            </>
          ) : (
            <>
              <button
                onClick={handleCancelDelete}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-100 text-gray-700 font-medium"
                disabled={isDeleting}
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteClick}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium disabled:opacity-50"
                disabled={isDeleting}
              >
                {isDeleting ? 'Deleting...' : 'Confirm Delete'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default AccountModal;
