// src/components/WelcomeModal.new.tsx

import React, { useState, useEffect } from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import { X as CloseIcon, Loader2, Sparkles, Zap, Heart, Star } from 'lucide-react';
import { Logger } from '@utils/logging';

interface WelcomeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onViewAllTiers: () => void;
}

export const WelcomeModal: React.FC<WelcomeModalProps> = ({ isOpen, onClose, onViewAllTiers }) => {
  const [status, setStatus] = useState<'loading' | 'plus' | 'pro' | 'max' | 'free' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [isButtonLoading, setIsButtonLoading] = useState(false);
  const [dontShowAgain, setDontShowAgain] = useState(false);

  const { getAccessTokenSilently, isAuthenticated, user } = useAuth0();

  useEffect(() => {
    if (!isOpen || !isAuthenticated) {
      if (!isAuthenticated) setStatus('free');
      return;
    }

    const checkSubscriptionStatus = async () => {
      setStatus('loading');
      try {
        const token = await getAccessTokenSilently();
        const response = await fetch('https://api.observer-ai.com/quota', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!response.ok) throw new Error(`API request failed: ${response.statusText}`);
        const data = await response.json();
        setStatus(data.tier || 'free');
      } catch (err) {
        Logger.error('WELCOME', 'Failed to check subscription status:', err);
        setError('Could not retrieve your subscription status.');
        setStatus('error');
      }
    };

    checkSubscriptionStatus();
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

  const handleProCheckout = () => handleApiAction('create-checkout-session');

  const handleStarGithub = () => {
    window.open('https://github.com/Roy3838/Observer', '_blank');
  };

  const handleClose = () => {
    if (dontShowAgain && user?.sub) {
      localStorage.setItem(`observer_welcome_dismissed_${user.sub}`, 'true');
      Logger.info('WELCOME', 'User dismissed welcome modal with "Don\'t show again"');
    }
    onClose();
  };

  if (!isOpen) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100] backdrop-blur-sm p-4"
      onClick={handleClose}
    >
      <div
        className="relative bg-white rounded-2xl shadow-xl border border-gray-200 w-full max-w-3xl max-h-[90vh] overflow-y-auto transition-all duration-300"
        onClick={e => e.stopPropagation()}
      >
        <button onClick={handleClose} className="absolute top-4 right-4 text-gray-400 hover:text-gray-700 z-10 transition-colors">
          <CloseIcon className="h-6 w-6" />
        </button>

        {status === 'loading' ? (
          <div className="flex justify-center items-center p-20">
            <Loader2 className="h-12 w-12 animate-spin text-gray-500" />
          </div>
        ) : (
          <div className="p-8">
            {/* ============ WELCOME SECTION (Top 60%) ============ */}
            <div className="text-center mb-6 pb-6 border-b-2 border-gray-200">
              <div className="flex justify-center items-center mb-3">
                <img src="/eye-logo-black.svg" alt="Observer AI Logo" className="h-16 w-16 mr-3" />
                <h1 className="text-3xl font-bold text-gray-800 tracking-tight">Welcome to Observer!</h1>
              </div>

              <p className="text-base text-gray-600 max-w-2xl mx-auto leading-relaxed">
                Local micro-agents that watch, log, and react.
              </p>
            </div>

            {/* ============ SUPPORT SECTION (Bottom 40%) ============ */}
            <div className="text-center mb-6">
              <p className="text-base text-gray-700 mb-1 flex items-center justify-center gap-2">
                <Heart className="h-5 w-5 text-pink-500" />
                <span className="font-semibold">Built by a solo developer</span>
              </p>
              <p className="text-sm text-gray-600 mb-6">
                Try Observer Pro free - give feedback and help development
              </p>

              {/* Observer Pro - Hero Free Trial Option */}
              <div className="bg-gradient-to-br from-purple-50 to-blue-50 border-2 border-purple-300 rounded-xl p-6 max-w-md mx-auto mb-4 hover:shadow-xl transition-all duration-200 relative">
                <div className="absolute top-0 -translate-y-1/2 left-1/2 -translate-x-1/2">
                  <div className="bg-gradient-to-r from-purple-500 to-blue-500 text-white text-xs font-bold uppercase tracking-wider rounded-full px-4 py-1 whitespace-nowrap shadow-lg">
                    Free Trial 
                  </div>
                </div>

                <div className="flex items-center justify-center gap-3 mb-4 mt-2">
                  <Sparkles className="h-10 w-10 text-purple-500" />
                  <div className="text-left">
                    <h3 className="text-xl font-bold text-purple-900">Observer Pro</h3>
                    <p className="text-sm text-purple-700">
                      <span className="text-2xl font-bold text-purple-900">7 days free</span>
                      <span className="text-xs ml-1">then $20/month</span>
                    </p>
                  </div>
                </div>

                <div className="space-y-2 mb-4 text-sm text-purple-900">
                  <div className="flex items-start">
                    <Sparkles className="h-4 w-4 text-purple-500 mr-2 flex-shrink-0 mt-0.5" />
                    <span><strong>Unlock AI Studio</strong> - multi-agent configs</span>
                  </div>
                  <div className="flex items-start">
                    <Zap className="h-4 w-4 text-purple-500 mr-2 flex-shrink-0 mt-0.5" />
                    <span><strong>8 hours/day</strong> cloud monitoring</span>
                  </div>
                  <div className="flex items-start">
                    <Sparkles className="h-4 w-4 text-purple-500 mr-2 flex-shrink-0 mt-0.5" />
                    <span><strong>Premium AI models</strong> access</span>
                  </div>
                  <div className="flex items-start">
                    <Heart className="h-4 w-4 text-pink-500 mr-2 flex-shrink-0 mt-0.5" />
                    <span><strong>Support open source</strong> development</span>
                  </div>
                </div>

                <button
                  onClick={handleProCheckout}
                  disabled={isButtonLoading}
                  className="w-full px-6 py-3 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-lg hover:from-purple-700 hover:to-blue-700 focus:outline-none focus:ring-4 focus:ring-purple-300 transition-all duration-200 font-semibold text-base shadow-md hover:shadow-lg disabled:bg-slate-400 disabled:cursor-not-allowed flex items-center justify-center"
                >
                  {isButtonLoading ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : null}
                  Start Free Trial
                </button>
              </div>

              {/* Error Display */}
              {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4 text-center max-w-md mx-auto">
                  <p className="text-sm text-red-700">{error}</p>
                </div>
              )}

              {/* Action Buttons - All Inline */}
              <div className="flex items-center justify-center gap-3 flex-wrap">
                <button
                  onClick={handleStarGithub}
                  className="px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-900 transition-colors font-medium flex items-center gap-2 group shadow-md"
                >
                  <Star className="h-4 w-4 text-yellow-400 fill-yellow-400 group-hover:scale-110 transition-transform" />
                  <span>Star on GitHub</span>
                  <span className="text-xs opacity-80">(1.2k)</span>
                </button>

                <div className="text-gray-300">|</div>

                <button
                  onClick={() => {
                    onViewAllTiers();
                    handleClose();
                  }}
                  className="text-sm text-purple-600 hover:text-purple-800 hover:underline transition-colors font-medium flex items-center gap-1"
                >
                  <Sparkles className="h-4 w-4" />
                  View all tiers →
                </button>

                <div className="text-gray-300">|</div>

                <button
                  onClick={handleClose}
                  className="text-sm text-gray-600 hover:text-gray-800 hover:underline transition-colors font-medium"
                >
                  Continue with free tier →
                </button>
              </div>
            </div>

            {/* Don't show again checkbox */}
            <div className="flex items-center justify-center pt-4 border-t border-gray-200">
              <label className="flex items-center cursor-pointer text-sm text-gray-600 hover:text-gray-800 transition-colors">
                <input
                  type="checkbox"
                  checked={dontShowAgain}
                  onChange={(e) => setDontShowAgain(e.target.checked)}
                  className="mr-2 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                Don't show this again
              </label>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
