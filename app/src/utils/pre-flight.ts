// src/utils/pre-flight.ts

import type { TokenProvider } from './main_loop';

export interface PhoneWhitelistResult {
  phoneNumbers: Array<{ number: string; isWhitelisted: boolean }>;
  hasTools: boolean;
}

/**
 * Check if agent code uses phone tools and verify phone numbers are whitelisted
 */
export async function checkPhoneWhitelist(
  agentCode: string,
  getToken?: TokenProvider
): Promise<PhoneWhitelistResult> {
  // Check if code contains phone tools
  const hasPhoneTools = agentCode.includes('call(') ||
                       agentCode.includes('sendSms(') ||
                       agentCode.includes('sendWhatsApp(');

  if (!hasPhoneTools) {
    return { phoneNumbers: [], hasTools: false };
  }

  // Extract phone numbers using E.164 format regex
  const phoneRegex = /\+\d{10,15}/g;
  const matches = agentCode.match(phoneRegex);
  const uniqueNumbers = matches ? [...new Set(matches)] : [];

  if (uniqueNumbers.length === 0) {
    // Tools present but no numbers found
    return { phoneNumbers: [], hasTools: true };
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
          body: JSON.stringify({ phone_number: number }),
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

  return { phoneNumbers, hasTools: true };
}
