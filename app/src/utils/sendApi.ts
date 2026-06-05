// src/utils/sendApi.ts
import { platformFetch } from './platform';
import { InferenceParams } from '../config/inference-params';
import type { AssistantResponse, ToolCall, WireToolSpec } from '../mcp/types';


/**
 * Handles streaming response from the API
 * @param response The fetch response object
 * @param onStreamChunk Optional callback for each chunk
 * @returns The complete message content
 */
async function handleStreamingResponse(response: Response, onStreamChunk?: (chunk: string) => void, onReasoningChunk?: (chunk: string) => void): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('No response body available for streaming');
  }

  const decoder = new TextDecoder();
  let fullContent = '';

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        //console.log('🎯 Stream completed');
        break;
      }

      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split('\n').filter(line => line.trim() !== '');

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6); // Remove 'data: ' prefix

          if (data === '[DONE]') {
            //console.log('🏁 Stream finished');
            return fullContent;
          }

          try {
            const parsed = JSON.parse(data);
            const content = parsed.choices?.[0]?.delta?.content;
            const reasoning = parsed.choices?.[0]?.delta?.reasoning;

            if (reasoning && onReasoningChunk) {
              onReasoningChunk(reasoning);
            }

            if (content) {
              //console.log('📝 Token:', content);
              fullContent += content;
              // Call the callback with the new content if provided
              if (onStreamChunk) {
                onStreamChunk(content);
              }
            }
          } catch (parseError) {
            //console.warn('Failed to parse streaming chunk:', data);
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  return fullContent;
}

/**
 * Streaming handler for tool-calling requests. A single turn may interleave prose and
 * tool-call fragments; prose is forwarded via onStreamChunk while tool_calls are
 * accumulated by `index` (concatenating function.arguments fragments).
 */
async function handleStreamingResponseWithTools(
  response: Response,
  onStreamChunk?: (chunk: string) => void,
  onReasoningChunk?: (chunk: string) => void,
): Promise<AssistantResponse> {
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('No response body available for streaming');
  }

  const decoder = new TextDecoder();
  let fullContent = '';
  let finishReason: string | undefined;
  // Accumulate tool-call fragments keyed by their stream index.
  const toolCallsByIndex: Record<number, { id?: string; name?: string; arguments: string }> = {};

  const finalize = (): AssistantResponse => {
    const indices = Object.keys(toolCallsByIndex).map(Number).sort((a, b) => a - b);
    const tool_calls: ToolCall[] = indices.map(i => ({
      id: toolCallsByIndex[i].id || `call_${i}`,
      type: 'function' as const,
      function: {
        name: toolCallsByIndex[i].name || '',
        arguments: toolCallsByIndex[i].arguments || '',
      },
    }));
    return {
      content: fullContent,
      tool_calls: tool_calls.length > 0 ? tool_calls : undefined,
      finish_reason: finishReason,
    };
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split('\n').filter(line => line.trim() !== '');

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6);
        if (data === '[DONE]') {
          return finalize();
        }

        try {
          const parsed = JSON.parse(data);
          const choice = parsed.choices?.[0];
          if (!choice) continue;

          const delta = choice.delta || {};

          if (delta.reasoning && onReasoningChunk) {
            onReasoningChunk(delta.reasoning);
          }

          if (delta.content) {
            fullContent += delta.content;
            if (onStreamChunk) onStreamChunk(delta.content);
          }

          if (Array.isArray(delta.tool_calls)) {
            for (const tc of delta.tool_calls) {
              const idx = typeof tc.index === 'number' ? tc.index : 0;
              if (!toolCallsByIndex[idx]) toolCallsByIndex[idx] = { arguments: '' };
              if (tc.id) toolCallsByIndex[idx].id = tc.id;
              if (tc.function?.name) toolCallsByIndex[idx].name = tc.function.name;
              if (tc.function?.arguments) toolCallsByIndex[idx].arguments += tc.function.arguments;
            }
          }

          if (choice.finish_reason) finishReason = choice.finish_reason;
        } catch (parseError) {
          // Ignore unparseable fragments (matches non-tool handler behavior)
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  return finalize();
}

export class UnauthorizedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnauthorizedError';
  }
}

/**
 * Direct fetch to a specific server without model discovery
 * @param serverAddress Full server address (e.g., 'https://api.observer-ai.com:443')
 * @param messages Array of OpenAI-format messages with role and content
 * @param modelName Name of the model to use
 * @param token Optional authorization token (used for Observer API only)
 * @param enableStreaming Whether to enable streaming response (default: false)
 * @param onStreamChunk Optional callback for streaming chunks
 * @param inferenceParams Optional inference parameters (temperature, top_p, etc.)
 *        - For Observer API: token param is used for auth
 *        - For custom servers: inferenceParams.customApiKey is used as Bearer token
 * @returns The model's response text
 */
/**
 * Convert native image format to OpenAI format for external APIs.
 * Native: { type: 'image', image: 'data:...' }
 * OpenAI: { type: 'image_url', image_url: { url: 'data:...' } }
 */
function convertToOpenAIFormat(messages: Array<{role: string, content: any}>): Array<{role: string, content: any}> {
  return messages.map(msg => {
    if (typeof msg.content === 'string' || !Array.isArray(msg.content)) {
      return msg;
    }

    const convertedContent = msg.content.map((part: any) => {
      // Convert native image format to OpenAI format
      if (part.type === 'image' && part.image) {
        return { type: 'image_url', image_url: { url: part.image } };
      }
      return part;
    });

    return { ...msg, content: convertedContent };
  });
}

// Overloads: passing `tools` switches the return type to the full AssistantResponse
// (content + tool_calls + finish_reason); omitting it keeps the back-compat string path.
export async function fetchResponse(
  serverAddress: string,
  messages: Array<{role: string, content: any}>,
  modelName: string,
  token: string | undefined,
  enableStreaming: boolean,
  onStreamChunk: ((chunk: string) => void) | undefined,
  inferenceParams: InferenceParams | undefined,
  onReasoningChunk: ((chunk: string) => void) | undefined,
  tools: WireToolSpec[]
): Promise<AssistantResponse>;
export async function fetchResponse(
  serverAddress: string,
  messages: Array<{role: string, content: any}>,
  modelName: string,
  token?: string,
  enableStreaming?: boolean,
  onStreamChunk?: (chunk: string) => void,
  inferenceParams?: InferenceParams,
  onReasoningChunk?: (chunk: string) => void
): Promise<string>;
export async function fetchResponse(
  serverAddress: string,
  messages: Array<{role: string, content: any}>,
  modelName: string,
  token?: string,
  enableStreaming: boolean = false,
  onStreamChunk?: (chunk: string) => void,
  inferenceParams?: InferenceParams,
  onReasoningChunk?: (chunk: string) => void,
  tools?: WireToolSpec[]
): Promise<string | AssistantResponse> {
  try {
    // External API: convert to OpenAI format
    const apiMessages = convertToOpenAIFormat(messages);
    const url = `${serverAddress}/v1/chat/completions`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    const isObserverApi = serverAddress.includes('api.observer-ai.com');

    if (isObserverApi) {
      // Observer hosted API: use JWT token for auth
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
    } else if (inferenceParams?.customApiKey) {
      // Custom inference server: use user's own API key (BYOK)
      headers['Authorization'] = `Bearer ${inferenceParams.customApiKey}`;
    }

    // Build request body with optional inference parameters
    const requestBodyObj: Record<string, any> = {
      model: modelName,
      messages: apiMessages,
      stream: enableStreaming
    };

    // Apply inference parameters if provided
    if (inferenceParams) {
      // Tier 1 - Universal OpenAI-compatible parameters
      if (inferenceParams.temperature !== undefined) requestBodyObj.temperature = inferenceParams.temperature;
      if (inferenceParams.top_p !== undefined) requestBodyObj.top_p = inferenceParams.top_p;
      if (inferenceParams.max_tokens !== undefined) requestBodyObj.max_tokens = inferenceParams.max_tokens;
      if (inferenceParams.seed !== undefined) requestBodyObj.seed = inferenceParams.seed;
      if (inferenceParams.stop !== undefined) requestBodyObj.stop = inferenceParams.stop;

      // Tier 2 - Common extensions
      if (inferenceParams.frequency_penalty !== undefined) requestBodyObj.frequency_penalty = inferenceParams.frequency_penalty;
      if (inferenceParams.presence_penalty !== undefined) requestBodyObj.presence_penalty = inferenceParams.presence_penalty;
      if (inferenceParams.top_k !== undefined) requestBodyObj.top_k = inferenceParams.top_k;

      // Tier 3 - Thinking/Reasoning control
      if (inferenceParams.reasoning_effort !== undefined) requestBodyObj.reasoning_effort = inferenceParams.reasoning_effort;
      if (inferenceParams.enable_thinking !== undefined) {
        // For Qwen3 via vLLM - passed as chat_template_kwargs
        requestBodyObj.chat_template_kwargs = { enable_thinking: inferenceParams.enable_thinking };
      }
    }

    // Attach function tools when provided (native OpenAI function calling)
    if (tools && tools.length > 0) {
      requestBodyObj.tools = tools;
    }

    const requestBody = JSON.stringify(requestBodyObj);

    const response = await platformFetch(url, {
      method: 'POST',
      headers,
      body: requestBody,
    });

    if (response.status === 429) {
      throw new UnauthorizedError('Access denied. Quota may be exceeded.');
    }

    if (!response.ok) {
        const errorBody = await response.text();
        console.error(`API Error Response Body: ${errorBody}`);

        let errorMessage = `API error: ${response.status}`;
        try {
          const errorData = JSON.parse(errorBody);
          if (errorData.detail) {
            errorMessage += ` - ${errorData.detail}`;
          }
        } catch {
          if (errorBody && errorBody.length < 200) {
            errorMessage += ` - ${errorBody}`;
          }
        }

        throw new Error(errorMessage);
    }

    const usingTools = !!(tools && tools.length > 0);

    if (enableStreaming) {
      if (usingTools) {
        return await handleStreamingResponseWithTools(response, onStreamChunk, onReasoningChunk);
      }
      return await handleStreamingResponse(response, onStreamChunk, onReasoningChunk);
    } else {
      const data = await response.json();
      const message = data.choices?.[0]?.message;

      if (usingTools) {
        // With tools, content may be null when the model only emits tool_calls.
        if (!message) {
          console.error('Unexpected API response structure:', data);
          throw new Error('Unexpected API response structure');
        }
        const result: AssistantResponse = {
          content: message.content ?? '',
          tool_calls: message.tool_calls,
          finish_reason: data.choices?.[0]?.finish_reason,
        };
        return result;
      }

      if (!message || typeof message.content === 'undefined') {
          console.error('Unexpected API response structure:', data);
          throw new Error('Unexpected API response structure');
      }

      return message.content;
    }

  } catch (error) {
    console.error('Error calling API:', error);
    throw error;
  }
}

