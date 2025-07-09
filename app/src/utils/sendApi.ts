// src/utils/sendApi.ts
import { PreProcessorResult } from './pre-processor';

/**
 * Decrements the quota counter stored in localStorage and dispatches an event.
 * This is an optimistic update for the UI.
 */
const optimisticUpdateQuota = () => {
  try {
    const key = 'observer-quota-remaining';
    const currentQuotaStr = localStorage.getItem(key);

    // Only update if there's an existing number value
    if (currentQuotaStr !== null) {
      const currentQuota = parseInt(currentQuotaStr, 10);
      if (!isNaN(currentQuota)) {
        localStorage.setItem(key, (currentQuota - 1).toString());
        // Dispatch a custom event that the AppHeader can listen to
        window.dispatchEvent(new CustomEvent('quotaUpdated'));
      }
    }
  } catch (error) {
    console.error('Failed to optimistically update quota:', error);
  }
};

export class UnauthorizedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnauthorizedError';
  }
}

/**
 * Send a prompt to the API server using OpenAI-compatible v1 chat completions endpoint
 * @param host API server host
 * @param port API server port
 * @param modelName Name of the model to use
 * @param preprocessResult The preprocessed result containing prompt and optional images
 * @returns The model's response text
 */
export async function sendPrompt(
  host: string,
  port: string,
  modelName: string,
  preprocessResult: PreProcessorResult,
  token?: string
): Promise<string> {
  try {
    const url = `${host}:${port}/v1/chat/completions`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (host === 'api.observer-ai.com') {
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      // Trigger the optimistic UI update
      optimisticUpdateQuota();
    }

    let content: any = preprocessResult.modifiedPrompt;
    const hasImages = preprocessResult.images && preprocessResult.images.length > 0;

    if (hasImages) {
      // Ensure preprocessResult.images contains an array of base64 strings
      content = [
        { type: "text", text: preprocessResult.modifiedPrompt },
        // Add the non-null assertion operator (!) after images
        ...preprocessResult.images!.map(imageBase64Data => ({ // Iterate through base64 strings
          type: "image_url",
          image_url: { // image_url is an object
            url: `data:image/png;base64,${imageBase64Data}` // url's value is the full data URI
          }
        }))
      ];
    }

    const requestBody = JSON.stringify({
      model: modelName,
      messages: [
        {
          role: "user",
          content: content // content will be a string or an array of parts
        }
      ],
      stream: false
    });

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: requestBody,
    });

    if (response.status === 429) {
      throw new UnauthorizedError('Access denied. Quota may be exceeded.');
    }

    if (!response.ok) {
        const errorBody = await response.text(); // Attempt to read error body
        console.error(`API Error Response Body: ${errorBody}`);
        throw new Error(`API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();

    // Basic check for expected response structure
    if (!data.choices || !data.choices[0] || !data.choices[0].message || typeof data.choices[0].message.content === 'undefined') {
        console.error('Unexpected API response structure:', data);
        throw new Error('Unexpected API response structure');
    }

    return data.choices[0].message.content;

  } catch (error) {
    console.error('Error calling API:', error);
    // Re-throw the error so the calling function knows something went wrong
    throw error;
  }
}
