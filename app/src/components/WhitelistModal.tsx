import React from 'react';
import Modal from '@components/EditAgent/Modal';
import { Phone, MessageCircle, X, Copy, ExternalLink } from 'lucide-react';

interface WhitelistModalProps {
  phoneNumber: string;
  toolName: 'WhatsApp' | 'SMS' | 'Call';
  onClose: () => void;
}

const WhitelistModal: React.FC<WhitelistModalProps> = ({ phoneNumber, toolName, onClose }) => {
  const OBSERVER_SMS_CALL = '+1 (863) 208-5341';
  const OBSERVER_WHATSAPP = '+1 (555) 783-4727';
  const OBSERVER_WHATSAPP_PLAIN = '15557834727';

  const [copied, setCopied] = React.useState<'sms' | 'whatsapp' | null>(null);

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

  return (
    <Modal open={true} onClose={onClose} className="w-full max-w-lg">
      {/* Header */}
      <div className="flex justify-between items-center p-6 border-b border-gray-200 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-t-lg">
        <div className="flex items-center space-x-3">
          <Phone className="h-6 w-6" />
          <div>
            <h2 className="text-xl font-semibold">Verify Your Phone Number</h2>
            <p className="text-sm text-blue-100">Quick one-time setup</p>
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

        <div className="p-3 bg-gray-50 border border-gray-200 rounded-md">
          <p className="text-xs text-gray-600">
            After verification is complete, your number will be whitelisted and you can use {toolName}{' '}
            notifications. This is a one-time setup per phone number.
          </p>
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
