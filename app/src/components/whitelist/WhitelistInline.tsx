// src/components/whitelist/WhitelistInline.tsx
//
// Compact, non-modal whitelist prompt the MCP renders under a `check_whitelist` tool call
// while that gate is BLOCKING (status: 'running'). Collapsed to a pill by default; click to
// expand the QR codes. Purely presentational: the check_whitelist executor does the polling
// and resolves once the number is whitelisted, which unmounts this pill and lets the run
// continue straight to start_agent — no messages, no manual resume.

import React, { useEffect, useState } from 'react';
import { ChevronRight, MessageCircle, Phone, ExternalLink, AlertTriangle, Loader, X, CheckCircle2 } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import type { WhitelistChannel } from '@utils/logging';
import {
  whatsappQRValue,
  smsQRValue,
  openWhatsApp,
  openSMS,
  OBSERVER_WHATSAPP,
  OBSERVER_SMS_CALL,
  useWhitelistPolling,
} from './shared';

interface WhitelistInlineProps {
  phoneNumber: string;
  channel?: WhitelistChannel;
  onCancel?: () => void;
  /**
   * When provided, this pill polls the whitelist API itself and reflects verification live.
   * Leave undefined in the MCP flow, where the `check_whitelist` executor is the sole poller.
   */
  getToken?: () => Promise<string | undefined>;
  /** Fired once the number becomes whitelisted (only when self-polling via getToken). */
  onWhitelisted?: () => void;
}

const QrOption: React.FC<{
  icon: React.ReactNode;
  title: string;
  qrValue: string;
  buttonLabel: string;
  onOpen: () => void;
  contact: string;
}> = ({ icon, title, qrValue, buttonLabel, onOpen, contact }) => (
  <div className="min-w-0 flex-1 border border-purple-200 rounded-md p-2 bg-white">
    <div className="flex items-center gap-1.5 mb-1.5 text-xs font-semibold text-gray-800">
      {icon}<span className="truncate">{title}</span>
    </div>
    <div className="hidden sm:flex justify-center mb-1.5">
      <div className="bg-white p-1.5 rounded border border-gray-200">
        <QRCodeSVG value={qrValue} size={88} level="M" includeMargin={false} />
      </div>
    </div>
    <button
      onClick={onOpen}
      className="w-full px-2 py-1.5 bg-gray-900 text-white rounded text-xs font-medium hover:bg-black transition-colors flex items-center justify-center gap-1.5"
    >
      <span className="truncate">{buttonLabel}</span>
      <ExternalLink className="h-3 w-3 flex-shrink-0" />
    </button>
    <p className="text-[10px] text-gray-500 text-center mt-1.5 font-mono truncate">{contact}</p>
  </div>
);

const NO_TOKEN = async () => undefined;

const WhitelistInline: React.FC<WhitelistInlineProps> = ({ phoneNumber, channel, onCancel, getToken, onWhitelisted }) => {
  const [expanded, setExpanded] = useState(true);

  // Self-poll only when a token provider is supplied (the splash). In the MCP flow getToken is
  // undefined, so `enabled` is false and the executor remains the single source of polling.
  const selfPolling = !!getToken;
  const { allWhitelisted } = useWhitelistPolling(
    [{ number: phoneNumber, isWhitelisted: false }],
    getToken ?? NO_TOKEN,
    channel,
    selfPolling,
  );

  useEffect(() => {
    if (selfPolling && allWhitelisted) onWhitelisted?.();
  }, [selfPolling, allWhitelisted, onWhitelisted]);

  const verified = selfPolling && allWhitelisted;

  const showWhatsApp = channel === 'whatsapp' || channel === undefined;
  const showSms = channel !== 'whatsapp';

  return (
    <div className="mt-2 w-full rounded-lg border border-purple-200 bg-white overflow-hidden shadow-sm">
      {/* Header — icon + two-line title/number so long numbers never force overflow, plus
          icon-only toggle/cancel buttons to keep the row usable at chat-bubble widths. */}
      <div className="flex items-start gap-2 px-3 py-2">
        <button
          onClick={() => setExpanded(e => !e)}
          className="flex-1 min-w-0 flex items-start gap-2 text-left hover:opacity-80 transition-opacity"
        >
          <AlertTriangle className="h-4 w-4 text-purple-600 flex-shrink-0 mt-0.5" />
          <span className="min-w-0">
            <span className="block text-sm font-medium text-gray-900">Verify your number</span>
            <span className="block text-xs font-mono text-gray-500 truncate">{phoneNumber}</span>
          </span>
        </button>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            onClick={() => setExpanded(e => !e)}
            title={expanded ? 'Hide' : 'Show how'}
            className="p-1 rounded text-purple-600 hover:bg-purple-50 transition-colors"
          >
            <ChevronRight className={`h-4 w-4 transition-transform ${expanded ? 'rotate-90' : ''}`} />
          </button>
          {onCancel && (
            <button
              onClick={onCancel}
              title="Cancel — stop if this number looks wrong"
              className="p-1 rounded text-gray-500 hover:bg-gray-100 border border-gray-300 transition-colors"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {expanded && !verified && (
        <div className="px-3 pb-3 pt-1 space-y-2.5 border-t border-gray-200">
          <p className="text-xs text-gray-600">
            Whitelist this number once{channel === 'whatsapp' ? ' sending a WhatsApp' : ' sending an SMS, call, or WhatsApp'}, valid for 24 hours:
          </p>

          <div className="flex gap-2">
            {showWhatsApp && (
              <QrOption
                icon={<MessageCircle className="h-4 w-4 text-green-600 flex-shrink-0" />}
                title="WhatsApp"
                qrValue={whatsappQRValue}
                buttonLabel="Open WhatsApp"
                onOpen={openWhatsApp}
                contact={OBSERVER_WHATSAPP}
              />
            )}
            {showSms && (
              <QrOption
                icon={<Phone className="h-4 w-4 text-blue-600 flex-shrink-0" />}
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

      {/* Footer status. When self-polling, flips to a green "verified" once the number lands. */}
      {verified ? (
        <div className="flex items-center gap-1.5 px-3 pb-2 pt-1 text-[11px] font-medium text-green-600">
          <CheckCircle2 className="h-3.5 w-3.5 flex-shrink-0" />
          <span>Number verified — you're all set.</span>
        </div>
      ) : (
        <div className="flex items-center gap-1.5 px-3 pb-2 text-[11px] text-purple-600">
          <Loader className="h-3 w-3 animate-spin flex-shrink-0" />
          <span>Waiting — continues automatically once you're whitelisted.</span>
        </div>
      )}
    </div>
  );
};

export default WhitelistInline;
