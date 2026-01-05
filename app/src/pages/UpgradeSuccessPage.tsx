import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth0 } from '@auth0/auth0-react';
import { Loader2, CheckCircle, AlertCircle } from 'lucide-react';

export function UpgradeSuccessPage() {
  const { getAccessTokenSilently } = useAuth0();
  const navigate = useNavigate();

  // State management for polling flow
  const [pageStatus, setPageStatus] = useState<'polling' | 'success' | 'timeout'>('polling');
  const [statusMessage, setStatusMessage] = useState('Verifying your upgrade...');
  const [currentTier, setCurrentTier] = useState<string | null>(null);
  const [attempts, setAttempts] = useState(0);

  useEffect(() => {
    const checkUpgrade = async () => {
      const maxAttempts = 15; // 15 attempts * 2 seconds = 30 seconds total
      let attemptCount = 0;

      while (attemptCount < maxAttempts) {
        try {
          console.log(`UPGRADE_SUCCESS: Polling attempt ${attemptCount + 1}/${maxAttempts}`);

          // Force fresh token on each attempt
          await getAccessTokenSilently({
            authorizationParams: {
              audience: 'https://api.observer-ai.com',
            },
            cacheMode: 'off',
          });

          // Check quota endpoint to see if upgrade is reflected
          const token = await getAccessTokenSilently();
          const response = await fetch('https://api.observer-ai.com/quota', {
            headers: {
              Authorization: `Bearer ${token}`
            }
          });

          if (response.ok) {
            const data = await response.json();
            console.log('UPGRADE_SUCCESS: Quota data received:', data);

            // If tier is updated (not free), we're done!
            if (data.tier && data.tier !== 'free') {
              console.log('UPGRADE_SUCCESS: Upgrade confirmed! New tier:', data.tier);
              setCurrentTier(data.tier);
              setPageStatus('success');
              setStatusMessage('Upgrade confirmed! Redirecting...');

              // Redirect after showing success for 1.5 seconds
              setTimeout(() => {
                navigate('/');
              }, 1500);

              return; // Exit polling loop
            }
          }
        } catch (error) {
          console.error('UPGRADE_SUCCESS: Polling error on attempt', attemptCount + 1, error);
          // Continue polling even on errors
        }

        // Update attempt counter for UI
        attemptCount++;
        setAttempts(attemptCount);

        // Wait 2 seconds before next attempt (unless this was the last attempt)
        if (attemptCount < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }

      // Timeout - no tier change detected after 30 seconds
      console.log('UPGRADE_SUCCESS: Polling timeout - upgrade not detected');
      setPageStatus('timeout');
      setStatusMessage('Having trouble confirming your upgrade...');
    };

    checkUpgrade();
  }, [getAccessTokenSilently, navigate]);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 text-center">
      <div className="p-8 bg-white rounded-lg shadow-md max-w-2xl w-full mx-4">
        <h1 className="text-2xl font-bold text-gray-800 mb-6">Thank You for Upgrading!</h1>

        {/* Polling State */}
        {pageStatus === 'polling' && (
          <div className="flex flex-col items-center space-y-4">
            <div className="flex items-center justify-center space-x-3 text-gray-600">
              <Loader2 className="h-6 w-6 animate-spin" />
              <div className="text-left">
                <p className="font-medium">{statusMessage}</p>
                <p className="text-xs text-gray-500 mt-1">
                  Attempt {attempts} of {15}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Success State */}
        {pageStatus === 'success' && (
          <div className="flex flex-col items-center space-y-4">
            <CheckCircle className="h-16 w-16 text-green-500" />
            <div className="text-center">
              <p className="text-xl font-semibold text-green-600">{statusMessage}</p>
              {currentTier && (
                <p className="text-sm text-gray-600 mt-2">
                  Welcome to Observer {currentTier.charAt(0).toUpperCase() + currentTier.slice(1)}!
                </p>
              )}
            </div>
          </div>
        )}

        {/* Timeout State */}
        {pageStatus === 'timeout' && (
          <div className="flex flex-col items-center space-y-4">
            <AlertCircle className="h-16 w-16 text-orange-500" />
            <div className="text-center max-w-md">
              <p className="text-xl font-semibold text-gray-800 mb-3">
                Having trouble confirming your upgrade
              </p>
              <p className="text-sm text-gray-600 mb-4">
                Your payment was processed successfully, but we're still updating your account.
                This usually takes just a few moments.
              </p>

              <div className="mt-4 p-4 bg-gray-50 rounded-lg text-left text-sm">
                <p className="font-medium mb-2 text-gray-800">What to do next:</p>
                <ul className="list-disc ml-5 space-y-1.5 text-gray-700">
                  <li>Wait 1-2 minutes and refresh this page</li>
                  <li>Log out and log back in to refresh your session</li>
                  <li>If your subscription is still not updated after a few minutes, please contact support</li>
                </ul>
              </div>

              <div className="mt-6 flex gap-3 justify-center">
                <button
                  onClick={() => window.location.reload()}
                  className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors font-medium"
                >
                  Retry Now
                </button>
                <button
                  onClick={() => navigate('/')}
                  className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors font-medium"
                >
                  Go to Dashboard
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
