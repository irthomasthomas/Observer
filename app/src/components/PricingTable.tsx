// src/components/PricingTable.tsx

import React from 'react';
import {
  Loader2, Zap, ExternalLink, Heart, HeartCrack,
  Check, HardDrive, Server, Sparkles
} from 'lucide-react';

// Define the props this component will accept
interface PricingTableProps {
  headline: string;
  subheadline: string;
  status: 'loading' | 'pro' | 'max' | 'free' | 'error';
  isButtonLoading: boolean;
  isAuthenticated: boolean;
  error: string | null;
  onCheckout: () => void;
  onCheckoutMax: () => void;
  onManageSubscription: () => void;
  onLogin: () => void;
  isTriggeredByQuotaError?: boolean; // Optional prop for special styling
  isHalfwayWarning?: boolean; // New prop to indicate halfway warning vs full limit
}

export const PricingTable: React.FC<PricingTableProps> = ({
  headline,
  subheadline,
  status,
  isButtonLoading,
  isAuthenticated,
  error,
  onCheckout,
  onCheckoutMax,
  onManageSubscription,
  onLogin,
  isTriggeredByQuotaError = false,
  isHalfwayWarning = false,
}) => {
  // Use smaller sizing for non-modal contexts (like ObServerTab)
  const containerClass = isTriggeredByQuotaError
    ? "w-full max-w-6xl mx-auto p-4 sm:p-6 md:p-8 bg-white rounded-lg"  // Modal - larger
    : "w-full max-w-2xl mx-auto p-3 sm:p-4 bg-white rounded-lg";         // Tab - 60% smaller

  return (
    <div className={containerClass}>
      <div className="flex items-start gap-4 mb-4">
        <div className="flex-shrink-0">
          <Zap className={isTriggeredByQuotaError ? "h-12 w-12 text-purple-500" : "h-8 w-8 text-purple-500"} />
        </div>
        <div className="flex-1">
          <h1 className={isTriggeredByQuotaError ? "text-2xl sm:text-3xl font-bold text-gray-800 tracking-tight mb-2" : "text-xl sm:text-2xl font-bold text-gray-800 tracking-tight mb-2"}>{headline}</h1>
          <p className={isTriggeredByQuotaError ? "text-base sm:text-lg text-gray-600 mb-3" : "text-sm sm:text-base text-gray-600 mb-2"}>{subheadline}</p>
          {isTriggeredByQuotaError && (
            <div className="flex items-center space-x-3 text-xs text-gray-500">
              <span>🚀 900+ users</span>
              <span>•</span>
              <span>⭐ 1k+ GitHub stars</span>
              <span>•</span>
              <span>⚡ Processing 100k+ captures daily</span>
            </div>
          )}
        </div>
      </div>

      <div className={isTriggeredByQuotaError ? "grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6 items-start" : "grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4 items-start"}>
        {/* Column 1: Free Tier */}
        <div className={`relative border rounded-lg p-4 flex flex-col h-full bg-white shadow-md ${status === 'free' && isTriggeredByQuotaError ? 'border-gray-400 border-2' : ''}`}>
           {status === 'free' && isTriggeredByQuotaError && (
             <div className="absolute top-0 -translate-y-1/2 left-1/2 -translate-x-1/2">
               <div className="bg-gray-500 text-white text-xs font-bold uppercase tracking-wider rounded-full px-6 py-1 whitespace-nowrap">Current</div>
             </div>
           )}
          <div className="text-center mb-4">
            <Server className="mx-auto h-10 w-10 text-gray-500 mb-3" />
            <h2 className="text-xl font-bold text-gray-800">Quick Start</h2>
            <p className="text-gray-500 text-sm">Perfect for trying out Observer</p>
          </div>
          <ul className="space-y-3 mb-6 flex-grow text-sm">
            <li className="flex items-start">
              <Check className="h-5 w-5 text-green-500 mr-2 flex-shrink-0 mt-0.5" />
              <span><strong>Cost:</strong> Free to try out!</span>
            </li>
            <li className="flex items-start">
              <HardDrive className="h-5 w-5 text-blue-500 mr-2 flex-shrink-0 mt-0.5" />
              <span><strong>Local Monitoring 24/7 </strong></span>
            </li>
            <li className="flex items-start">
              <Check className="h-5 w-5 text-green-500 mr-2 flex-shrink-0 mt-0.5" />
              <span>
                <strong>Unlimited Notifications:</strong> Discord, Browser, System & Overlay!
                <span className="block text-gray-600 text-xs mt-1">Premium channels (SMS, Email, WhatsApp, Telegram, Pushover): 3/day</span>
              </span>
            </li>
            <li className="flex items-start">
              <Check className="h-5 w-5 text-green-500 mr-2 flex-shrink-0 mt-0.5" />
              <span><strong>Alert Builder:</strong> 2-3 builds/week</span>
            </li>
            <li className="flex items-start">
              <Check className="h-5 w-5 text-green-500 mr-2 flex-shrink-0 mt-0.5" />
              <span>
                <strong>Cloud Monitoring:</strong> 15 min/day
                {isHalfwayWarning && <span className="block text-yellow-600 text-xs mt-1">(Halfway there!)</span>}
              </span>
            </li>
            <li className="flex items-start">
              <HeartCrack className="h-5 w-5 text-red-500 mr-2 flex-shrink-0 mt-0.5" />
              <span><strong>Support:</strong> Limited (solo dev!)</span>
            </li>
          </ul>
          <div className="mt-auto h-12"></div>
        </div>

        {/* Column 2: Pro Tier */}
        <div className={`relative border-2 border-purple-500 rounded-lg p-6 flex flex-col h-full bg-purple-50 shadow-lg ${status === 'pro' && isTriggeredByQuotaError ? 'ring-2 ring-purple-600' : ''}`}>
          {status === 'pro' && isTriggeredByQuotaError && (
            <div className="absolute top-0 -translate-y-1/2 left-1/2 -translate-x-1/2">
              <div className="bg-purple-600 text-white text-xs font-bold uppercase tracking-wider rounded-full px-6 py-1 whitespace-nowrap">Current</div>
            </div>
          )}
          {status !== 'pro' && (
            <div className="absolute top-0 -translate-y-1/2 left-1/2 -translate-x-1/2">
              <div className="bg-purple-500 text-white text-xs font-bold uppercase tracking-wider rounded-full px-4 py-1 whitespace-nowrap">Recommended</div>
            </div>
          )}
          <div className="text-center mb-4">
            <Sparkles className="mx-auto h-12 w-12 text-purple-500 mb-3" />
            <h2 className="text-2xl font-bold text-purple-800">Observer Pro</h2>
            <p className="text-purple-700 text-sm">save 240 hours/month for</p>
            <p className="text-3xl font-bold text-purple-900 mt-2">$20<span className="text-base font-normal">/month</span></p>
          </div>
          <ul className="space-y-2.5 mb-6 flex-grow text-sm">
            <li className="flex items-start">
              <Check className="h-5 w-5 text-green-500 mr-2 flex-shrink-0 mt-0.5" />
              <span><strong>Unlimited notifications</strong></span>
            </li>
            <li className="flex items-start">
              <HardDrive className="h-5 w-5 text-purple-600 mr-2 flex-shrink-0 mt-0.5" />
              <span><strong>Local Monitoring 24/7</strong></span>
            </li>
            <li className="flex items-start">
              <Check className="h-5 w-5 text-green-500 mr-2 flex-shrink-0 mt-0.5" />
              <span><strong>Unlimited Alert Builder</strong></span>
            </li>
            <li className="flex items-start">
              <Check className="h-5 w-5 text-green-500 mr-2 flex-shrink-0 mt-0.5" />
              <span><strong>Cloud Monitoring:</strong> 8 hours/day!<br/><span className="text-xs text-purple-600">Do you value your time more than 6¢/hour?</span></span>
            </li>
            <li className="flex items-start">
              <Check className="h-5 w-5 text-green-500 mr-2 flex-shrink-0 mt-0.5" />
              <span><strong>Premium Models</strong></span>
            </li>
            <li className="flex items-start">
              <Sparkles className="h-5 w-5 text-purple-500 mr-2 flex-shrink-0 mt-0.5" />
              <span><strong>Unlock AI Studio</strong></span>
            </li>
            <li className="flex items-start">
              <Heart className="h-5 w-5 text-pink-500 mr-2 flex-shrink-0 mt-0.5" />
              <span><strong>Better support</strong></span>
            </li>
          </ul>
          {status === 'pro' ? (
            <button
              onClick={onManageSubscription}
              disabled={isButtonLoading}
              className="w-full mt-auto inline-flex items-center justify-center px-6 py-3 border border-transparent text-base font-medium rounded-md text-purple-700 bg-purple-100 hover:bg-purple-200 disabled:bg-gray-300 transition-colors"
            >
              {isButtonLoading ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <ExternalLink className="mr-2 h-4 w-4" />}
              Manage Subscription
            </button>
          ) : (
            <button
              onClick={isAuthenticated ? onCheckout : onLogin}
              disabled={isButtonLoading}
              className="w-full mt-auto inline-flex items-center justify-center px-8 py-3 border border-transparent text-base font-bold rounded-md text-white bg-purple-600 hover:bg-purple-700 disabled:bg-gray-400 transition-colors"
            >
              {isButtonLoading ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : null}
              Start Free Trial
            </button>
          )}
        </div>

        {/* Column 3: Max Tier */}
        <div className={`relative border-2 border-amber-500 rounded-lg p-6 flex flex-col h-full bg-gradient-to-br from-amber-50 to-yellow-50 shadow-xl ${status === 'max' && isTriggeredByQuotaError ? 'ring-2 ring-amber-600' : ''}`}>
          {status === 'max' && isTriggeredByQuotaError && (
            <div className="absolute top-0 -translate-y-1/2 left-1/2 -translate-x-1/2">
              <div className="bg-amber-600 text-white text-xs font-bold uppercase tracking-wider rounded-full px-6 py-1 whitespace-nowrap">Current</div>
            </div>
          )}
          {status !== 'max' && (
            <div className="absolute top-0 -translate-y-1/2 left-1/2 -translate-x-1/2">
              <div className="bg-gradient-to-r from-amber-500 to-yellow-500 text-white text-xs font-bold uppercase tracking-wider rounded-full px-4 py-1 whitespace-nowrap shadow-lg">Premium</div>
            </div>
          )}
          <div className="text-center mb-4">
            <div className="flex items-center justify-center gap-2 mb-3">
              <Zap className="h-12 w-12 text-amber-500" />
            </div>
            <h2 className="text-2xl font-bold text-amber-900">Observer Max</h2>
            <p className="text-amber-800 text-sm font-semibold">Absolutely everything, unlimited</p>
            <p className="text-4xl font-bold text-amber-900 mt-2">$80<span className="text-base font-normal">/month</span></p>
          </div>
          <ul className="space-y-2.5 mb-6 flex-grow text-sm">
            <li className="flex items-start">
              <Zap className="h-5 w-5 text-amber-500 mr-2 flex-shrink-0 mt-0.5" />
              <span><strong>24/7 Unlimited Cloud Monitoring</strong></span>
            </li>
            <li className="flex items-start">
              <Check className="h-5 w-5 text-green-500 mr-2 flex-shrink-0 mt-0.5" />
              <span><strong>Everything Unlimited</strong></span>
            </li>
            <li className="flex items-start">
              <Sparkles className="h-5 w-5 text-amber-500 mr-2 flex-shrink-0 mt-0.5" />
              <span><strong>Unlimited Premium Models</strong></span>
            </li>
            <li className="flex items-start">
              <Sparkles className="h-5 w-5 text-amber-500 mr-2 flex-shrink-0 mt-0.5" />
              <span><strong>Unlock AI Studio</strong></span>
            </li>
            <li className="flex items-start">
              <Heart className="h-5 w-5 text-pink-500 mr-2 flex-shrink-0 mt-0.5" />
              <span><strong>Priority Support</strong></span>
            </li>
          </ul>
          {status === 'max' ? (
            <button
              onClick={onManageSubscription}
              disabled={isButtonLoading}
              className="w-full mt-auto inline-flex items-center justify-center px-6 py-3 border border-transparent text-base font-medium rounded-md text-amber-700 bg-amber-100 hover:bg-amber-200 disabled:bg-gray-300 transition-colors"
            >
              {isButtonLoading ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <ExternalLink className="mr-2 h-4 w-4" />}
              Manage Subscription
            </button>
          ) : (
            <button
              onClick={isAuthenticated ? onCheckoutMax : onLogin}
              disabled={isButtonLoading}
              className="w-full mt-auto inline-flex items-center justify-center px-8 py-3 border border-transparent text-base font-bold rounded-md text-white bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-600 hover:to-yellow-600 disabled:bg-gray-400 transition-all shadow-md"
            >
              {isButtonLoading ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : null}
              Upgrade to Max
            </button>
          )}
        </div>
      </div>
      {error && (
        <div className="text-center mt-8">
          <p className="text-sm text-red-600 font-semibold">{error}</p>
        </div>
      )}
    </div>
  );
};
