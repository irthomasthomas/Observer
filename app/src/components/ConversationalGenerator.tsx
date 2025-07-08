// src/components/ConversationalGenerator.tsx

import React, { useState, useRef } from 'react';
import { Send, Loader2, Save, Clipboard } from 'lucide-react';
import { sendPrompt } from '@utils/sendApi';
import { CompleteAgent } from '@utils/agent_database';
import { extractAgentConfig, parseAgentResponse } from '@utils/agentParser';
import getConversationalSystemPrompt from '@utils/conversational_system_prompt';
import type { TokenProvider } from '@utils/main_loop';

// Define the shape of a message
interface Message {
  id: number;
  text: string;
  sender: 'user' | 'ai' | 'system';
}

// Props are now simpler
interface ConversationalGeneratorProps {
  onAgentGenerated: (agent: CompleteAgent, code: string) => void;
  getToken: TokenProvider;
  isAuthenticated: boolean; 
}

const ConversationalGenerator: React.FC<ConversationalGeneratorProps> = ({ 
  onAgentGenerated, 
  getToken, 
  isAuthenticated 
}) => {
  // --- ALL HOOKS ARE AT THE TOP LEVEL ---
  const [messages, setMessages] = useState<Message[]>([
    { id: 1, sender: 'ai', text: "Hi there! I'm Observer's agent builder. What would you like to create today?" }
  ]);
  const [userInput, setUserInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [copyButtonText, setCopyButtonText] = useState('Copy System Prompt');
  const chatEndRef = useRef<HTMLDivElement>(null);

  // This function is now used for the unauthenticated state
  const handleCopyPrompt = async () => {
    const promptText = getConversationalSystemPrompt();
    try {
      await navigator.clipboard.writeText(promptText);
      setCopyButtonText('Copied!');
      setTimeout(() => setCopyButtonText('Copy System Prompt'), 2000);
    } catch (err) {
      console.error('Failed to copy text: ', err);
      setCopyButtonText('Copy Failed!');
      setTimeout(() => setCopyButtonText('Copy System Prompt'), 2000);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Guard against submission if not authenticated or busy
    if (!userInput.trim() || isLoading || !isAuthenticated) return;

    const newUserMessage: Message = { id: Date.now(), sender: 'user', text: userInput };
    const updatedMessages = [...messages, newUserMessage];
    setMessages(updatedMessages);
    setUserInput('');
    setIsLoading(true);

    const conversationHistory = updatedMessages.map(msg => `${msg.sender}: ${msg.text}`).join('\n');
    const fullPrompt = `${getConversationalSystemPrompt()}\n${conversationHistory}\nai:`;

    try {
      const token = await getToken();
       if (!token) {
        throw new Error("Authentication failed. Please log in again.");
      }
      const responseText = await sendPrompt(
          'api.observer-ai.com', 
          '443', 
          'gemini-2.0-flash-lite',
          { modifiedPrompt: fullPrompt, images: [] },
          token
      );

      const agentConfig = extractAgentConfig(responseText);
      
      if (agentConfig) {
        setMessages(prev => [...prev, {
          id: Date.now() + 1,
          sender: 'system',
          text: agentConfig
        }]);
      } else {
        setMessages(prev => [...prev, { 
          id: Date.now() + 1, 
          sender: 'ai', 
          text: responseText 
        }]);
      }
    } catch (err) {
      const errorText = err instanceof Error ? err.message : 'An unknown error occurred.';
      setMessages(prev => [...prev, { id: Date.now() + 1, sender: 'ai', text: `Sorry, I ran into an error: ${errorText}` }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleConfigureAndSave = (configText: string) => {
    const parsed = parseAgentResponse(configText);
    if (parsed) {
      onAgentGenerated(parsed.agent, parsed.code);
    } else {
      setMessages(prev => [...prev, { id: Date.now(), sender: 'ai', text: "I'm sorry, there was an error parsing the final configuration. Could you try describing your agent again?" }]);
    }
  };

  return (
    <div className="flex flex-col h-[450px] bg-white rounded-b-xl border-x border-b border-indigo-200 shadow-md">
      {/* Chat Messages */}
      <div className="flex-1 p-4 space-y-4 overflow-y-auto">
        {messages.map((msg) => (
          <div key={msg.id} className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
            {msg.sender === 'system' ? (
              <div className="w-full bg-indigo-50 border border-indigo-200 rounded-lg p-4 text-center">
                <p className="text-indigo-800 font-medium mb-3">I've generated your agent blueprint!</p>
                <button
                  onClick={() => handleConfigureAndSave(msg.text)}
                  className="px-4 py-2 bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-lg hover:from-green-600 hover:to-emerald-700 font-medium transition-colors flex items-center mx-auto"
                >
                  <Save className="h-4 w-4 mr-2" />
                  Configure & Save Agent
                </button>
              </div>
            ) : (
              <div className={`max-w-md p-3 rounded-lg ${msg.sender === 'user' ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-800'}`}>
                {msg.text}
              </div>
            )}
          </div>
        ))}
        {isLoading && (
          <div className="flex justify-start">
             <div className="bg-gray-200 text-gray-800 p-3 rounded-lg inline-flex items-center">
                <Loader2 className="h-5 w-5 animate-spin"/>
             </div>
          </div>
        )}
        <div ref={chatEndRef} />
      </div>

      {/* --- CONDITIONALLY RENDERED INPUT AREA --- */}
      <div className="p-3 border-t border-gray-200 bg-gray-50">
        {isAuthenticated ? (
          // Authenticated User View
          <form onSubmit={handleSubmit} className="flex items-center">
            <input
              type="text"
              value={userInput}
              onChange={(e) => setUserInput(e.target.value)}
              placeholder="Describe the agent you want to build..."
              className="flex-1 p-2 border border-gray-300 rounded-l-md focus:outline-none focus:ring-2 focus:ring-indigo-500 text-gray-700"
              disabled={isLoading}
            />
            <button
              type="submit"
              className="px-4 py-2 bg-blue-600 text-white rounded-r-md hover:bg-blue-700 disabled:bg-blue-300 transition-colors"
              disabled={isLoading || !userInput.trim()}
            >
              <Send className="h-5 w-5" />
            </button>
          </form>
        ) : (
          // Unauthenticated User View
          <div className="flex items-center space-x-2">
            <input
              type="text"
              disabled
              placeholder="Please log in to use the AI Builder"
              className="flex-1 p-2 border border-gray-300 rounded-l-md bg-gray-100 cursor-not-allowed text-gray-500"
            />
            <button
              onClick={handleCopyPrompt}
              title="Copy the system prompt to use in another LLM UI"
              className="px-4 py-2 bg-gray-600 text-white rounded-r-md hover:bg-gray-700 transition-colors flex items-center whitespace-nowrap"
            >
              <Clipboard className="h-4 w-4 mr-2" />
              {copyButtonText}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default ConversationalGenerator;
