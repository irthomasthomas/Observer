// src/utils/pre-flight.ts

import type { TokenProvider } from './main_loop';
import type { WhitelistChannel } from './logging';
import { normalizeWhitelistCode } from './whitelistCode';

export interface PhoneWhitelistResult {
  /**
   * Every literal passed to a phone tool. `isCode` is false for anything that isn't a
   * 4-word whitelist code (e.g. a raw phone number): the server rejects those outright,
   * so they are never whitelisted and the fix is to swap in the user's code.
   */
  phoneNumbers: Array<{ number: string; isWhitelisted: boolean; isCode: boolean }>;
  hasTools: boolean;
  channel?: WhitelistChannel; // 'whatsapp' | 'sms' | 'voice'
}

/**
 * Check if agent code uses phone tools and verify the codes it sends to are paired
 */
export async function checkPhoneWhitelist(
  agentCode: string,
  getToken?: TokenProvider
): Promise<PhoneWhitelistResult> {
  // Check if code contains phone tools
  const hasWhatsapp = agentCode.includes('sendWhatsapp(');
  const hasSms = agentCode.includes('sendSms(');
  const hasCall = agentCode.includes('call(');
  const hasPhoneTools = hasWhatsapp || hasSms || hasCall;

  if (!hasPhoneTools) {
    return { phoneNumbers: [], hasTools: false };
  }

  // All three tools reach the phone paired on WhatsApp; the channel only decides whether
  // WhatsApp's 24h window matters. Any sendWhatsapp makes it matter, so 'whatsapp' wins,
  // and callers pass this channel on to every is-whitelisted poll.
  const channel: WhitelistChannel = hasWhatsapp ? 'whatsapp' : hasSms ? 'sms' : 'voice';

  // Extract the literal string argument passed to each phone tool call, rather than
  // guessing at phone-shaped substrings in the code.
  const argRegex = /\b(?:sendWhatsapp|sendSms|call)\(\s*["']([^"']+)["']/g;
  const uniqueNumbers = [...new Set(Array.from(agentCode.matchAll(argRegex), m => m[1]))];

  if (uniqueNumbers.length === 0) {
    // Tools present but no numbers found
    return { phoneNumbers: [], hasTools: true, channel };
  }

  // Get auth token
  if (!getToken) {
    throw new Error('Authentication required to check phone whitelist');
  }

  const token = await getToken();
  if (!token) {
    throw new Error('No authentication token available');
  }

  const phoneNumbers = await Promise.all(
    uniqueNumbers.map(async (number) => {
      if (!normalizeWhitelistCode(number)) {
        return { number, isWhitelisted: false, isCode: false };
      }
      try {
        const response = await fetch('https://api.observer-ai.com/tools/is-whitelisted', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({
            phone_number: number,
            ...(channel === 'whatsapp' ? { channel } : {})
          }),
        });

        if (!response.ok) {
          return { number, isWhitelisted: false, isCode: true };
        }

        const data = await response.json();
        return { number, isWhitelisted: data.is_whitelisted, isCode: true };
      } catch (error) {
        console.error(`Error checking whitelist for ${number}:`, error);
        return { number, isWhitelisted: false, isCode: true };
      }
    })
  );

  return { phoneNumbers, hasTools: true, channel };
}
