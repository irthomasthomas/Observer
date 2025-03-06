// src/utils/sendApi.ts

/**
 * Send a prompt to the Ollama server using OpenAI chat completions API format
 * @param host Ollama server host
 * @param port Ollama server port
 * @param modelName Name of the model to use
 * @param prompt The prompt to send to the model
 * @returns The model's response text
 */
export async function sendPrompt(
  host: string,
  port: string, 
  modelName: string, 
  prompt: string
): Promise<string> {
  try {
    const url = `https://${host}:${port}/v1/chat/completions`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: modelName,
        messages: [
          {
            role: "user",
            content: prompt
          }
        ],
        stream: false
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama API error: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    
    // The response format has changed - we need to extract the message content
    return data.choices[0].message.content;
  } catch (error) {
    console.error('Error calling Ollama API:', error);
    throw error;
  }
}
