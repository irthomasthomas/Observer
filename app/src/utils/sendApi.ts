// src/utils/sendApi.ts
// Import the PreProcessorResult interface from the pre-processor file
import { PreProcessorResult } from './pre-processor';

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
  preprocessResult: PreProcessorResult
): Promise<string> {
  try {
    const url = `https://${host}:${port}/v1/chat/completions`;
    
    // Prepare headers with auth code if needed
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    
    // Add auth code header if available and using Ob-Server
    if (host === 'api.observer-ai.com') {
      const authCode = localStorage.getItem('observer_auth_code');
      if (authCode) {
        headers['X-Observer-Auth-Code'] = authCode;
      }
    }
    
    // Format the request in OpenAI-compatible format
    let content: any = preprocessResult.modifiedPrompt;
    
    // If we have images, format them according to OpenAI's multimodal format
    const hasImages = preprocessResult.images && preprocessResult.images.length > 0;
    if (hasImages) {
      content = [
        { type: "text", text: preprocessResult.modifiedPrompt },
        ...preprocessResult.images.map(image => ({
          type: "image_url",
          image_url: {
            url: image, // Assuming the image is provided as a base64 data URL
          }
        }))
      ];
    }
    
    const requestBody = JSON.stringify({
      model: modelName,
      messages: [
        {
          role: "user",
          content: content
        }
      ],
      stream: false  // Ensure streaming is disabled
    });
    
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: requestBody,
    });
    
    if (!response.ok) {
      throw new Error(`API error: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    return data.choices[0].message.content;
  } catch (error) {
    console.error('Error calling API:', error);
    throw error;
  }
}
