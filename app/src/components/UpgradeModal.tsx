// src/components/UpgradeModal.tsx

import React, { useState, useEffect } from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import { X as CloseIcon, Loader2 } from 'lucide-react';
import { Logger } from '@utils/logging';
import { PricingTable } from './PricingTable'; // Import our new reusable component

interface UpgradeModalProps {
  isOpen: boolean;
  onClose: () => void;
  isHalfwayWarning?: boolean;
}

export const UpgradeModal: React.FC<UpgradeModalProps> = ({ isOpen, onClose, isHalfwayWarning = false }) => {
  const [status, setStatus] = useState<'loading' | 'plus' | 'pro' | 'max' | 'free' | 'error'>('loading');
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
        // Backend returns tier: 'free' | 'plus' | 'pro' | 'max'
        setStatus(data.tier || (data.pro_status ? 'pro' : 'free'));
      } catch (err) {
        Logger.error('PAYMENTS', 'Failed to check pro status:', err);
        setError('Could not retrieve your subscription status.');
        setStatus('error');
      }
    };

    checkProStatus();
  }, [isOpen, isAuthenticated, getAccessTokenSilently]);

  const handleApiAction = async (endpoint: 'create-checkout-session' | 'create-checkout-session-plus' | 'create-checkout-session-max' | 'create-customer-portal-session') => {
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

  const handleCheckout = () => handleApiAction('create-checkout-session');
  const handlePlusCheckout = () => handleApiAction('create-checkout-session-plus');
  const handleMaxCheckout = () => handleApiAction('create-checkout-session-max');

  if (!isOpen) {
    return null;
  }

  return (
    <div 
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100] backdrop-blur-sm p-4"
      onClick={onClose} // Close modal on overlay click
    >
      <div 
        className="relative bg-white rounded-xl shadow-xl w-full max-w-4xl max-h-[90vh] overflow-y-auto transition-all duration-300"
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
            headline={isHalfwayWarning ? "You've Used Half of Your Daily Limit!" : "You've Reached Your Daily Limit!"}
            subheadline="Upgrade to Observer Pro!"
            status={status}
            isButtonLoading={isButtonLoading}
            isAuthenticated={isAuthenticated}
            error={error}
            onCheckout={handleCheckout}
            onCheckoutPlus={handlePlusCheckout}
            onCheckoutMax={handleMaxCheckout}
            onManageSubscription={() => handleApiAction('create-customer-portal-session')}
            onLogin={loginWithRedirect}
            isTriggeredByQuotaError={true} // <-- Pass the special prop here
            isHalfwayWarning={isHalfwayWarning}
          />
        )}
      </div>
    </div>
  );
};
