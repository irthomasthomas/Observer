import React from 'react';
import Modal from '@components/EditAgent/Modal';
import { Phone, MessageCircle, X, Copy, ExternalLink, CheckCircle } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import type { WhitelistChannel } from '@utils/logging';

interface WhitelistModalProps {
  phoneNumbers: Array<{
    number: string;
    isWhitelisted: boolean;
  }>;
  onClose: () => void;
  onStartAnyway?: () => void;
  onStartAgent?: () => void;
  getToken: () => Promise<string | undefined>;
  channel?: WhitelistChannel; // 'whatsapp' | 'sms' | 'voice'
}

const WhitelistModal: React.FC<WhitelistModalProps> = ({ phoneNumbers: initialPhoneNumbers, onClose, onStartAnyway, onStartAgent, getToken, channel }) => {
  const OBSERVER_SMS_CALL = '+1 (863) 208-5341';
  const OBSERVER_WHATSAPP = '+1 (555) 783-4727';
  const OBSERVER_WHATSAPP_PLAIN = '15557834727';
  const OBSERVER_SMS_PLAIN = '18632085341';

  // QR code values
  const whatsappQRValue = `https://wa.me/${OBSERVER_WHATSAPP_PLAIN}?text=${encodeURIComponent("Hi! I'd like to whitelist my phone number for Observer")}`;
  // Use +1 prefix for SMS to ensure proper international number formatting
  const smsQRValue = `sms:+${OBSERVER_SMS_PLAIN}?&body=${encodeURIComponent("Hi! I'd like to whitelist my phone number for Observer")}`;

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
                body: JSON.stringify({
                  phone_number: number,
                  ...(channel === 'whatsapp' ? { channel: 'whatsapp' } : {})
                }),
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
        body: JSON.stringify({
          phone_number: phoneInput,
          ...(channel === 'whatsapp' ? { channel: 'whatsapp' } : {})
        }),
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
    <Modal open={true} onClose={onClose} className="w-full max-w-lg md:max-w-2xl">
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
      <div className="p-6 space-y-4">
        {/* Success State - Clean and Minimal */}
        {pollingStatus === 'success' && onStartAgent ? (
          <div className="py-8">
            <div className="text-center mb-6">
              <div className="inline-flex items-center justify-center w-16 h-16 bg-green-100 rounded-full mb-4">
                <CheckCircle className="h-8 w-8 text-green-600" />
              </div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">All Set!</h2>
              <p className="text-gray-600">Your phone number is whitelisted and ready to go.</p>
            </div>
            <button
              onClick={() => {
                onStartAgent();
                onClose();
              }}
              className="w-full px-6 py-4 bg-green-600 text-white rounded-lg hover:bg-green-700 font-semibold text-lg shadow-lg transition-colors"
            >
              Start Agent
            </button>
            <p className="text-xs text-gray-500 text-center mt-3">
              Whitelisted numbers are valid for 24 hours.
            </p>
          </div>
        ) : (
          <>
            {/* Verification State - Full UI */}
            {/* Title */}
            <div className="text-center">
              <h2 className="text-xl font-semibold text-gray-900 mb-1">You need to whitelist your phone!</h2>
              <p className="text-sm text-gray-600">
                {channel === 'whatsapp'
                  ? 'Send a WhatsApp message to get started:'
                  : 'Use any of these two options:'}
              </p>
            </div>

            {/* Two Main Options - Conditional Grid */}
            <div className={`grid gap-4 ${
              channel === 'whatsapp'
                ? 'grid-cols-1'
                : 'grid-cols-1 md:grid-cols-2'
            }`}>

              {/* WhatsApp Option - always show */}
              <div className="border border-gray-200 rounded-lg p-4 hover:border-green-400 transition-colors">
                <div className="flex items-center space-x-2 mb-3">
                  <MessageCircle className="h-5 w-5 text-green-600" />
                  <h3 className="font-semibold text-gray-900">Send a WhatsApp</h3>
                </div>

                {/* QR Code - Hidden on mobile */}
                <div className="hidden md:flex justify-center mb-3">
                  <div className="bg-white p-2 rounded border border-gray-200">
                    <QRCodeSVG
                      value={whatsappQRValue}
                      size={140}
                      level="M"
                      includeMargin={false}
                    />
                  </div>
                </div>

                {/* Action Button */}
                <button
                  onClick={openWhatsApp}
                  className="w-full px-4 py-2.5 bg-green-600 text-white rounded-md text-sm font-medium hover:bg-green-700 transition-colors flex items-center justify-center space-x-2"
                >
                  <span>Open WhatsApp</span>
                  <ExternalLink className="h-4 w-4" />
                </button>

                <p className="text-xs text-gray-500 text-center mt-2">{OBSERVER_WHATSAPP}</p>
              </div>

              {/* SMS/Call Option - hide only when WhatsApp-only */}
              {channel !== 'whatsapp' && (
              <div className="border border-gray-200 rounded-lg p-4 hover:border-blue-400 transition-colors">
                <div className="flex items-center space-x-2 mb-3">
                  <Phone className="h-5 w-5 text-blue-600" />
                  <h3 className="font-semibold text-gray-900">SMS or Call this number</h3>
                </div>

                {/* QR Code - Hidden on mobile */}
                <div className="hidden md:flex justify-center mb-3">
                  <div className="bg-white p-2 rounded border border-gray-200">
                    <QRCodeSVG
                      value={smsQRValue}
                      size={140}
                      level="M"
                      includeMargin={false}
                    />
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="space-y-2">
                  <button
                    onClick={openSMS}
                    className="w-full px-4 py-2.5 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700 transition-colors flex items-center justify-center space-x-2"
                  >
                    <span>Send SMS</span>
                    <ExternalLink className="h-4 w-4" />
                  </button>

                  <button
                    onClick={() => copyToClipboard(OBSERVER_SMS_CALL, 'sms')}
                    className="w-full px-4 py-2 bg-gray-100 text-gray-700 rounded-md text-sm font-medium hover:bg-gray-200 transition-colors flex items-center justify-center space-x-2"
                  >
                    {copied === 'sms' ? (
                      <>
                        <CheckCircle className="h-4 w-4 text-green-600" />
                        <span className="text-green-600">Copied!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="h-4 w-4" />
                        <span>Copy Number</span>
                      </>
                    )}
                  </button>
                </div>

                <p className="text-xs text-gray-500 text-center mt-2">{OBSERVER_SMS_CALL}</p>
              </div>
              )}
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
          </>
        )}
      </div>

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
