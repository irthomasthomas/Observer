// Shared by the ask_user_info modal and Settings: channel toggle, QR, copyable code, open-app button.
import React, { useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Phone, Check, Copy } from 'lucide-react';
import { FaWhatsapp } from 'react-icons/fa';
import { whatsappCodeQRValue, smsCodeQRValue, openWhatsApp, openSMS } from './shared';

const WhitelistQR: React.FC<{ code: string; channel?: 'sms' | 'voice' | 'whatsapp' }> = ({ code, channel }) => {
  const [copied, setCopied] = useState(false);
  const showSms = channel !== 'whatsapp' && channel !== 'sms';
  const [qrChannel, setQrChannel] = useState<'whatsapp' | 'sms'>(channel === 'sms' ? 'sms' : 'whatsapp');
  useEffect(() => {
    if (channel === 'sms' || channel === 'whatsapp') setQrChannel(channel);
  }, [channel]);
  const isWhatsApp = qrChannel === 'whatsapp';

  const copyCode = () => {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <div className="flex flex-col items-center gap-4">
    {showSms && (
      <div className="inline-flex items-center gap-1 p-1 rounded-full bg-gray-100 border border-gray-200">
        <button
          onClick={() => setQrChannel('whatsapp')}
          className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-colors ${
            isWhatsApp ? 'bg-[#25D366] text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <FaWhatsapp className="h-3.5 w-3.5" /> WhatsApp
        </button>
        <button
          onClick={() => setQrChannel('sms')}
          className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-colors ${
            !isWhatsApp ? 'bg-gray-900 text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <Phone className="h-3.5 w-3.5" /> SMS
        </button>
      </div>
    )}

    <div className={`relative bg-white p-3 rounded-xl border shadow-sm ${isWhatsApp ? 'border-[#25D366]/30' : 'border-gray-200'}`}>
      <QRCodeSVG
        value={isWhatsApp ? whatsappCodeQRValue(code) : smsCodeQRValue(code)}
        size={168}
        level="H"
        includeMargin={false}
        fgColor="#111827"
      />
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div
          className={`flex items-center justify-center h-11 w-11 rounded-full ring-4 ring-white ${
            isWhatsApp ? 'bg-[#25D366]' : 'bg-gray-900'
          }`}
        >
          {isWhatsApp ? <FaWhatsapp className="h-6 w-6 text-white" /> : <Phone className="h-5 w-5 text-white" />}
        </div>
      </div>
    </div>

    <button
      onClick={copyCode}
      className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md bg-gray-50 border border-gray-200 hover:bg-gray-100 transition-colors"
      title="Copy code"
    >
      <span className="font-mono text-sm font-semibold text-gray-900">{code}</span>
      {copied ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5 text-gray-400" />}
    </button>

    <p className="text-xs text-gray-500 text-center max-w-xs">
      Scan the QR with your phone, or send that code to Observer yourself via {isWhatsApp ? 'WhatsApp' : 'SMS'}.
    </p>

    <button
      onClick={isWhatsApp ? openWhatsApp : openSMS}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
        isWhatsApp ? 'bg-[#25D366] text-white hover:bg-[#1ebe57]' : 'bg-gray-900 text-white hover:bg-black'
      }`}
    >
      {isWhatsApp ? <FaWhatsapp className="h-3.5 w-3.5" /> : <Phone className="h-3.5 w-3.5" />}
      Open {isWhatsApp ? 'WhatsApp' : 'SMS'}
    </button>
    </div>
  );
};

export default WhitelistQR;
