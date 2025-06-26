// src/utils/feedbackReporter.ts

import { getAgent, getAgentCode } from './agent_database';
import { Logger, LogLevel, LogEntry } from './logging';
import yaml from 'js-yaml';

interface FeedbackDetails {
  sentiment: 'like' | 'dislike';
  comment: string;
}

interface ReportOptions {
  agentId: string;
  includeAgentConfig: boolean;
  includeLogs: boolean;
}

/**
 * Generates a complete feedback report in Markdown format.
 * @param options - The options for gathering data.
 * @param feedback - The user's sentiment and comment.
 * @returns A promise that resolves to a Markdown string.
 */
export async function generateFeedbackReportMarkdown(
  options: ReportOptions,
  feedback: FeedbackDetails
): Promise<string> {
  const { agentId, includeAgentConfig, includeLogs } = options;
  const { sentiment, comment } = feedback;

  const reportParts: string[] = [];

  // --- Header ---
  reportParts.push('# Observer AI: Feedback Report');
  reportParts.push(`- **Sentiment:** ${sentiment === 'like' ? '👍 Like' : '👎 Dislike'}`);
  reportParts.push(`- **Agent ID:** \`${agentId}\``);
  reportParts.push(`- **Timestamp:** ${new Date().toUTCString()}`);
  reportParts.push('---');

  // --- User Comment ---
  if (comment.trim()) {
    reportParts.push('## User Comment');
    reportParts.push(`> ${comment.replace(/\n/g, '\n> ')}`); // Format as blockquote
    reportParts.push('---');
  }

  // --- Agent Configuration ---
  if (includeAgentConfig) {
    reportParts.push('## Agent Configuration');
    try {
      const agent = await getAgent(agentId);
      const code = await getAgentCode(agentId);
      if (agent && code !== null) {
        const exportData = {
          id: agent.id,
          name: agent.name,
          description: agent.description,
          model_name: agent.model_name,
          system_prompt: agent.system_prompt,
          loop_interval_seconds: agent.loop_interval_seconds,
          code,
        };
        const agentConfigYaml = yaml.dump(exportData);
        reportParts.push('```yaml');
        reportParts.push(agentConfigYaml);
        reportParts.push('```');
      } else {
        reportParts.push('Could not retrieve agent configuration.');
      }
    } catch (error) {
      console.error("Error gathering agent config for feedback:", error);
      reportParts.push('Error: Could not retrieve agent configuration.');
    }
    reportParts.push('---');
  }

  // --- Included Logs ---
  if (includeLogs) {
    reportParts.push('## Included Logs');
    try {
      const logs = Logger.getFilteredLogs({ source: agentId, level: LogLevel.INFO })
        .filter(log => ['model-prompt', 'model-response'].includes(log.details?.logType || ''));
      
      if (logs.length > 0) {
        logs.forEach(log => {
          const logType = log.details?.logType === 'model-prompt' ? 'Model Prompt' : 'Model Response';
          const timestamp = new Date(log.timestamp).toLocaleTimeString();
          let content = log.details?.content;

          // For prompts, extract the text part
          if (typeof content === 'object' && content?.modifiedPrompt) {
              content = content.modifiedPrompt;
          }

          reportParts.push(`**[${logType}]** - _${timestamp}_`);
          reportParts.push(`> ${String(content).replace(/\n/g, '\n> ')}`);
        });
      } else {
        reportParts.push('No prompt/response logs were found for this agent.');
      }
    } catch (error) {
      console.error("Error gathering logs for feedback:", error);
      reportParts.push('Error: Could not retrieve logs.');
    }
  }

  return reportParts.join('\n\n');
}
