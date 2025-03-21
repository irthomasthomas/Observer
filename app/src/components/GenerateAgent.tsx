import React, { useState, useRef, useEffect } from 'react';
import { Loader2, Zap, XCircle, Save } from 'lucide-react';
import { streamPrompt } from '@utils/streamApi';
import { CompleteAgent, saveAgent } from '@utils/agent_database';
import EditAgentModal from './EditAgentModal';
import getSystemPrompt from '@utils/system_prompt'

// Use environment variables for API keys
const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY || ''; 
const DEFAULT_MODEL = import.meta.env.VITE_DEFAULT_MODEL || 'gemini-2.0-flash';

// Inline PrettyAgentResponse component
const PrettyAgentResponse: React.FC<{ responseText: string; isStreaming: boolean }> = ({ 
  responseText, 
  isStreaming 
}) => {
  const [formattedResponse, setFormattedResponse] = useState<React.ReactNode>("");
  
  useEffect(() => {
    if (!responseText) return;
    
    // Extract the part inside triple backticks if present
    const agentFileRegex = /```\s*\n?([\s\S]*?)```/;
    const match = responseText.match(agentFileRegex);
    
    if (match && match[1] && match.index !== undefined) {
      // We found content inside triple backticks
      const beforeContent = responseText.slice(0, match.index).trim();
      const agentFileContent = match[1];
      const afterContent = responseText.slice(match.index + match[0].length).trim();
      
      // Format the agent file content
      const formattedAgentContent = formatAgentFile(agentFileContent);
      
      // Combine everything
      setFormattedResponse(
        <>
          {beforeContent && <div className="mb-4 text-gray-700">{beforeContent}</div>}
          <div className="agent-file-container">{formattedAgentContent}</div>
          {afterContent && <div className="mt-4 text-gray-700">{afterContent}</div>}
        </>
      );
    } else {
      // No triple backticks found, just return as is
      setFormattedResponse(<div className="text-gray-700">{responseText}</div>);
    }
  }, [responseText]);
  
  // Function to format the agent file content
  const formatAgentFile = (content: string) => {
    // Split by lines
    const lines = content.split('\n');
    
    // Process each line to identify key sections
    return (
      <div className="bg-gradient-to-r from-gray-50 to-gray-100 rounded-lg border border-gray-200 shadow-sm overflow-hidden">
        <div className="p-4">
          {lines.map((line, index) => {
            // Check if this is a key-value line (like "id: something")
            const keyValueMatch = line.match(/^([a-z_]+):\s*(.+)$/);
            if (keyValueMatch && keyValueMatch.length >= 3) {
              const key = keyValueMatch[1];
              const value = keyValueMatch[2];
              
              return (
                <div key={index} className="flex items-start mb-2">
                  <div className="w-48 font-medium text-gray-600">{key}:</div>
                  <div className="flex-1 text-gray-800">{value}</div>
                </div>
              );
            }
            
            // Section headers with pipe symbol
            const sectionMatch = line.match(/^([a-z_]+):\s*\|$/);
            if (sectionMatch && sectionMatch.length >= 2) {
              const key = sectionMatch[1];
              
              return (
                <div key={index} className="flex flex-col mb-2 mt-4">
                  <div className="w-full font-medium text-gray-600 border-b border-gray-300 pb-1 mb-2">{key}:</div>
                </div>
              );
            }
            
            // If line is empty, add some spacing
            if (line.trim() === "") {
              return <div key={index} className="h-2"></div>;
            }
            
            // Regular content lines (indented under a section)
            return (
              <div key={index} className="pl-6 text-gray-700 whitespace-pre-wrap mb-1">
                {line}
              </div>
            );
          })}
        </div>
        {isStreaming && (
          <div className="bg-gradient-to-r from-blue-50 to-blue-100 h-1 w-full animate-pulse"></div>
        )}
      </div>
    );
  };
  
  return (
    <div className="agent-response w-full">
      {formattedResponse}
    </div>
  );
};

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
        // Show response with PrettyAgentResponse
        <div>
          <div className="mb-4 max-h-72 overflow-y-auto">
            <PrettyAgentResponse responseText={aiResponse} isStreaming={isStreaming} />
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
