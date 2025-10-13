// Utility to detect sensitive personal information in agent code

export interface SensitiveDataDetection {
  hasSensitiveData: boolean;
  detectedFunctions: string[];
  lineNumbers: Record<string, number[]>; // function name -> line numbers where it appears
}

// Notification functions that may contain sensitive information
const SENSITIVE_FUNCTIONS = [
  'sendEmail',
  'sendPushover',
  'sendDiscord',
  'sendTelegram',
  'sendWhatsapp',
  'sendSms'
];

const FUNCTION_DESCRIPTIONS: Record<string, string> = {
  sendEmail: 'Email addresses',
  sendPushover: 'Pushover tokens',
  sendDiscord: 'Discord webhooks',
  sendTelegram: 'Telegram chat IDs',
  sendWhatsapp: 'WhatsApp phone numbers',
  sendSms: 'Phone numbers'
};

const PLACEHOLDER_SUGGESTIONS: Record<string, string> = {
  sendEmail: '"example@email.com"',
  sendPushover: '"your_pushover_token_here"',
  sendDiscord: '"https://discord.com/api/webhooks/1234/id"',
  sendTelegram: '"123456789"',
  sendWhatsapp: '"+1 (555) 999-9999"',
  sendSms: '"+1 (555) 999-9999"'
};

/**
 * Detects if code contains notification functions that may have personal information
 * @param code The JavaScript code to analyze
 * @returns Detection result with list of found functions and their locations
 */
export function detectSensitiveFunctions(code: string): SensitiveDataDetection {
  const detectedFunctions: string[] = [];
  const lineNumbers: Record<string, number[]> = {};

  if (!code || typeof code !== 'string') {
    return {
      hasSensitiveData: false,
      detectedFunctions: [],
      lineNumbers: {}
    };
  }

  // Split code into lines for line number tracking
  const lines = code.split('\n');

  // Check each sensitive function
  for (const funcName of SENSITIVE_FUNCTIONS) {
    // Create regex to match function calls
    // Matches: funcName( with optional whitespace
    const regex = new RegExp(`\\b${funcName}\\s*\\(`, 'g');

    // Track line numbers where this function appears
    const foundLines: number[] = [];

    lines.forEach((line, index) => {
      if (regex.test(line)) {
        foundLines.push(index + 1); // Line numbers start at 1
      }
    });

    if (foundLines.length > 0) {
      detectedFunctions.push(funcName);
      lineNumbers[funcName] = foundLines;
    }
  }

  return {
    hasSensitiveData: detectedFunctions.length > 0,
    detectedFunctions,
    lineNumbers
  };
}

/**
 * Get human-readable description of what data type a function may contain
 */
export function getFunctionDescription(funcName: string): string {
  return FUNCTION_DESCRIPTIONS[funcName] || 'sensitive data';
}

/**
 * Get all detected data types as a readable list
 */
export function getDetectedDataTypes(detectedFunctions: string[]): string[] {
  return detectedFunctions.map(func => FUNCTION_DESCRIPTIONS[func] || func);
}

/**
 * Get placeholder suggestion for a function
 */
export function getPlaceholderSuggestion(funcName: string): string {
  return PLACEHOLDER_SUGGESTIONS[funcName] || '"placeholder"';
}
