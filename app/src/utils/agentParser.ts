// src/utils/agentParser.ts
import { CompleteAgent } from './agent_database';

/**
 * Extracts the raw configuration block from a string.
 * @param text The text possibly containing an agent config.
 * @returns The content inside the $$$ block, or null if not found.
 */
export function extractAgentConfig(text: string): string | null {
  const agentBlockRegex = /\$\$\$\s*\n?([\s\S]*?)\n?\$\$\$/;
  const match = text.match(agentBlockRegex);
  return match && match[1] ? match[1].trim() : null;
}

/**
 * Extracts all agent configuration blocks from a string.
 * @param text The text possibly containing multiple agent configs.
 * @returns An array of content inside $$$ blocks, or empty array if none found.
 */
export function extractMultipleAgentConfigs(text: string): string[] {
  const agentBlockRegex = /\$\$\$\s*\n?([\s\S]*?)\n?\$\$\$/g;
  const matches = Array.from(text.matchAll(agentBlockRegex));
  return matches.map(match => match[1] ? match[1].trim() : '').filter(config => config.length > 0);
}

/**
 * Extracts the image request text from a string.
 * @param text The text possibly containing an image request.
 * @returns The content inside the %%% block, or null if not found.
 */
export function extractImageRequest(text: string): string | null {
  const imageRequestRegex = /%%%\s*\n?([\s\S]*?)\n?%%%/;
  const match = text.match(imageRequestRegex);
  return match && match[1] ? match[1].trim() : null;
}

/**
 * Parses a raw agent configuration string into a structured agent object and code.
 * @param configText The raw agent configuration (content from within $$$).
 * @returns An object containing the agent and code, or null on failure.
 */
export function parseAgentResponse(configText: string): { agent: CompleteAgent, code: string } | null {
  try {
    const codeMatch = configText.match(/code:\s*\|\s*\n([\s\S]*?)(?=\nmemory:|$)/);
    const systemPromptMatch = configText.match(/system_prompt:\s*\|\s*\n([\s\S]*?)(?=\ncode:)/);
    
    if (!codeMatch || !codeMatch[1] || !systemPromptMatch || !systemPromptMatch[1]) {
      console.error("Parsing Error: Could not find system_prompt or code sections.");
      return null;
    }

    const getField = (field: string): string => {
      const match = configText.match(new RegExp(`^${field}:\\s*([^\\n]+)`, 'm'));
      return match && match[1] ? match[1].trim() : '';
    };

    const agent: CompleteAgent = {
      id: getField('id') || `agent_${Date.now()}`, // Fallback to ensure an ID exists
      name: getField('name') || 'Untitled Agent',
      description: getField('description') || 'No description.',
      model_name: getField('model_name'),
      system_prompt: systemPromptMatch[1].trimEnd(),
      loop_interval_seconds: parseFloat(getField('loop_interval_seconds')) || 60,
    };
    
    // Basic validation
    if (!agent.model_name) {
      console.error("Parsing Error: model_name is missing.");
      return null;
    }

    return { agent, code: codeMatch[1] };
  } catch (error) {
    console.error("Fatal error parsing agent response:", error);
    return null;
  }
}
