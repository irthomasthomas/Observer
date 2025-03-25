// src/utils/sendApi.ts
// Import the PreProcessorResult interface from the pre-processor file
import { PreProcessorResult } from './pre-processor';
/**
 * Send a prompt to the Ollama server
 * @param host Ollama server host
 * @param port Ollama server port
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
  const hasImages = preprocessResult.images && preprocessResult.images.length > 0;
  
  try {
    // First try the preferred endpoint based on content type
    const endpoint = hasImages 
      ? `/api/generate` // Native API for image processing
      : `/v1/chat/completions`; // OpenAI compatible API for text
    
    const url = `https://${host}:${port}${endpoint}`;
    
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
    
    let requestBody;
    
    if (hasImages) {
      // Format for the native API when including images
      requestBody = JSON.stringify({
        model: modelName,
        prompt: preprocessResult.modifiedPrompt,
        images: preprocessResult.images,
        stream: false  // Key fix: ensure streaming is disabled
      });
    } else {
      // Format for OpenAI compatible API (text only)
      requestBody = JSON.stringify({
        model: modelName,
        messages: [
          {
            role: "user",
            content: preprocessResult.modifiedPrompt
          }
        ],
        stream: false  // Key fix: ensure streaming is disabled
      });
    }
    
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: requestBody,
    });
    
    if (!response.ok) {
      // If this failed and we're using OpenAI API with images, we might need to try the native API
      if (response.status === 400 && endpoint === '/v1/chat/completions' && hasImages) {
        // Error suggests compatibility issue with images - try the native API as fallback
        console.log('OpenAI compatibility API doesn\'t support images, falling back to native API');
        
        // Recursive call but force the native API path
        return sendPromptNative(host, port, modelName, preprocessResult);
      }
      
      throw new Error(`Ollama API error: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    
    // Process the response based on which API was used
    if (endpoint === '/api/generate') {
      return data.response;
    } else {
      return data.choices[0].message.content;
    }
  } catch (error) {
    console.error('Error calling Ollama API:', error);
    throw error;
  }
}
/**
 * Fallback function to send a prompt using the native Ollama API
 */
async function sendPromptNative(
  host: string,
  port: string, 
  modelName: string, 
  preprocessResult: PreProcessorResult
): Promise<string> {
  const url = `https://${host}:${port}/api/generate`;
  
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
  
  const requestBody = JSON.stringify({
    model: modelName,
    prompt: preprocessResult.modifiedPrompt,
    images: preprocessResult.images || [],
    stream: false  // Key fix: ensure streaming is disabled
  });
  
  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: requestBody,
  });
  
  if (!response.ok) {
    throw new Error(`Ollama API error: ${response.status} ${response.statusText}`);
  }
  
  const data = await response.json();
  return data.response;
}
