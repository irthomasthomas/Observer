// src/utils/streamApi.ts

/**
 * Stream a prompt to the Ollama server and receive chunks of the response
 * @param host Ollama server host
 * @param port Ollama server port
 * @param modelName Name of the model to use
 * @param prompt The prompt text to send
 * @param onChunk Callback function that receives each chunk of text as it arrives
 * @param onComplete Optional callback function that is called when streaming completes
 * @param onError Optional callback function that is called if an error occurs
 * @returns A function that can be called to abort the stream
 */
export function streamPrompt(
  host: string,
  port: string,
  modelName: string,
  prompt: string,
  onChunk: (text: string) => void,
  onComplete?: () => void,
  onError?: (error: Error) => void
): () => void {
  // Create an AbortController to allow canceling the stream
  const abortController = new AbortController();
  const signal = abortController.signal;
  
  // Start the streaming process
  (async () => {
    try {
      // Use the OpenAI-compatible API endpoint for streaming
      const url = `https://${host}:${port}/v1/chat/completions`;
      
      const requestBody = JSON.stringify({
        model: modelName,
        messages: [
          {
            role: "user",
            content: prompt
          }
        ],
        stream: true  // Enable streaming
      });
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: requestBody,
        signal
      });
      
      if (!response.ok) {
        throw new Error(`API error: ${response.status} ${response.statusText}`);
      }
      
      if (!response.body) {
        throw new Error('Response body is null');
      }
      
      // Process the stream
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        // Decode the chunk
        const chunk = decoder.decode(value, { stream: true });
        
        // OpenAI format sends "data: {json}" lines
        const lines = chunk
          .split('\n')
          .filter(line => line.startsWith('data: ') && line.trim() !== 'data: [DONE]');
        
        for (const line of lines) {
          try {
            const jsonStr = line.substring(6); // Remove 'data: ' prefix
            const parsed = JSON.parse(jsonStr);
            
            // Extract the content from the choice delta
            if (parsed.choices && 
                parsed.choices[0] && 
                parsed.choices[0].delta && 
                parsed.choices[0].delta.content) {
              onChunk(parsed.choices[0].delta.content);
            }
          } catch (e) {
            // If parsing fails, just continue
            continue;
          }
        }
      }
      
      // Call onComplete when done
      if (onComplete) {
        onComplete();
      }
    } catch (error) {
      // Don't report errors if the stream was intentionally aborted
      if (signal.aborted) {
        return;
      }
      
      // Handle errors
      if (onError) {
        onError(error instanceof Error ? error : new Error(String(error)));
      }
    }
  })();
  
  // Return an abort function
  return () => {
    abortController.abort();
  };
}
