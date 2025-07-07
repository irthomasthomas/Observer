// src/components/UpgradeModal.tsx

import React, { useState, useEffect } from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import { X as CloseIcon, Loader2 } from 'lucide-react';
import { Logger } from '@utils/logging';
import { PricingTable } from './PricingTable'; // Import our new reusable component

interface UpgradeModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const UpgradeModal: React.FC<UpgradeModalProps> = ({ isOpen, onClose }) => {
  const [status, setStatus] = useState<'loading' | 'pro' | 'free' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [isButtonLoading, setIsButtonLoading] = useState(false);
  
  const { getAccessTokenSilently, isAuthenticated, loginWithRedirect } = useAuth0();

  // This logic is copied from ObServerTab - it's specific to this data-fetching context
  useEffect(() => {
    if (!isOpen || !isAuthenticated) {
      if (!isAuthenticated) setStatus('free');
      return;
    }
    
    const checkProStatus = async () => {
      setStatus('loading');
      try {
        const token = await getAccessTokenSilently();
        const response = await fetch('https://api.observer-ai.com/quota', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!response.ok) throw new Error(`API request failed: ${response.statusText}`);
        const data = await response.json();
        setStatus(data.pro_status ? 'pro' : 'free');
      } catch (err) {
        Logger.error('PAYMENTS', 'Failed to check pro status:', err);
        setError('Could not retrieve your subscription status.');
        setStatus('error');
      }
    };

    checkProStatus();
  }, [isOpen, isAuthenticated, getAccessTokenSilently]);

  const handleApiAction = async (endpoint: 'create-checkout-session' | 'create-customer-portal-session') => {
    setIsButtonLoading(true);
    setError(null);
    try {
      const token = await getAccessTokenSilently();
      const response = await fetch(`https://api.observer-ai.com/payments/${endpoint}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
      });
      if (!response.ok) throw new Error(`Failed to access ${endpoint}`);
      const { url } = await response.json();
      window.location.href = url;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(`Action failed: ${errorMessage}. Please try again later.`);
    } finally {
      setIsButtonLoading(false);
    }
  };

  if (!isOpen) {
    return null;
  }

  return (
    <div 
      className="fixed inset-0 bg-black bg-opacity-60 flex justify-center items-center z-50 p-4 transition-opacity duration-300"
      onClick={onClose} // Close modal on overlay click
    >
      <div 
        className="relative bg-white rounded-xl shadow-2xl w-full max-w-6xl max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()} // Prevent clicks inside modal from closing it
      >
        <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-gray-700 z-10">
          <CloseIcon className="h-6 w-6" />
        </button>

        {status === 'loading' ? (
          <div className="flex justify-center items-center p-20">
            <Loader2 className="h-12 w-12 animate-spin text-gray-500" />
          </div>
        ) : (
          <PricingTable
            headline="You've Reached Your Daily Limit!"
            subheadline="Upgrade to Observer Pro and support the project!"
            status={status}
            isButtonLoading={isButtonLoading}
            isAuthenticated={isAuthenticated}
            error={error}
            onCheckout={() => handleApiAction('create-checkout-session')}
            onManageSubscription={() => handleApiAction('create-customer-portal-session')}
            onLogin={loginWithRedirect}
            isTriggeredByQuotaError={true} // <-- Pass the special prop here
          />
        )}
      </div>
    </div>
  );
};
