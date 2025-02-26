/**
 * Send a prompt to the Ollama server and get the response
 * @param host Ollama server host
 * @param port Ollama server port
 * @param modelName Name of the model to use
 * @param prompt The prompt to send to the model
 * @returns The model's response text
 */
export async function sendPromptToOllama(
  host: string,
  port: string, 
  modelName: string, 
  prompt: string
): Promise<string> {
  try {
    const url = `https://${host}:${port}/api/generate`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: modelName,
        prompt: prompt,
        stream: false
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return data.response;
  } catch (error) {
    console.error('Error calling Ollama API:', error);
    throw error;
  }
}
