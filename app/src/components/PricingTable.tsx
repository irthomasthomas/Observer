// src/components/PricingTable.tsx

import React from 'react';
import { 
  Loader2, Zap, ExternalLink, Heart, HeartCrack,
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
  // Use smaller sizing for non-modal contexts (like ObServerTab)
  const containerClass = isTriggeredByQuotaError 
    ? "w-full max-w-6xl mx-auto p-4 sm:p-6 md:p-8 bg-white rounded-lg"  // Modal - larger
    : "w-full max-w-4xl mx-auto p-4 sm:p-6 bg-white rounded-lg";         // Tab - smaller
    
  return (
    <div className={containerClass}>
      <div className="flex items-start gap-6 mb-6">
        <div className="flex-shrink-0">
          <Zap className="h-12 w-12 text-purple-500" />
        </div>
        <div className="flex-1">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-800 tracking-tight mb-2">{headline}</h1>
          <p className="text-base sm:text-lg text-gray-600 mb-3">{subheadline}</p>
          <div className="flex items-center space-x-3 text-xs text-gray-500">
            <span>🚀 450+ users</span>
            <span>•</span>
            <span>⭐ 900+ GitHub stars</span>
            <span>•</span>
            <span>⚡ Processing 100k+ captures daily</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6 items-start">
        {/* Column 1: Self-Hosted */}
        <div className="border rounded-lg p-4 flex flex-col h-full bg-gray-50/50 shadow-sm">
          <div className="text-center">
            <HardDrive className="mx-auto h-10 w-10 text-gray-500 mb-3" />
            <h2 className="text-xl font-bold text-gray-800">Build Locally</h2>
            <p className="text-gray-500 min-h-[4rem]">Complete control of your data and infrastructure. Perfect for security-conscious developers.</p>
          </div>
          <ul className="space-y-4 my-8 flex-grow">
            <li className="flex items-start"><Check className="h-6 w-6 text-green-500 mr-3 flex-shrink-0" /><span><strong>Cost:</strong> Free (your hardware)</span></li>
            <li className="flex items-start"><Check className="h-6 w-6 text-green-500 mr-3 flex-shrink-0" /><span><strong>Performance:</strong> As fast as your hardware!</span></li>
            <li className="flex items-start"><Check className="h-6 w-6 text-green-500 mr-3 flex-shrink-0" /><span><strong>Daily Usage:</strong> ∞ Unlimited</span></li>
            <li className="flex items-start"><Check className="h-6 w-6 text-green-500 mr-3 flex-shrink-0" /><span><strong>Privacy:</strong> 100% local</span></li>
            <li className="flex items-start"><Heart className="h-6 w-6 text-pink-500 mr-3 flex-shrink-0" /><span><strong>Support:</strong> Community</span></li>
          </ul>
          <a href="https://github.com/Roy3838/Observer?tab=readme-ov-file#option-1-full-docker-setup-recommended--easiest" target="_blank" rel="noopener noreferrer" className="w-full text-center mt-auto px-6 py-3 border border-gray-300 text-base font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 transition-colors">
            Download & Deploy
          </a>
        </div>

        {/* Column 2: Observer Cloud (Free Tier) - Now with dynamic state */}
        <div className={`relative border rounded-lg p-4 flex flex-col h-full bg-white shadow-md ${isTriggeredByQuotaError ? 'border-gray-400 border-2' : ''}`}>
           {isTriggeredByQuotaError && (
             <div className="absolute top-0 -translate-y-1/2 left-1/2 -translate-x-1/2">
               <div className="bg-gray-500 text-white text-xs font-bold uppercase tracking-wider rounded-full px-6 py-1 whitespace-nowrap">Current</div>
             </div>
           )}
          <div className="text-center">
            <Server className="mx-auto h-10 w-10 text-gray-500 mb-3" />
            <h2 className="text-xl font-bold text-gray-800">Quick Start</h2>
            <p className="text-gray-500 min-h-[4rem]">Get started instantly with cloud hosting. No setup required.</p>
          </div>
          <ul className="space-y-4 my-8 flex-grow">
            <li className="flex items-start"><Check className="h-6 w-6 text-green-500 mr-3 flex-shrink-0" /><span><strong>Cost:</strong> Free</span></li>
            {isTriggeredByQuotaError ? (
                <li className="flex items-start font-semibold text-red-600"><AlertTriangle className="h-6 w-6 text-red-500 mr-3 flex-shrink-0" /><span><strong>Daily Usage:</strong> Limit Reached</span></li>
            ) : (
                <li className="flex items-start"><Check className="h-6 w-6 text-green-500 mr-3 flex-shrink-0" /><span><strong>Daily Usage:</strong> 30 actions/day</span></li>
            )}
            <li className="flex items-start"><Check className="h-6 w-6 text-green-500 mr-3 flex-shrink-0" /><span><strong>Setup:</strong> Start building in 30 seconds</span></li>
            <li className="flex items-start"><HeartCrack className="h-6 w-6 text-red-500 mr-3 flex-shrink-0" /><span><strong>Support:</strong> Limited (solo dev!)</span></li>
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
            <p className="text-purple-700 min-h-[4rem]">Unlimited screen monitoring and notifications. Perfect for power users.</p>
          </div>
          <ul className="space-y-4 my-8 flex-grow">
            <li className="flex items-start"><Check className="h-6 w-6 text-green-500 mr-3 flex-shrink-0" /><span><strong>Cost:</strong> $14.99/month</span></li>
            <li className="flex items-start"><Check className="h-6 w-6 text-green-500 mr-3 flex-shrink-0" /><span><strong>Performance:</strong> ⚡ Low-Latency Priority</span></li>
            <li className="flex items-start"><Check className="h-6 w-6 text-green-500 mr-3 flex-shrink-0" /><span><strong>Daily Usage:</strong> ∞ Unlimited</span></li>
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
                {isAuthenticated ? 'Upgrade to Pro' : 'Start Free Trial'}
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
