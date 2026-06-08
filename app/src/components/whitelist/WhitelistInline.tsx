// src/components/whitelist/WhitelistInline.tsx
//
// Compact, non-modal whitelist prompt the MCP renders under a `check_whitelist` tool call
// while that gate is BLOCKING (status: 'running'). Collapsed to a pill by default; click to
// expand the QR codes. Purely presentational: the check_whitelist executor does the polling
// and resolves once the number is whitelisted, which unmounts this pill and lets the run
// continue straight to start_agent — no messages, no manual resume.

import React, { useState } from 'react';
import { ChevronRight, MessageCircle, Phone, ExternalLink, AlertTriangle, Loader, X } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import type { WhitelistChannel } from '@utils/logging';
import {
  whatsappQRValue,
  smsQRValue,
  openWhatsApp,
  openSMS,
  OBSERVER_WHATSAPP,
  OBSERVER_SMS_CALL,
} from './shared';

interface WhitelistInlineProps {
  phoneNumber: string;
  channel?: WhitelistChannel;
  onCancel?: () => void;
}

const QrOption: React.FC<{
  icon: React.ReactNode;
  title: string;
  qrValue: string;
  buttonLabel: string;
  onOpen: () => void;
  contact: string;
}> = ({ icon, title, qrValue, buttonLabel, onOpen, contact }) => (
  <div className="flex-1 border border-gray-200 rounded-md p-2.5 bg-white">
    <div className="flex items-center gap-1.5 mb-2 text-xs font-semibold text-gray-800">
      {icon}<span>{title}</span>
    </div>
    <div className="hidden sm:flex justify-center mb-2">
      <div className="bg-white p-1.5 rounded border border-gray-200">
        <QRCodeSVG value={qrValue} size={96} level="M" includeMargin={false} />
      </div>
    </div>
    <button
      onClick={onOpen}
      className="w-full px-2 py-1.5 bg-gray-900 text-white rounded text-xs font-medium hover:bg-black transition-colors flex items-center justify-center gap-1.5"
    >
      <span>{buttonLabel}</span>
      <ExternalLink className="h-3 w-3" />
    </button>
    <p className="text-[10px] text-gray-500 text-center mt-1.5 font-mono">{contact}</p>
  </div>
);

const WhitelistInline: React.FC<WhitelistInlineProps> = ({ phoneNumber, channel, onCancel }) => {
  const [expanded, setExpanded] = useState(true);

  const showWhatsApp = channel === 'whatsapp' || channel === undefined;
  const showSms = channel !== 'whatsapp';

  return (
    <div className="mt-2 w-full max-w-md rounded-lg border border-amber-200 bg-amber-50 overflow-hidden">
      {/* Collapsed pill — click to expand */}
      <div className="flex items-center gap-2 px-3 py-2">
        <button
          onClick={() => setExpanded(e => !e)}
          className="flex-1 flex items-center gap-2 text-sm text-amber-900 hover:opacity-80 transition-opacity text-left"
        >
          <AlertTriangle className="h-4 w-4 text-amber-600 flex-shrink-0" />
          <span className="flex-1 font-medium">
            Checking your number: <span className="font-mono">{phoneNumber}</span>
          </span>
          <span className="text-xs text-amber-700 flex items-center gap-0.5">
            {expanded ? 'Hide' : 'Show how'}
            <ChevronRight className={`h-3.5 w-3.5 transition-transform ${expanded ? 'rotate-90' : ''}`} />
          </span>
        </button>
        {onCancel && (
          <button
            onClick={onCancel}
            title="Cancel — stop if this number looks wrong"
            className="flex items-center gap-1 px-2 py-1 rounded text-xs text-amber-800 bg-amber-100 hover:bg-amber-200 border border-amber-300 transition-colors flex-shrink-0"
          >
            <X className="h-3 w-3" />
            Cancel
          </button>
        )}
      </div>

      {expanded && (
        <div className="px-3 pb-3 pt-1 space-y-2.5 border-t border-amber-200/70">
          <p className="text-xs text-amber-800">
            Whitelist this number once{channel === 'whatsapp' ? ' via WhatsApp' : ' (SMS, call, or WhatsApp)'} — valid for 24 hours:
          </p>

          <div className="flex gap-2">
            {showWhatsApp && (
              <QrOption
                icon={<MessageCircle className="h-4 w-4 text-green-600" />}
                title="WhatsApp"
                qrValue={whatsappQRValue}
                buttonLabel="Open WhatsApp"
                onOpen={openWhatsApp}
                contact={OBSERVER_WHATSAPP}
              />
            )}
            {showSms && (
              <QrOption
                icon={<Phone className="h-4 w-4 text-blue-600" />}
                title="SMS or Call"
                qrValue={smsQRValue}
                buttonLabel="Send SMS"
                onOpen={openSMS}
                contact={OBSERVER_SMS_CALL}
              />
            )}
          </div>
        </div>
      )}

      {/* Always-visible waiting hint — this pill disappears on its own once whitelisted. */}
      <div className="flex items-center gap-1.5 px-3 pb-2 text-[11px] text-amber-700">
        <Loader className="h-3 w-3 animate-spin flex-shrink-0" />
        <span>Waiting — continues automatically once you're whitelisted.</span>
      </div>
    </div>
  );
};

export default WhitelistInline;
