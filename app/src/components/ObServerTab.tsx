// src/components/ObServerTab.tsx

import React, { useState, useEffect } from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import { Loader2, AlertTriangle } from 'lucide-react';
import { Logger } from '@utils/logging';
import { PricingTable } from './PricingTable'; // Import our new reusable component

export const ObServerTab: React.FC = () => {
  const [status, setStatus] = useState<'loading' | 'pro' | 'free' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [isButtonLoading, setIsButtonLoading] = useState(false);
  
  const { getAccessTokenSilently, isAuthenticated, loginWithRedirect } = useAuth0();

  // This logic stays here, as this component is responsible for fetching its own data.
  useEffect(() => {
    if (!isAuthenticated) {
      setStatus('free');
      return;
    }
    
    const checkProStatus = async () => {
      setStatus('loading');
      try {
        const token = await getAccessTokenSilently();
        const response = await fetch('https://api.observer-ai.com/quota', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!response.ok) throw new Error(`API request failed with status: ${response.status}`);
        const data = await response.json();
        setStatus(data.pro_status ? 'pro' : 'free');
      } catch (err) {
        Logger.error('PAYMENTS', 'Failed to check pro status:', err);
        setError('Could not retrieve your subscription status.');
        setStatus('error');
      }
    };

    checkProStatus();
  }, [isAuthenticated, getAccessTokenSilently]);

  // This logic also stays here. The PricingTable component calls these functions via props.
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

  // --- RENDER LOGIC ---

  // Handle the loading state
  if (status === 'loading') {
    return (
      <div className="flex justify-center items-center p-20">
        <Loader2 className="h-12 w-12 animate-spin text-gray-500" />
      </div>
    );
  }
  
  // Handle the error state
  if (status === 'error') {
      return (
        <div className="max-w-3xl mx-auto p-8 bg-white rounded-lg shadow-md text-center border-l-4 border-red-500">
            <AlertTriangle className="mx-auto h-16 w-16 text-red-500 mb-4" />
            <h1 className="text-3xl font-bold text-gray-800 mb-2">Something Went Wrong</h1>
            <p className="text-gray-600">{error || 'We could not load your subscription details. Please refresh the page.'}</p>
        </div>
      )
  }

  // The main render path is now incredibly simple.
  // It renders the reusable table with props tailored for the general "Ob-Server" tab.
  return (
    <div className="flex justify-center pt-8">
      <div className="w-full max-w-4xl">
        <PricingTable
          headline="Choose Your Way to Observe"
          subheadline=""
          status={status}
          isButtonLoading={isButtonLoading}
          isAuthenticated={isAuthenticated}
          error={error}
          onCheckout={() => handleApiAction('create-checkout-session')}
          onManageSubscription={() => handleApiAction('create-customer-portal-session')}
          onLogin={loginWithRedirect}
          isTriggeredByQuotaError={true}
        />
      </div>
    </div>
  );
};
