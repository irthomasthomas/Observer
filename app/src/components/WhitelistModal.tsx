import React from 'react';
import Modal from '@components/EditAgent/Modal';
import { Phone, MessageCircle, X, Copy, ExternalLink, CheckCircle } from 'lucide-react';

interface WhitelistModalProps {
  phoneNumbers: Array<{
    number: string;
    isWhitelisted: boolean;
  }>;
  onClose: () => void;
  onStartAnyway?: () => void;
  onStartAgent?: () => void;
  getToken: () => Promise<string | undefined>;
}

const WhitelistModal: React.FC<WhitelistModalProps> = ({ phoneNumbers: initialPhoneNumbers, onClose, onStartAnyway, onStartAgent, getToken }) => {
  const OBSERVER_SMS_CALL = '+1 (863) 208-5341';
  const OBSERVER_WHATSAPP = '+1 (555) 783-4727';
  const OBSERVER_WHATSAPP_PLAIN = '15557834727';

  const [copied, setCopied] = React.useState<'sms' | 'whatsapp' | null>(null);
  const [phoneInput, setPhoneInput] = React.useState(() => {
    // Auto-fill with first unwhitelisted number
    const firstUnwhitelisted = initialPhoneNumbers.find(p => !p.isWhitelisted);
    return firstUnwhitelisted?.number || '';
  });
  const [checkResult, setCheckResult] = React.useState<{ is_whitelisted: boolean } | null>(null);
  const [isChecking, setIsChecking] = React.useState(false);

  // Background polling state
  const [phoneNumbers, setPhoneNumbers] = React.useState(initialPhoneNumbers);
  const [pollingStatus, setPollingStatus] = React.useState<'idle' | 'checking' | 'success'>('idle');
  const pollingIntervalRef = React.useRef<number | null>(null);

  const copyToClipboard = (text: string, type: 'sms' | 'whatsapp') => {
    navigator.clipboard.writeText(text);
    setCopied(type);
    setTimeout(() => setCopied(null), 2000);
  };

  const openWhatsApp = () => {
    window.open(`https://wa.me/${OBSERVER_WHATSAPP_PLAIN}`, '_blank');
  };

  const openSMS = () => {
    window.open(`sms:${OBSERVER_SMS_CALL}`, '_blank');
  };

  // Background polling for all phone numbers
  React.useEffect(() => {
    if (!phoneNumbers.length) return;

    const checkAllNumbers = async () => {
      setPollingStatus('checking');

      try {
        const token = await getToken();
        if (!token) {
          console.error('No auth token available for polling');
          setPollingStatus('idle');
          return;
        }

        const checks = await Promise.all(
          phoneNumbers.map(async ({ number }) => {
            try {
              const response = await fetch('https://api.observer-ai.com/tools/is-whitelisted', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${token}`,
                },
                body: JSON.stringify({ phone_number: number }),
              });

              if (!response.ok) {
                return { number, isWhitelisted: false };
              }

              const data = await response.json();
              return { number, isWhitelisted: data.is_whitelisted };
            } catch (error) {
              console.error(`Error checking ${number}:`, error);
              return { number, isWhitelisted: false };
            }
          })
        );

        // Update phone numbers with new status
        setPhoneNumbers(checks);

        // If all whitelisted, stop polling and show success
        if (checks.every(p => p.isWhitelisted)) {
          setPollingStatus('success');
          if (pollingIntervalRef.current) {
            clearInterval(pollingIntervalRef.current);
            pollingIntervalRef.current = null;
          }
        } else {
          setPollingStatus('idle');
        }
      } catch (error) {
        console.error('Polling error:', error);
        setPollingStatus('idle');
      }
    };

    // Initial check
    checkAllNumbers();

    // Start polling interval (5 seconds)
    pollingIntervalRef.current = window.setInterval(checkAllNumbers, 5000);

    // Cleanup on unmount
    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
    };
  }, [phoneNumbers.length, getToken]);

  const checkWhitelistStatus = async () => {
    if (!phoneInput.trim()) return;

    setIsChecking(true);
    setCheckResult(null);

    try {
      // Get auth token
      const token = await getToken();
      if (!token) {
        console.error('No auth token available');
        setCheckResult({ is_whitelisted: false });
        setIsChecking(false);
        return;
      }

      const response = await fetch('https://api.observer-ai.com/tools/is-whitelisted', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ phone_number: phoneInput }),
      });

      if (!response.ok) {
        throw new Error('Failed to check whitelist status');
      }

      const data = await response.json();
      setCheckResult(data);
    } catch (error) {
      console.error('Error checking whitelist:', error);
      // Set a default false result on error
      setCheckResult({ is_whitelisted: false });
    } finally {
      setIsChecking(false);
    }
  };

  return (
    <Modal open={true} onClose={onClose} className="w-full max-w-lg">
      {/* Header */}
      <div className="flex justify-between items-center p-6 border-b border-gray-200 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-t-lg">
        <div className="flex items-center space-x-3">
          <Phone className="h-6 w-6" />
          <div>
            <h2 className="text-xl font-semibold">Whitelist your Phone</h2>
            <p className="text-sm text-blue-100">30-second verification • Valid for 24 hours</p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded-full hover:bg-blue-700 hover:bg-opacity-50 text-blue-100 hover:text-white transition-colors"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Content */}
      <div className="p-6 space-y-3">
        {/* WhatsApp Option - Minimal Horizontal */}
        <div className="flex items-center justify-between p-3 border border-gray-300 rounded-lg hover:border-green-400 transition-colors">
          <div className="flex items-center space-x-3">
            <MessageCircle className="h-5 w-5 text-green-600" />
            <div>
              <p className="font-semibold text-sm text-gray-900">Send WhatsApp Message</p>
              <p className="text-xs font-mono text-gray-600">{OBSERVER_WHATSAPP}</p>
            </div>
          </div>
          <button
            onClick={openWhatsApp}
            className="px-4 py-2 bg-green-600 text-white rounded-md text-sm font-medium hover:bg-green-700 transition-colors flex items-center space-x-1"
          >
            <span>Open</span>
            <ExternalLink className="h-3 w-3" />
          </button>
        </div>

        {/* SMS Option - Minimal Horizontal */}
        <div className="flex items-center justify-between p-3 border border-gray-300 rounded-lg hover:border-blue-400 transition-colors">
          <div className="flex items-center space-x-3">
            <MessageCircle className="h-5 w-5 text-blue-600" />
            <div>
              <p className="font-semibold text-sm text-gray-900">Send Text Message</p>
              <p className="text-xs font-mono text-gray-600">{OBSERVER_SMS_CALL}</p>
            </div>
          </div>
          <button
            onClick={openSMS}
            className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700 transition-colors flex items-center space-x-1"
          >
            <span>Open</span>
            <ExternalLink className="h-3 w-3" />
          </button>
        </div>

        {/* Call Option - Minimal Horizontal */}
        <div className="flex items-center justify-between p-3 border border-gray-300 rounded-lg">
          <div className="flex items-center space-x-3">
            <Phone className="h-5 w-5 text-gray-600" />
            <div>
              <p className="font-semibold text-sm text-gray-900">Or call this number</p>
              <p className="text-xs font-mono text-gray-600">{OBSERVER_SMS_CALL}</p>
            </div>
          </div>
          <button
            onClick={() => copyToClipboard(OBSERVER_SMS_CALL, 'sms')}
            className="px-3 py-2 bg-gray-200 text-gray-700 rounded-md text-sm font-medium hover:bg-gray-300 transition-colors"
            title="Copy number"
          >
            {copied === 'sms' ? (
              <span className="text-xs text-green-600 font-medium">Copied!</span>
            ) : (
              <Copy className="h-4 w-4" />
            )}
          </button>
        </div>

        {/* Numbers List - Now after contact options */}
        {phoneNumbers.length > 0 ? (
          <div className="pt-3 border-t border-gray-200">
            {phoneNumbers.map(({ number, isWhitelisted }) => (
              <div key={number} className="flex items-center space-x-2 text-sm py-1">
                {isWhitelisted ? (
                  <>
                    <span className="text-green-600">✓</span>
                    <span className="text-gray-700">This number is whitelisted: <span className="font-mono">{number}</span></span>
                  </>
                ) : (
                  <>
                    <span className="text-red-600">✗</span>
                    <span className="text-red-700">This number is not whitelisted: <span className="font-mono font-semibold">{number}</span></span>
                  </>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="pt-3 border-t border-gray-200">
            <p className="text-sm text-orange-700">
              ⚠️ Phone tools detected but no phone number found in your code. Make sure dynamic numbers are whitelisted.
            </p>
          </div>
        )}

        {/* Whitelist Checker */}
        <div className="pt-3 border-t border-gray-200">
          <p className="text-sm font-semibold text-gray-900 mb-2">Check if you're whitelisted now:</p>
          <div className="flex items-center space-x-2">
            <input
              type="text"
              value={phoneInput}
              onChange={(e) => {
                setPhoneInput(e.target.value);
                setCheckResult(null); // Clear result when input changes
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') checkWhitelistStatus();
              }}
              placeholder="+15551234567"
              className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <button
              onClick={checkWhitelistStatus}
              disabled={!phoneInput.trim() || isChecking}
              className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed"
            >
              {isChecking ? 'Checking...' : 'Check'}
            </button>
            {checkResult !== null && (
              <div className="flex items-center">
                {checkResult.is_whitelisted ? (
                  <span className="text-green-600 font-medium text-sm flex items-center">
                    ✓ Whitelisted
                  </span>
                ) : (
                  <span className="text-red-600 font-medium text-sm flex items-center">
                    ✗ Not whitelisted 
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        <p className="text-xs text-gray-500 pt-2">
          Whitelisted numbers are valid for 24 hours.
        </p>
      </div>

      {pollingStatus === 'success' && onStartAgent && (
        <div className="px-6 py-4 border-t border-gray-200 bg-green-50">
          <div className="bg-white border-2 border-green-400 rounded-lg p-4">
            <div className="flex items-center space-x-2 text-green-700 mb-3">
              <CheckCircle className="h-6 w-6" />
              <span className="font-semibold text-base">All numbers Whitelisted!</span>
            </div>
            <button
              onClick={() => {
                onStartAgent();
                onClose();
              }}
              className="w-full px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 font-semibold text-lg shadow-lg transition-colors"
            >
              All Ready, start agent
            </button>
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="flex justify-end items-center px-6 py-4 border-t border-gray-200 bg-gray-50 rounded-b-lg space-x-3">
        {pollingStatus === 'success' && onStartAgent ? (
          <button
            onClick={onClose}
            className="px-5 py-2 bg-gray-200 text-gray-700 rounded-md text-sm font-medium hover:bg-gray-300 transition-colors"
          >
            Close
          </button>
        ) : onStartAnyway ? (
          <>
            <button
              onClick={onClose}
              className="px-5 py-2 bg-gray-200 text-gray-700 rounded-md text-sm font-medium hover:bg-gray-300 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={onStartAnyway}
              className="px-5 py-2 border-2 border-orange-500 text-orange-700 rounded-md text-sm font-medium hover:bg-orange-50 transition-colors"
            >
              ⚠️ Start Anyway (Will Fail)
            </button>
          </>
        ) : (
          <button
            onClick={onClose}
            className="px-5 py-2 bg-indigo-600 text-white rounded-md text-sm font-medium hover:bg-indigo-700 transition-colors"
          >
            Got it
          </button>
        )}
      </div>
    </Modal>
  );
};

export default WhitelistModal;
