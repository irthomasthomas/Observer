import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@contexts/AuthContext';
import { Loader2, CheckCircle } from 'lucide-react';

export function UpgradeSuccessPage() {
  const { refreshSession, logout } = useAuth();
  const navigate = useNavigate();

  const [pageStatus, setPageStatus] = useState<'polling' | 'success' | 'timeout'>('polling');
  const [currentTier, setCurrentTier] = useState<string | null>(null);
  const [attempts, setAttempts] = useState(0);

  useEffect(() => {
    const checkUpgrade = async () => {
      const maxAttempts = 15;
      let attemptCount = 0;

      while (attemptCount < maxAttempts) {
        try {
          const token = await refreshSession();

          if (!token) {
            attemptCount++;
            setAttempts(attemptCount);
            if (attemptCount < maxAttempts) {
              await new Promise(resolve => setTimeout(resolve, 2000));
            }
            continue;
          }

          const response = await fetch('https://api.observer-ai.com/quota', {
            headers: { Authorization: `Bearer ${token}` }
          });

          if (response.ok) {
            const data = await response.json();
            if (data.tier && data.tier !== 'free') {
              setCurrentTier(data.tier);
              setPageStatus('success');
              setTimeout(() => navigate('/'), 1500);
              return;
            }
          }
        } catch (error) {
          console.error('UPGRADE_SUCCESS: Polling error on attempt', attemptCount + 1, error);
        }

        attemptCount++;
        setAttempts(attemptCount);

        if (attemptCount < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }

      setPageStatus('timeout');
    };

    checkUpgrade();
  }, [refreshSession, navigate]);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-b from-gray-50 to-gray-100">
      <div className="p-10 bg-white rounded-2xl shadow-lg max-w-md w-full mx-4 text-center">

        {/* Icon */}
        <div className="flex justify-center mb-5">
          {pageStatus === 'polling' && (
            <div className="h-16 w-16 rounded-full bg-blue-50 flex items-center justify-center">
              <Loader2 className="h-8 w-8 text-blue-500 animate-spin" />
            </div>
          )}
          {pageStatus === 'success' && (
            <div className="h-16 w-16 rounded-full bg-green-50 flex items-center justify-center">
              <CheckCircle className="h-8 w-8 text-green-500" />
            </div>
          )}
          {pageStatus === 'timeout' && (
            <div className="h-16 w-16 rounded-full bg-green-50 flex items-center justify-center">
              <CheckCircle className="h-8 w-8 text-green-500" />
            </div>
          )}
        </div>

        {/* Heading */}
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Payment received!</h1>

        {/* Subtext */}
        {pageStatus === 'polling' && (
          <>
            <p className="text-gray-500 text-sm mb-1">
              We're updating your account on our servers.
            </p>
            <p className="text-xs text-gray-400">
              Checking... ({attempts}/{15})
            </p>
          </>
        )}

        {pageStatus === 'success' && (
          <p className="text-green-600 font-medium text-sm">
            {currentTier
              ? `Welcome to Observer ${currentTier.charAt(0).toUpperCase() + currentTier.slice(1)}!`
              : 'Your account has been upgraded!'}
          </p>
        )}

        {pageStatus === 'timeout' && (
          <>
            <p className="text-gray-500 text-sm mb-6">
              We're still updating your account on our servers — this usually
              only takes a moment. Try logging out and back in if it doesn't
              resolve shortly.
            </p>

            <div className="flex gap-3 justify-center">
              <button
                onClick={() => window.location.reload()}
                className="px-5 py-2.5 bg-blue-500 text-white text-sm font-medium rounded-xl hover:bg-blue-600 transition-colors"
              >
                Retry
              </button>
              <button
                onClick={() => logout()}
                className="px-5 py-2.5 bg-gray-100 text-gray-700 text-sm font-medium rounded-xl hover:bg-gray-200 transition-colors"
              >
                Log Out
              </button>
            </div>
          </>
        )}

      </div>
    </div>
  );
}
