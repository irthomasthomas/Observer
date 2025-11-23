import React from 'react';
import Modal from '@components/EditAgent/Modal';
import { Phone, MessageCircle, X, Copy, ExternalLink } from 'lucide-react';

interface WhitelistModalProps {
  phoneNumber: string;
  toolName: 'WhatsApp' | 'SMS' | 'Call';
  onClose: () => void;
  getToken: () => Promise<string | undefined>;
}

const WhitelistModal: React.FC<WhitelistModalProps> = ({ phoneNumber, toolName, onClose, getToken }) => {
  const OBSERVER_SMS_CALL = '+1 (863) 208-5341';
  const OBSERVER_WHATSAPP = '+1 (555) 783-4727';
  const OBSERVER_WHATSAPP_PLAIN = '15557834727';

  const [copied, setCopied] = React.useState<'sms' | 'whatsapp' | null>(null);
  const [phoneInput, setPhoneInput] = React.useState('');
  const [checkResult, setCheckResult] = React.useState<{ is_whitelisted: boolean } | null>(null);
  const [isChecking, setIsChecking] = React.useState(false);

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
            <h2 className="text-xl font-semibold">Verify Your Phone Number</h2>
            <p className="text-sm text-blue-100">Quick one-time setup for 24 hours</p>
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
        <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <p className="text-sm text-gray-700">
            To use <strong>{toolName}</strong> notifications with{' '}
            <strong className="font-mono text-blue-700">{phoneNumber}</strong>, please verify your
            number by contacting Observer AI:
          </p>
        </div>

        <div className="space-y-3">
          {/* WhatsApp Option */}
          <div className="p-4 bg-white border-2 border-gray-200 rounded-lg hover:border-green-400 transition-colors">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <MessageCircle className="h-5 w-5 text-green-600" />
                <div>
                  <p className="font-semibold text-gray-900">Send a WhatsApp</p>
                  <p className="text-sm font-mono text-gray-600">{OBSERVER_WHATSAPP}</p>
                </div>
              </div>
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => copyToClipboard(OBSERVER_WHATSAPP, 'whatsapp')}
                  className="p-2 rounded-md hover:bg-gray-100 transition-colors text-gray-500 hover:text-gray-700"
                  title="Copy number"
                >
                  {copied === 'whatsapp' ? (
                    <span className="text-xs text-green-600 font-medium">Copied!</span>
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </button>
                <button
                  onClick={openWhatsApp}
                  className="px-3 py-2 bg-green-600 text-white rounded-md text-sm font-medium hover:bg-green-700 transition-colors flex items-center space-x-1"
                >
                  <span>Open WhatsApp</span>
                  <ExternalLink className="h-3 w-3" />
                </button>
              </div>
            </div>
          </div>

          {/* SMS Option */}
          <div className="p-4 bg-white border-2 border-gray-200 rounded-lg hover:border-blue-400 transition-colors">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <MessageCircle className="h-5 w-5 text-blue-600" />
                <div>
                  <p className="font-semibold text-gray-900">Send an SMS</p>
                  <p className="text-sm font-mono text-gray-600">{OBSERVER_SMS_CALL}</p>
                </div>
              </div>
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => copyToClipboard(OBSERVER_SMS_CALL, 'sms')}
                  className="p-2 rounded-md hover:bg-gray-100 transition-colors text-gray-500 hover:text-gray-700"
                  title="Copy number"
                >
                  {copied === 'sms' ? (
                    <span className="text-xs text-green-600 font-medium">Copied!</span>
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </button>
                <button
                  onClick={openSMS}
                  className="px-3 py-2 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700 transition-colors flex items-center space-x-1"
                >
                  <span>Open Messages</span>
                  <ExternalLink className="h-3 w-3" />
                </button>
              </div>
            </div>
          </div>

          {/* Call Option */}
          <div className="p-4 bg-white border-2 border-gray-200 rounded-lg hover:border-indigo-400 transition-colors">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <Phone className="h-5 w-5 text-indigo-600" />
                <div>
                  <p className="font-semibold text-gray-900">Or call</p>
                  <p className="text-sm font-mono text-gray-600">{OBSERVER_SMS_CALL}</p>
                </div>
              </div>
              <button
                onClick={() => copyToClipboard(OBSERVER_SMS_CALL, 'sms')}
                className="p-2 rounded-md hover:bg-gray-100 transition-colors text-gray-500 hover:text-gray-700"
                title="Copy number"
              >
                {copied === 'sms' ? (
                  <span className="text-xs text-green-600 font-medium">Copied!</span>
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Whitelist Checker */}
        <div className="pt-4 border-t border-gray-200">
          <p className="text-sm font-semibold text-gray-900 mb-2">Check Whitelist Status</p>
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

        <div className="p-3 bg-gray-50 border border-gray-200 rounded-md">
          <p className="text-xs text-gray-600">
            After verification is complete, your number will be whitelisted for 24 hours so you can use {toolName}{' '}
            and all other phone number notifications.          </p>
        </div>
      </div>

      {/* Footer */}
      <div className="flex justify-end items-center px-6 py-4 border-t border-gray-200 bg-gray-50 rounded-b-lg">
        <button
          onClick={onClose}
          className="px-5 py-2 bg-indigo-600 text-white rounded-md text-sm font-medium hover:bg-indigo-700 transition-colors"
        >
          Got it
        </button>
      </div>
    </Modal>
  );
};

export default WhitelistModal;
