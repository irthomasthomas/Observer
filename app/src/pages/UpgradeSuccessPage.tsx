import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth0 } from '@auth0/auth0-react';
import { Loader2 } from 'lucide-react';

export function UpgradeSuccessPage() {
  const { getAccessTokenSilently } = useAuth0();
  const navigate = useNavigate();
  const [status, setStatus] = useState('Verifying your payment...');

  useEffect(() => {
    const finalizeUpgrade = async () => {
      try {
        setStatus('Finalizing your account upgrade...');
        console.log('UPGRADE_SUCCESS: Attempting to get new token, bypassing cache.');
        
        // This is the corrected line!
        // We use cacheMode: 'off' instead of ignoreCache: true
        await getAccessTokenSilently({
          authorizationParams: {
            audience: 'https://api.observer-ai.com', // Good practice to include audience
          },
          cacheMode: 'off',
        });

        console.log('UPGRADE_SUCCESS: New token acquired. Redirecting to dashboard.');
        setStatus('Upgrade complete! Redirecting...');

        setTimeout(() => {
          navigate('/');
        }, 1500);

      } catch (error) {
        console.error('UPGRADE_SUCCESS: Failed to refresh token.', error);
        setStatus('There was an issue finalizing your upgrade. Redirecting you back...');
        setTimeout(() => {
          navigate('/');
        }, 3000);
      }
    };

    finalizeUpgrade();
  }, [getAccessTokenSilently, navigate]);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 text-center">
      <div className="p-8 bg-white rounded-lg shadow-md">
        <h1 className="text-2xl font-bold text-gray-800 mb-4">Thank You for Upgrading!</h1>
        <div className="flex items-center justify-center space-x-3 text-gray-600">
          <Loader2 className="h-6 w-6 animate-spin" />
          <p>{status}</p>
        </div>
      </div>
    </div>
  );
}
