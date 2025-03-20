import React, { useState, useRef } from 'react';
import { Loader2, Zap, XCircle, Save } from 'lucide-react';
import { streamPrompt } from '@utils/streamApi';
import { CompleteAgent, saveAgent } from '@utils/agent_database';
import EditAgentModal from './EditAgentModal';

// Use environment variables for API keys
const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY || ''; 
const DEFAULT_MODEL = import.meta.env.VITE_DEFAULT_MODEL || 'gemini-2.0-flash';

// Simple function to return the system prompt prefix
function getSystemPrompt() {
  return `## Agent Creator System Prompt

You are Agent Creator, a specialized AI that creates simple agent configurations from user descriptions. Focus on creating agents that perform targeted tasks with minimal code complexity.

### Model Selection
- \`deepseek-r1:8b\`: Small reasoning model (text analysis, summarization)
- \`qwq\`: Large reasoning model (complex reasoning, detailed analysis)
- \`gemma3:4b\`: Small vision model (basic image recognition)
- \`gemma3:32b\`: Large vision model (detailed visual analysis)

### Input Processors
- \`$SCREEN_OCR\`: Captures text from screen
- \`$SCREEN_64\`: Captures screen as image

### Available Functions
- \`setMemory(content)\`: Overwrites agent memory with content
- \`appendMemory(content)\`: Adds content to existing agent memory with a newline
- \`appendMemory(content, separator)\`: Adds content with custom separator
- \`time()\`: Returns current timestamp as string

### Code Patterns
Keep code extremely simple - focus intelligence in the model, not the code:

\`\`\`javascript
// Store response directly
setMemory(response);

// Append response with timestamp (preferred for logging)
appendMemory(\`[\${time()}] \${response}\`);

// Clean response by removing thinking sections
const cleanedResponse = response.replace(/<think>[\\s\\S]*?<\\/think>/g, '').trim();
appendMemory(\`[\${time()}] \${cleanedResponse}\`);

// Command pattern - only save specific commands
if (response.includes("COMMAND:")) {
  const command = response.split("COMMAND:")[1].trim();
  appendMemory(\`[\${time()}] \${command}\`);
}
\`\`\`

### Timing Guidelines
- Fast monitoring: 30-60 seconds
- Standard monitoring: 120-300 seconds
- Periodic tasks: 600+ seconds

### Output Format
\`\`\`
id: [unique_id_with_underscores]
name: [Name]
description: [Brief description]
status: stopped
model_name: [model]
loop_interval_seconds: [interval]
system_prompt: |
  [Instructions with input processors]
  
code: |
  [Simple code from patterns above]
  
memory: ""
\`\`\`

### Example: Command Tracking Agent
\`\`\`
id: command_tracking_agent
name: Command Tracking Agent
description: Monitors screen for terminal commands and logs them.
status: stopped
model_name: deepseek-r1:8b
loop_interval_seconds: 30
system_prompt: |
  You are a command tracking assistant. Monitor the screen and identify any commands being run by the user.
  
  Look for terminal/console windows and command prompts.
  
  Simply respond with:
  
  COMMAND: the command that was executed
  
  Examples:
  
  COMMAND: git push origin main
  
  COMMAND: npm install react
  
  COMMAND: python script.py
  
  
  Only report when you see a new command being executed.
  
  Ignore repeated commands and command output.
  
  <Screen>
  $SCREEN_OCR
  </Screen>
  
  Focus on actual commands, not general terminal text or prompts.
  
  And just respond with one sentence:
  
  COMMAND: the command that was executed
  
  If there are no commands given, just respond with "No Commands Found".
  
code: |
  //Clean response
  const cleanedResponse = response.replace(/<think>[\\s\\S]*?<\\/think>/g, '').trim();
  
  //Command Format
  if (cleanedResponse.includes("COMMAND:")) {
    const command = cleanedResponse.replace("COMMAND:", "").trim();
    appendMemory(\`[\${time()}] \${command}\`);
  }
  
memory: ""
\`\`\`

### Example: Dashboard Monitor
\`\`\`
id: dashboard_monitor
name: Dashboard Monitor
description: Monitors dashboards for changes and alerts on significant updates.
status: stopped
model_name: gemma3:32b
loop_interval_seconds: 120
system_prompt: |
  You are a dashboard monitoring agent. Analyze screen content to detect changes in dashboards, charts, and metrics.
  
  $SCREEN_64
  
  <Screen Text>
  $SCREEN_OCR
  </Screen Text>
  
  Your task is to:
  1. Identify dashboards, charts, metrics on screen
  2. Notice significant changes in values or status
  
  If you detect a meaningful change, respond with:
  ALERT: [describe the specific change]
  
  If no significant changes, respond with:
  "No significant changes detected"
  
code: |
  // Only save alerts
  if (response.includes("ALERT:")) {
    appendMemory(\`[\${time()}] \${response}\`);
  }
  
memory: ""
\`\`\`

Focus on creating agents that:
1. Have clear command patterns in system prompts
2. Use minimal code that just saves relevant information
3. Match the user's requirements precisely

Match the output format EXACTLY, make sure all fields are present and properly formatted.

AGENT TO BE CREATED:`;
}

// Function to parse the AI response
function parseAgentResponse(responseText: string): { agent: CompleteAgent, code: string } | null {
  try {
    // Find the starting positions of each section
    const systemPromptStart = responseText.indexOf('system_prompt: |');
    const codeStart = responseText.indexOf('code: |');
    const memoryStart = responseText.indexOf('memory: ');
    
    if (systemPromptStart === -1 || codeStart === -1 || memoryStart === -1) {
      return null;
    }
    
    // Extract single-line fields with regex
    const idMatch = responseText.match(/^id:\s*(.+)$/m);
    const nameMatch = responseText.match(/^name:\s*(.+)$/m);
    const descriptionMatch = responseText.match(/^description:\s*(.+)$/m);
    const modelMatch = responseText.match(/^model_name:\s*(.+)$/m);
    const intervalMatch = responseText.match(/^loop_interval_seconds:\s*(\d+\.?\d*)$/m);
    
    if (!idMatch || !nameMatch || !modelMatch || !intervalMatch) {
      return null;
    }
    
    // Extract system prompt (between system_prompt and code)
    const systemPromptSection = responseText.substring(
      systemPromptStart + 'system_prompt: |'.length,
      codeStart
    ).trim();
    
    // Extract code (between code and memory)
    const codeSection = responseText.substring(
      codeStart + 'code: |'.length,
      memoryStart
    ).trim();
    
    const agent: CompleteAgent = {
      id: idMatch[1].trim(),
      name: nameMatch[1].trim(),
      description: descriptionMatch ? descriptionMatch[1].trim() : '',
      status: 'stopped',
      model_name: modelMatch[1].trim(),
      system_prompt: systemPromptSection,
      loop_interval_seconds: parseFloat(intervalMatch[1])
    };
    
    return { agent, code: codeSection };
  } catch (error) {
    console.error("Error parsing agent response:", error);
    return null;
  }
}

const GenerateAgent: React.FC = () => {
  const [userInput, setUserInput] = useState<string>('');
  const [aiResponse, setAiResponse] = useState<string>('');
  const [isStreaming, setIsStreaming] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [saveSuccess, setSaveSuccess] = useState<boolean>(false);
  const abortControllerRef = useRef<(() => void) | null>(null);
  
  // Modal state
  const [showModal, setShowModal] = useState<boolean>(false);
  const [parsedAgent, setParsedAgent] = useState<CompleteAgent | null>(null);
  const [parsedCode, setParsedCode] = useState<string>('');
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!userInput.trim() || isStreaming) return;
    
    // Clear previous responses and errors
    setAiResponse('');
    setIsStreaming(true);
    setError(null);
    setSaveSuccess(false);
    
    const fullPrompt = `${getSystemPrompt()} ${userInput}`;
    
    try {
      // Stream the response using our new Gemini API utility
      const abortStream = streamPrompt(
        GEMINI_API_KEY,
        DEFAULT_MODEL,
        fullPrompt,
        (chunk) => {
          // Update UI with each new chunk
          setAiResponse(prev => prev + chunk);
        },
        () => {
          // Stream completed
          setIsStreaming(false);
        },
        (error: Error) => {
          // Stream error
          setError(`Error: ${error.message}`);
          setIsStreaming(false);
        }
      );
      
      // Store the abort function
      abortControllerRef.current = abortStream;
      
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(`Failed to generate: ${errorMessage}`);
      setIsStreaming(false);
    }
  };
  
  const handleCancel = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current();
      abortControllerRef.current = null;
      setIsStreaming(false);
    }
  };
  
  const handleReset = () => {
    setUserInput('');
    setAiResponse('');
    setError(null);
    setSaveSuccess(false);
  };
  
  const handleSaveAgent = async () => {
    setIsSaving(true);
    setError(null);
    
    try {
      const parsed = parseAgentResponse(aiResponse);
      if (!parsed) {
        throw new Error("Failed to parse agent response. Please check the format.");
      }
      
      const { agent, code } = parsed;
      
      // Open the modal for editing instead of saving directly
      setParsedAgent(agent);
      setParsedCode(code);
      setShowModal(true);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(`Error parsing agent: ${errorMessage}`);
    } finally {
      setIsSaving(false);
    }
  };
  
  const handleSaveModalChanges = async (agent: CompleteAgent, code: string) => {
    try {
      // Save the agent using the database utility
      await saveAgent(agent, code);
      
      setSaveSuccess(true);
      setTimeout(() => {
        setSaveSuccess(false);
        setAiResponse('');
        setUserInput('');
      }, 3000);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(`Error saving agent: ${errorMessage}`);
    }
    
    // Close the modal
    setShowModal(false);
  };

  return (
    <div className="w-full">
      {!aiResponse ? (
        // Input form when no response yet
        <form onSubmit={handleSubmit} className="flex">
          <input
            type="text"
            value={userInput}
            onChange={(e) => setUserInput(e.target.value)}
            placeholder="Describe what you want the agent to do..."
            className="flex-1 p-3 border border-gray-300 rounded-l-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-700"
            disabled={isStreaming}
            autoFocus
          />
          <button
            type="submit"
            className="px-5 py-3 bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-r-md hover:from-green-600 hover:to-emerald-700 font-medium transition-colors flex items-center"
            disabled={isStreaming || !userInput.trim()}
          >
            {isStreaming ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <>
                <Zap className="h-5 w-5 mr-1" />
                Generate
              </>
            )}
          </button>
        </form>
      ) : (
        // Show response
        <div>
          <div className="bg-gray-50 p-4 rounded-md mb-4 max-h-72 overflow-y-auto border border-gray-200">
            <div className="whitespace-pre-wrap font-mono text-sm text-gray-800">{aiResponse}</div>
          </div>
          <div className="flex justify-end space-x-3">
            {isStreaming && (
              <button
                onClick={handleCancel}
                className="px-4 py-2 bg-red-500 text-white rounded-md hover:bg-red-600 transition-colors flex items-center"
              >
                <XCircle className="h-4 w-4 mr-1" />
                Cancel
              </button>
            )}
            
            {/* Save Agent button */}
            {!isStreaming && aiResponse && (
              <button
                onClick={handleSaveAgent}
                disabled={isSaving}
                className={`px-4 py-2 ${isSaving ? 'bg-gray-400' : 'bg-green-600 hover:bg-green-700'} text-white rounded-md transition-colors flex items-center`}
              >
                {isSaving ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                    Parsing...
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4 mr-1" />
                    Configure & Save
                  </>
                )}
              </button>
            )}
            
            <button
              onClick={handleReset}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
            >
              Create Another
            </button>
          </div>
        </div>
      )}

      {/* Error display */}
      {error && (
        <div className="bg-red-50 text-red-700 p-3 my-4 text-sm rounded-md border border-red-200 flex items-start">
          <XCircle className="h-5 w-5 mr-2 flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}
      
      {/* Success message */}
      {saveSuccess && (
        <div className="bg-green-50 text-green-700 p-3 my-4 text-sm rounded-md border border-green-200 flex items-start">
          <Save className="h-5 w-5 mr-2 flex-shrink-0 mt-0.5" />
          <span>Agent saved successfully! You can now find it in your agents list.</span>
        </div>
      )}
      
      {/* Edit Agent Modal */}
      {showModal && parsedAgent && (
        <EditAgentModal
          isOpen={showModal}
          onClose={() => setShowModal(false)}
          createMode={true}
          agent={parsedAgent}
          code={parsedCode}
          onSave={handleSaveModalChanges}
        />
      )}
    </div>
  );
};

export default GenerateAgent;
