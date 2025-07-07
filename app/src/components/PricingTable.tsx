// src/components/PricingTable.tsx

import React from 'react';
import { 
  Loader2, Zap, ExternalLink, Heart,
  Check, X, HardDrive, Server, Sparkles, AlertTriangle
} from 'lucide-react';

// Define the props this component will accept
interface PricingTableProps {
  headline: string;
  subheadline: string;
  status: 'loading' | 'pro' | 'free' | 'error';
  isButtonLoading: boolean;
  isAuthenticated: boolean;
  error: string | null;
  onCheckout: () => void;
  onManageSubscription: () => void;
  onLogin: () => void;
  isTriggeredByQuotaError?: boolean; // Optional prop for special styling
}

export const PricingTable: React.FC<PricingTableProps> = ({
  headline,
  subheadline,
  status,
  isButtonLoading,
  isAuthenticated,
  error,
  onCheckout,
  onManageSubscription,
  onLogin,
  isTriggeredByQuotaError = false,
}) => {
  return (
    <div className="w-full max-w-6xl mx-auto p-4 sm:p-6 md:p-8 bg-white rounded-lg">
      <div className="text-center mb-12">
        <Zap className="mx-auto h-12 w-12 sm:h-16 sm:w-16 text-purple-500 mb-4" />
        <h1 className="text-3xl sm:text-4xl font-bold text-gray-800 tracking-tight mb-2">{headline}</h1>
        <p className="text-lg sm:text-xl text-gray-600 max-w-2xl mx-auto">{subheadline}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8 items-start">
        {/* Column 1: Self-Hosted */}
        <div className="border rounded-lg p-6 flex flex-col h-full bg-gray-50/50 shadow-sm">
          <div className="text-center">
            <HardDrive className="mx-auto h-10 w-10 text-gray-500 mb-3" />
            <h2 className="text-2xl font-bold text-gray-800">Self-Hosted</h2>
            <p className="text-gray-500 min-h-[4rem]">Maximum privacy & control on your own hardware.</p>
          </div>
          <ul className="space-y-4 my-8 flex-grow">
            <li className="flex items-start"><Check className="h-6 w-6 text-green-500 mr-3 flex-shrink-0" /><span><strong>Cost:</strong> Free (BYOH*)</span></li>
            <li className="flex items-start"><Check className="h-6 w-6 text-green-500 mr-3 flex-shrink-0" /><span><strong>Performance:</strong> As fast as your rig! 🚀</span></li>
            <li className="flex items-start"><Check className="h-6 w-6 text-green-500 mr-3 flex-shrink-0" /><span><strong>Daily Usage:</strong> ∞ Unlimited</span></li>
            <li className="flex items-start"><X className="h-6 w-6 text-red-500 mr-3 flex-shrink-0" /><span>Premium Cloud Models</span></li>
            <li className="flex items-start"><Heart className="h-6 w-6 text-pink-500 mr-3 flex-shrink-0" /><span><strong>Support:</strong> OS Community</span></li>
          </ul>
          <a href="https://github.com/Roy3838/Observer?tab=readme-ov-file#option-1-full-docker-setup-recommended--easiest" target="_blank" rel="noopener noreferrer" className="w-full text-center mt-auto px-6 py-3 border border-gray-300 text-base font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 transition-colors">
            View Setup Guide
          </a>
        </div>

        {/* Column 2: Observer Cloud (Free Tier) - Now with dynamic state */}
        <div className={`border rounded-lg p-6 flex flex-col h-full bg-white shadow-md ${isTriggeredByQuotaError ? 'border-amber-400 border-2' : ''}`}>
           {isTriggeredByQuotaError && <div className="text-center font-bold text-amber-600 mb-2">Your Current Plan</div>}
          <div className="text-center">
            <Server className="mx-auto h-10 w-10 text-gray-500 mb-3" />
            <h2 className="text-2xl font-bold text-gray-800">Observer Cloud</h2>
            <p className="text-gray-500 min-h-[4rem]">Get started instantly with our cloud infrastructure. Great for light use.</p>
          </div>
          <ul className="space-y-4 my-8 flex-grow">
            <li className="flex items-start"><Check className="h-6 w-6 text-green-500 mr-3 flex-shrink-0" /><span><strong>Cost:</strong> Free</span></li>
            {isTriggeredByQuotaError ? (
                <li className="flex items-start font-semibold text-red-600"><AlertTriangle className="h-6 w-6 text-red-500 mr-3 flex-shrink-0" /><span><strong>Daily Usage:</strong> Limit Reached</span></li>
            ) : (
                <li className="flex items-start"><Check className="h-6 w-6 text-green-500 mr-3 flex-shrink-0" /><span><strong>Daily Usage:</strong> 30 Cloud Actions/day</span></li>
            )}
            <li className="flex items-start"><X className="h-6 w-6 text-red-500 mr-3 flex-shrink-0" /><span>Premium Cloud Models</span></li>
            <li className="flex items-start"><Heart className="h-6 w-6 text-pink-500 mr-3 flex-shrink-0" /><span><strong>Support:</strong> Community</span></li>
          </ul>
           <div className="mt-auto h-12"></div> {/* Spacer to align buttons */}
        </div>

        {/* Column 3: Observer Pro */}
        <div className="relative border-2 border-purple-500 rounded-lg p-6 flex flex-col h-full bg-purple-50 shadow-lg">
          <div className="absolute top-0 -translate-y-1/2 left-1/2 -translate-x-1/2">
            <div className="bg-purple-500 text-white text-xs font-bold uppercase tracking-wider rounded-full px-4 py-1">Recommended</div>
          </div>
          <div className="text-center">
            <Sparkles className="mx-auto h-10 w-10 text-purple-500 mb-3" />
            <h2 className="text-2xl font-bold text-purple-800">Observer Pro</h2>
            <p className="text-purple-700 min-h-[4rem]">The ultimate experience. Unleash the full power and support the project's future.</p>
          </div>
          <ul className="space-y-4 my-8 flex-grow">
            <li className="flex items-start"><Check className="h-6 w-6 text-green-500 mr-3 flex-shrink-0" /><span><strong>Cost:</strong> $9.99/month</span></li>
            <li className="flex items-start"><Check className="h-6 w-6 text-green-500 mr-3 flex-shrink-0" /><span><strong>Performance:</strong> ⚡ Low-Latency Priority</span></li>
            <li className="flex items-start"><Check className="h-6 w-6 text-green-500 mr-3 flex-shrink-0" /><span><strong>Daily Usage:</strong> ∞ Unlimited</span></li>
            <li className="flex items-start"><Check className="h-6 w-6 text-green-500 mr-3 flex-shrink-0" /><span><strong>Premium Cloud Models</strong> <span className='text-xs bg-purple-200 text-purple-700 rounded-full px-2 py-1 ml-1'>Coming Soon</span></span></li>
            <li className="flex items-start"><Heart className="h-6 w-6 text-pink-500 mr-3 flex-shrink-0" /><span><strong>Support:</strong> You keep the lights on! 🙏</span></li>
          </ul>
           {status === 'pro' ? (
              <button
                onClick={onManageSubscription}
                disabled={isButtonLoading}
                className="w-full mt-auto inline-flex items-center justify-center px-6 py-3 border border-transparent text-base font-medium rounded-md text-indigo-700 bg-indigo-100 hover:bg-indigo-200 disabled:bg-gray-300 transition-colors"
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
                {isAuthenticated ? 'Upgrade to Pro' : 'Log In to Upgrade'}
              </button>
            )}
        </div>
      </div>
      <div className="text-center mt-8 text-sm text-gray-500">
        <p>*BYOH: Bring Your Own Hardware. The self-hosted option is free software, but requires your own computer to run.</p>
        {error && <p className="mt-4 text-sm text-red-600 font-semibold">{error}</p>}
      </div>
    </div>
  );
};
