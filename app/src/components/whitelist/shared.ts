// src/components/whitelist/shared.ts
//
// Single source of truth for the Observer whitelist contact numbers, the QR-code
// payloads, and the background polling loop. Shared by the full WhitelistModal and the
// compact inline chip the MCP renders under a `check_whitelist` tool call, so the two
// surfaces can never drift apart.

import { useEffect, useRef, useState } from 'react';
import type { WhitelistChannel } from '@utils/logging';

export const OBSERVER_SMS_CALL = '+1 (863) 208-5341';
export const OBSERVER_WHATSAPP = '+1 (555) 783-4727';
export const OBSERVER_WHATSAPP_PLAIN = '15557834727';
export const OBSERVER_SMS_PLAIN = '18632085341';

const WHITELIST_GREETING = "Hi! I'd like to whitelist my phone number for Observer";

export const whatsappQRValue = `https://wa.me/${OBSERVER_WHATSAPP_PLAIN}?text=${encodeURIComponent(WHITELIST_GREETING)}`;
// Use +1 prefix for SMS to ensure proper international number formatting.
export const smsQRValue = `sms:+${OBSERVER_SMS_PLAIN}?&body=${encodeURIComponent(WHITELIST_GREETING)}`;

export const openWhatsApp = () => window.open(`https://wa.me/${OBSERVER_WHATSAPP_PLAIN}`, '_blank');
export const openSMS = () => window.open(`sms:${OBSERVER_SMS_CALL}`, '_blank');

export interface PhoneEntry {
  number: string;
  isWhitelisted: boolean;
}

export type WhitelistPollStatus = 'idle' | 'checking' | 'success';

/** Check a single number against the whitelist API; resolves false on any failure. */
async function checkNumber(
  number: string,
  token: string,
  channel?: WhitelistChannel,
): Promise<PhoneEntry> {
  try {
    const response = await fetch('https://api.observer-ai.com/tools/is-whitelisted', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        phone_number: number,
        ...(channel === 'whatsapp' ? { channel: 'whatsapp' } : {}),
      }),
    });
    if (!response.ok) return { number, isWhitelisted: false };
    const data = await response.json();
    return { number, isWhitelisted: data.is_whitelisted };
  } catch (error) {
    console.error(`Error checking whitelist for ${number}:`, error);
    return { number, isWhitelisted: false };
  }
}

/**
 * Polls every number against the whitelist API on a 5s loop until all are whitelisted,
 * then stops. Returns the live statuses plus an aggregate flag the UI flips to green on.
 */
export function useWhitelistPolling(
  initial: PhoneEntry[],
  getToken: () => Promise<string | undefined>,
  channel?: WhitelistChannel,
  enabled = true,
) {
  // Keep the latest getToken without making it an effect dependency (callers often pass a
  // fresh closure each render, which would otherwise restart the interval constantly).
  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;

  const key = initial.map(p => p.number).join(',');
  const [numbers, setNumbers] = useState<PhoneEntry[]>(initial);
  const [status, setStatus] = useState<WhitelistPollStatus>('idle');

  useEffect(() => {
    const list = key ? key.split(',') : [];
    if (!enabled || list.length === 0) return;

    let cancelled = false;
    let intervalId = 0;

    const checkAll = async () => {
      setStatus(prev => (prev === 'success' ? prev : 'checking'));
      const token = await getTokenRef.current();
      if (!token) {
        if (!cancelled) setStatus('idle');
        return;
      }
      const checks = await Promise.all(list.map(n => checkNumber(n, token, channel)));
      if (cancelled) return;
      setNumbers(checks);
      if (checks.every(p => p.isWhitelisted)) {
        setStatus('success');
        clearInterval(intervalId);
      } else {
        setStatus('idle');
      }
    };

    checkAll();
    intervalId = window.setInterval(checkAll, 5000);
    return () => { cancelled = true; clearInterval(intervalId); };
  }, [enabled, channel, key]);

  const allWhitelisted = numbers.length > 0 && numbers.every(p => p.isWhitelisted);
  return { numbers, status, allWhitelisted };
}
