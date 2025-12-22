// src/utils/pre-flight.ts

import type { TokenProvider } from './main_loop';
import type { WhitelistChannel } from './logging';

export interface PhoneWhitelistResult {
  phoneNumbers: Array<{ number: string; isWhitelisted: boolean }>;
  hasTools: boolean;
  channel?: WhitelistChannel; // 'whatsapp' | 'sms' | 'voice'
}

/**
 * Check if agent code uses phone tools and verify phone numbers are whitelisted
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

  // Compute channel preference
  let channel: WhitelistChannel | undefined;
  if (hasWhatsapp && !hasSms && !hasCall) {
    channel = 'whatsapp'; // WhatsApp-only
  } else if (hasSms && !hasWhatsapp && !hasCall) {
    channel = 'sms'; // SMS-only
  } else if (hasCall && !hasWhatsapp && !hasSms) {
    channel = 'voice'; // Voice-only
  } else if ((hasSms || hasCall) && !hasWhatsapp) {
    channel = 'sms'; // SMS/Call (default to sms for mixed)
  }
  // else undefined = mixed or none

  if (!hasPhoneTools) {
    return { phoneNumbers: [], hasTools: false, channel };
  }

  // Extract phone numbers using E.164 format regex
  const phoneRegex = /\+\d{10,15}/g;
  const matches = agentCode.match(phoneRegex);
  const uniqueNumbers = matches ? [...new Set(matches)] : [];

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

  // Check each number
  const phoneNumbers = await Promise.all(
    uniqueNumbers.map(async (number) => {
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
        console.error(`Error checking whitelist for ${number}:`, error);
        return { number, isWhitelisted: false };
      }
    })
  );

  return { phoneNumbers, hasTools: true, channel };
}
