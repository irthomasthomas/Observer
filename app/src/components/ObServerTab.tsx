import React, { useState, useEffect } from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import { 
  Loader2, Zap, ExternalLink, AlertTriangle, 
  Check, X, HardDrive, Server, Sparkles, Heart 
} from 'lucide-react';
import { Logger } from '@utils/logging';

// --- No changes to your state or logic ---
export const ObServerTab: React.FC = () => {
  const [status, setStatus] = useState<'loading' | 'pro' | 'free' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [isButtonLoading, setIsButtonLoading] = useState(false);
  
  const { getAccessTokenSilently, isAuthenticated, loginWithRedirect } = useAuth0();

  useEffect(() => {
    if (!isAuthenticated) {
      setStatus('free');
      return;
    }
    
    const checkProStatus = async () => {
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
  }, [isAuthenticated, getAccessTokenSilently]);

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

  // --- RENDER LOGIC: Loading and Error states remain the same ---

  if (status === 'loading') {
    return (
      <div className="flex justify-center items-center p-20">
        <Loader2 className="h-12 w-12 animate-spin text-gray-500" />
      </div>
    );
  }
  
  if (status === 'error') {
      return (
        <div className="max-w-3xl mx-auto p-8 bg-white rounded-lg shadow-md text-center border-l-4 border-red-500">
            <AlertTriangle className="mx-auto h-16 w-16 text-red-500 mb-4" />
            <h1 className="text-3xl font-bold text-gray-800 mb-2">Something Went Wrong</h1>
            <p className="text-gray-600">{error || 'We could not load your subscription details. Please refresh the page.'}</p>
        </div>
      )
  }

  // --- NEW RENDER LOGIC with the comparison table ---
  
  const renderTable = () => (
    <div className="w-full max-w-6xl mx-auto p-4 sm:p-8">
      <div className="text-center mb-12">
        <Zap className="mx-auto h-16 w-16 text-purple-500 mb-4" />
        <h1 className="text-4xl font-bold text-gray-800 tracking-tight mb-2">Choose Your Way to Observe</h1>
        <p className="text-xl text-gray-600 max-w-2xl mx-auto">From total privacy on your machine to the convenience of the cloud, there's a path for you.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-start">
        {/* Column 1: Self-Hosted */}
        <div className="border rounded-lg p-6 flex flex-col h-full bg-white shadow-md">
          <div className="text-center">
            <HardDrive className="mx-auto h-10 w-10 text-gray-500 mb-3" />
            <h2 className="text-2xl font-bold text-gray-800">Self-Hosted</h2>
            <p className="text-gray-500 h-16">For the purists. Maximum privacy & control on your own hardware.</p>
          </div>
          <ul className="space-y-4 my-8 flex-grow">
            <li className="flex items-start"><Check className="h-6 w-6 text-green-500 mr-3 flex-shrink-0" /><span><strong>Cost:</strong> Free (BYOH*)</span></li>
            <li className="flex items-start"><Check className="h-6 w-6 text-green-500 mr-3 flex-shrink-0" /><span><strong>Performance:</strong> As fast as your rig! 🚀</span></li>
            <li className="flex items-start"><Check className="h-6 w-6 text-green-500 mr-3 flex-shrink-0" /><span><strong>Daily Usage:</strong> ∞ Unlimited</span></li>
            <li className="flex items-start"><Check className="h-6 w-6 text-green-500 mr-3 flex-shrink-0" /><span><strong>Cloud Tools:</strong> Yes, via Ob-Server</span></li>
            <li className="flex items-start"><Check className="h-6 w-6 text-green-500 mr-3 flex-shrink-0" /><span><strong>Setup:</strong> Docker-based 🐳</span></li>
            <li className="flex items-start"><X className="h-6 w-6 text-red-500 mr-3 flex-shrink-0" /><span>Premium Cloud Models</span></li>
            <li className="flex items-start"><Heart className="h-6 w-6 text-pink-500 mr-3 flex-shrink-0" /><span><strong>Support:</strong> You're part of the OS community!</span></li>
          </ul>
          <a href="https://github.com/Roy3838/Observer?tab=readme-ov-file#option-1-docker-setup-recommended--easiest" target="_blank" rel="noopener noreferrer" className="w-full text-center mt-auto px-6 py-3 border border-gray-300 text-base font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 transition-colors">
            View Setup Guide
          </a>
        </div>

        {/* Column 2: Observer Cloud (Free Tier) */}
        <div className="border rounded-lg p-6 flex flex-col h-full bg-white shadow-md">
          <div className="text-center">
            <Server className="mx-auto h-10 w-10 text-gray-500 mb-3" />
            <h2 className="text-2xl font-bold text-gray-800">Observer Cloud</h2>
            <p className="text-gray-500 h-16">Get started instantly with our cloud infrastructure. Great for light use.</p>
          </div>
          <ul className="space-y-4 my-8 flex-grow">
            <li className="flex items-start"><Check className="h-6 w-6 text-green-500 mr-3 flex-shrink-0" /><span><strong>Cost:</strong> Free</span></li>
            <li className="flex items-start"><Check className="h-6 w-6 text-green-500 mr-3 flex-shrink-0" /><span><strong>Performance:</strong> Standard Rate-Limits</span></li>
            <li className="flex items-start"><Check className="h-6 w-6 text-green-500 mr-3 flex-shrink-0" /><span><strong>Daily Usage:</strong> 30 Cloud Actions/day</span></li>
            <li className="flex items-start"><Check className="h-6 w-6 text-green-500 mr-3 flex-shrink-0" /><span><strong>Cloud Tools:</strong> Yes</span></li>
            <li className="flex items-start"><Check className="h-6 w-6 text-green-500 mr-3 flex-shrink-0" /><span><strong>Setup:</strong> ✨ Instant</span></li>
            <li className="flex items-start"><X className="h-6 w-6 text-red-500 mr-3 flex-shrink-0" /><span>Premium Cloud Models</span></li>
            <li className="flex items-start"><Heart className="h-6 w-6 text-pink-500 mr-3 flex-shrink-0" /><span><strong>Support:</strong> Helps us gauge interest! 👍</span></li>
          </ul>
          {/* This button is shown for everyone, but its action changes */}
          {status === 'pro' ? (
              <div className="w-full text-center mt-auto px-6 py-3 border border-transparent text-base font-medium rounded-md text-green-700 bg-green-100">
                You have Pro!
              </div>
            ) : (
              <button
                onClick={isAuthenticated ? () => handleApiAction('create-checkout-session') : () => loginWithRedirect()}
                disabled={isButtonLoading}
                className="w-full mt-auto inline-flex items-center justify-center px-8 py-3 border border-transparent text-base font-bold rounded-md text-white bg-purple-600 hover:bg-purple-700 disabled:bg-gray-400 transition-colors"
              >
                 {isButtonLoading && !isAuthenticated ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : null}
                 {isAuthenticated ? 'Upgrade to Pro' : 'Log In to Upgrade'}
              </button>
            )
          }
        </div>

        {/* Column 3: Observer Pro */}
        <div className="relative border-2 border-purple-500 rounded-lg p-6 flex flex-col h-full bg-purple-50 shadow-lg">
          <div className="absolute top-0 -translate-y-1/2 left-1/2 -translate-x-1/2">
            <div className="bg-purple-500 text-white text-xs font-bold uppercase tracking-wider rounded-full px-4 py-1">Recommended</div>
          </div>
          <div className="text-center">
            <Sparkles className="mx-auto h-10 w-10 text-purple-500 mb-3" />
            <h2 className="text-2xl font-bold text-purple-800">Observer Pro</h2>
            <p className="text-purple-700 h-16">The ultimate experience. Unleash the full power and support the project's future.</p>
          </div>
          <ul className="space-y-4 my-8 flex-grow">
            <li className="flex items-start"><Check className="h-6 w-6 text-green-500 mr-3 flex-shrink-0" /><span><strong>Cost:</strong> $9.99/month</span></li>
            <li className="flex items-start"><Check className="h-6 w-6 text-green-500 mr-3 flex-shrink-0" /><span><strong>Performance:</strong> ⚡ Low-Latency Priority</span></li>
            <li className="flex items-start"><Check className="h-6 w-6 text-green-500 mr-3 flex-shrink-0" /><span><strong>Daily Usage:</strong> ∞ Unlimited</span></li>
            <li className="flex items-start"><Check className="h-6 w-6 text-green-500 mr-3 flex-shrink-0" /><span><strong>Cloud Tools:</strong> Yes, Unlimited</span></li>
            <li className="flex items-start"><Check className="h-6 w-6 text-green-500 mr-3 flex-shrink-0" /><span><strong>Setup:</strong> ✨ Instant</span></li>
            <li className="flex items-start"><Check className="h-6 w-6 text-green-500 mr-3 flex-shrink-0" /><span><strong>Premium Cloud Models</strong> <span className='text-xs bg-purple-200 text-purple-700 rounded-full px-2 py-1 ml-1'>Coming Soon</span></span></li>
            <li className="flex items-start"><Heart className="h-6 w-6 text-pink-500 mr-3 flex-shrink-0" /><span><strong>Support:</strong> You keep the lights on! 🙏</span></li>
          </ul>
           {status === 'pro' ? (
              <button
                onClick={() => handleApiAction('create-customer-portal-session')}
                disabled={isButtonLoading}
                className="w-full mt-auto inline-flex items-center justify-center px-6 py-3 border border-transparent text-base font-medium rounded-md text-indigo-700 bg-indigo-100 hover:bg-indigo-200 disabled:bg-gray-300 transition-colors"
              >
                {isButtonLoading ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <ExternalLink className="mr-2 h-4 w-4" />}
                Manage Subscription
              </button>
            ) : (
              <button
                onClick={isAuthenticated ? () => handleApiAction('create-checkout-session') : () => loginWithRedirect()}
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

  return renderTable();
};

export default ObServerTab;
