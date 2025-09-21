// src/components/AICreator/ConversationalGenerator.tsx

import React, { useState, useRef, useEffect } from 'react';
import { Send, Loader2, Save, Cpu, X, AlertTriangle, Clipboard } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { sendPrompt, fetchResponse } from '@utils/sendApi';
import { CompleteAgent, updateAgentImageMemory } from '@utils/agent_database';
import { extractAgentConfig, parseAgentResponse, extractImageRequest } from '@utils/agentParser';
import MediaUploadMessage from '../MediaUploadMessage';
import getConversationalSystemPrompt from '@utils/conversational_system_prompt';
import type { TokenProvider } from '@utils/main_loop';
// Removed getOllamaServerAddress import - no longer needed
import { listModels, Model } from '@utils/inferenceServer';
import { AgentAutocompleteInput } from './AgentAutocompleteInput';
import LocalWarning from './LocalWarning';



// ===================================================================================
//  MAIN CONVERSATIONAL GENERATOR COMPONENT
// ===================================================================================
interface Message {
  id: number;
  text: string;
  sender: 'user' | 'ai' | 'system' | 'image-request';
  imageData?: string; // For displaying uploaded images
  isStreaming?: boolean; // For streaming messages
}

interface ConversationalGeneratorProps {
  onAgentGenerated: (agent: CompleteAgent, code: string) => void;
  getToken: TokenProvider;
  isAuthenticated: boolean;
  isUsingObServer: boolean;
  onSignIn?: () => void;
  onSwitchToObServer?: () => void;
}

const ConversationalGenerator: React.FC<ConversationalGeneratorProps> = ({
  onAgentGenerated,
  getToken,
  isAuthenticated,
  isUsingObServer,
  onSignIn,
  onSwitchToObServer
}) => {
  
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 1,
      sender: 'ai',
      text: `Hi there! I'm Observer's agent builder. I can help you create agents to automate tasks by watching your screen.

For example, I can build an agent to:
*   Record 🎥 when something specific happens.
*   Log 🧠 important information to memory.
*   Send alerts 🚀 via Discord, Email, or Pushover.

What would you like to create today?`
    }
  ]);
  const [userInput, setUserInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  
  // Auto-scroll to bottom when new messages are added
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);
  
  // --- STATE FOR MODAL AND LOCAL MODEL SELECTION ---
  const [isLocalModalOpen, setIsLocalModalOpen] = useState(false);
  const [selectedLocalModel, setSelectedLocalModel] = useState('');

  const sendConversation = async (allMessages: Message[]) => {
    setIsLoading(true);

    // Build conversation history and collect images
    const conversationHistory = allMessages.map(msg => `${msg.sender}: ${msg.text}`).join('\n');
    const fullPrompt = `${getConversationalSystemPrompt()}\n${conversationHistory}\nai:`;

    // Collect all images from the conversation
    const images = allMessages
      .filter(msg => msg.imageData)
      .map(msg => msg.imageData!);

    // Create streaming message immediately
    const streamingMessageId = Date.now() + Math.random();
    const streamingMessage: Message = {
      id: streamingMessageId,
      text: '',
      sender: 'ai',
      isStreaming: true
    };
    setMessages(prev => [...prev, streamingMessage]);

    let accumulatedResponse = '';

    try {
      let responseText: string;
      if (isUsingObServer) {
        // --- CLOUD PATH ---
        const token = await getToken();
        if (!token) throw new Error("Authentication failed.");
        // if you think of spamming this model somehow te voy a jalar las patas en la noche >:(
        // Prepare content for fetchResponse
        let content: any = fullPrompt;
        if (images && images.length > 0) {
          content = [
            { type: "text", text: fullPrompt },
            ...images.map(imageBase64Data => ({
              type: "image_url",
              image_url: {
                url: `data:image/png;base64,${imageBase64Data}`
              }
            }))
          ];
        }

        responseText = await fetchResponse(
          'https://api.observer-ai.com:443',
          content,
          'gemini-2.0-flash-lite-free',
          token,
          true,
          (chunk: string) => {
            accumulatedResponse += chunk;
            setMessages(prev => prev.map(msg =>
              msg.id === streamingMessageId
                ? { ...msg, text: accumulatedResponse }
                : msg
            ));
          }
        );
      } else {
        // --- LOCAL PATH ---
        responseText = await sendPrompt(selectedLocalModel, { modifiedPrompt: fullPrompt, images }, undefined, true, (chunk: string) => {
          accumulatedResponse += chunk;
          setMessages(prev => prev.map(msg =>
            msg.id === streamingMessageId
              ? { ...msg, text: accumulatedResponse }
              : msg
          ));
        });
      }

      // Convert streaming message to final message
      setMessages(prev => prev.map(msg =>
        msg.id === streamingMessageId
          ? { ...msg, isStreaming: false }
          : msg
      ));

      // Check for agent config first (priority)
      const agentConfig = extractAgentConfig(responseText);
      if (agentConfig) {
        // Extract text outside $$$ blocks
        const textOutsideBlocks = responseText.replace(/\$\$\$\s*\n?[\s\S]*?\n?\$\$\$/g, '').trim();

        // Update the streamed message with just the text outside blocks (if any)
        if (textOutsideBlocks) {
          setMessages(prev => prev.map(msg =>
            msg.id === streamingMessageId
              ? { ...msg, text: textOutsideBlocks }
              : msg
          ));
        } else {
          // Remove the streaming message if there's no text outside blocks
          setMessages(prev => prev.filter(msg => msg.id !== streamingMessageId));
        }

        // Add system message
        setMessages(prev => [...prev, {
          id: Date.now() + Math.random() * 1000,
          text: agentConfig,
          sender: 'system',
        }]);
      } else {
        // Check for image request
        const imageRequest = extractImageRequest(responseText);
        if (imageRequest) {
          // Extract text outside %%% blocks
          const textOutsideBlocks = responseText.replace(/%%%\s*\n?[\s\S]*?\n?%%%/g, '').trim();

          // Update the streamed message with just the text outside blocks (if any)
          if (textOutsideBlocks) {
            setMessages(prev => prev.map(msg =>
              msg.id === streamingMessageId
                ? { ...msg, text: textOutsideBlocks }
                : msg
            ));
          } else {
            // Remove the streaming message if there's no text outside blocks
            setMessages(prev => prev.filter(msg => msg.id !== streamingMessageId));
          }

          // Add image request message
          setMessages(prev => [...prev, {
            id: Date.now() + Math.random() * 1000,
            text: imageRequest,
            sender: 'image-request',
          }]);
        }
        // For regular responses, the streaming message already contains the full response
        // No additional action needed - just keep the converted streaming message
      }

    } catch (err) {
      // Remove streaming message on error
      setMessages(prev => prev.filter(msg => msg.id !== streamingMessageId));
      const errorText = err instanceof Error ? err.message : 'An unknown error occurred.';
      setMessages(prev => [...prev, { id: Date.now() + Math.random() * 1000, sender: 'ai', text: `Sorry, I ran into an error: ${errorText}` }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userInput.trim() || isLoading) return;

    // Guard against submission if local model isn't selected in local mode
    if (!isUsingObServer && !selectedLocalModel) {
        setIsLocalModalOpen(true); // Prompt user to select a model
        return;
    }

    const newUserMessage: Message = { id: Date.now() + Math.random() * 1000, sender: 'user', text: userInput };
    setMessages(prev => [...prev, newUserMessage]);
    setUserInput('');

    const allMessages = [...messages, newUserMessage];
    await sendConversation(allMessages);
  };

  const handleConfigureAndSave = async (configText: string) => {
    const parsed = parseAgentResponse(configText);
    if (parsed) {
      // Collect all images from the conversation and store them for the agent
      const images = messages
        .filter(msg => msg.imageData)
        .map(msg => msg.imageData!);

      if (images.length > 0) {
        await updateAgentImageMemory(parsed.agent.id, images);
      }

      onAgentGenerated(parsed.agent, parsed.code);
    } else {
      setMessages(prev => [...prev, { id: Date.now() + Math.random() * 1000, sender: 'ai', text: "I'm sorry, there was an error parsing that. Could you try describing your agent again?" }]);
    }
  };


  const handleMediaResponse = async (messageId: number, result: string | { type: 'image', data: string }) => {
    // Remove the image-request message and add user response
    const newUserMessage: Message = typeof result === 'string'
      ? { id: Date.now() + Math.random() * 1000, sender: 'user', text: result }
      : { id: Date.now() + Math.random() * 1000, sender: 'user', text: '[Image uploaded]', imageData: result.data };
    
    setMessages(prev => [...prev.filter(msg => msg.id !== messageId), newUserMessage]);
    
    // Auto-continue: send API request with updated conversation
    const currentMessages = messages.filter(msg => msg.id !== messageId);
    const allMessages = [...currentMessages, newUserMessage];
    await sendConversation(allMessages);
  };
  
  const getPlaceholderText = () => {
    if (isUsingObServer) {
      return isAuthenticated ? "Describe the agent you want to build..." : "Enable Ob-Server and log in to use AI Builder";
    }
    return selectedLocalModel ? "Describe the agent to build with your model..." : "Click the CPU icon to select a local model";
  };
  
  const isInputDisabled = isLoading || (isUsingObServer ? !isAuthenticated : !selectedLocalModel);
  const isSendDisabled = isInputDisabled || !userInput.trim();

  return (
    <>
      <div className="flex flex-col h-[350px] md:h-[450px] bg-white rounded-lg border border-purple-200">
        {/* Chat Messages Area */}
        <div className="flex-1 p-3 md:p-4 space-y-3 md:space-y-4 overflow-y-auto">
          {messages.map((msg) => (
            <div key={msg.id} className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
              {msg.sender === 'system' ? (
                <div className="w-full bg-indigo-50 border border-indigo-200 rounded-lg p-3 md:p-4 text-center">
                  <p className="text-indigo-800 font-medium mb-3">I've generated your agent blueprint!</p>
                  <button onClick={() => handleConfigureAndSave(msg.text)} className="px-3 py-2 md:px-4 text-sm md:text-base bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-lg hover:from-green-600 hover:to-emerald-700 font-medium transition-colors flex items-center mx-auto"><Save className="h-4 w-4 mr-2" />Configure & Save Agent</button>
                </div>
              ) : msg.sender === 'image-request' ? (
                <div className="w-full">
                  <MediaUploadMessage
                    requestText={msg.text}
                    onResponse={(result) => handleMediaResponse(msg.id, result)}
                  />
                </div>
              ) : (
                <div className={`max-w-xs md:max-w-md p-2 md:p-3 rounded-lg text-sm md:text-base ${msg.sender === 'user' ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-800'} ${msg.isStreaming ? 'animate-pulse' : ''}`}>
                  {msg.imageData ? (
                    <div className="space-y-2">
                      <div className="prose prose-sm max-w-none">
                        <ReactMarkdown
                          components={{
                            ul: ({children}) => <ul className="list-disc pl-4 space-y-1 mb-2">{children}</ul>,
                            ol: ({children}) => <ol className="list-decimal pl-4 space-y-1 mb-2">{children}</ol>,
                            li: ({children}) => <li className="text-inherit">{children}</li>,
                            strong: ({children}) => <strong className="font-semibold">{children}</strong>,
                            code: ({children}) => <code className="bg-gray-100 px-1 py-0.5 rounded text-sm font-mono">{children}</code>,
                            p: ({children}) => <p className="mb-2 last:mb-0">{children}</p>
                          }}
                        >
                          {msg.text}
                        </ReactMarkdown>
                      </div>
                      <img
                        src={`data:image/png;base64,${msg.imageData}`}
                        alt="Uploaded image"
                        className="max-w-full h-auto rounded-lg"
                      />
                    </div>
                  ) : (
                    <div className="prose prose-sm max-w-none">
                      <ReactMarkdown
                        components={{
                          ul: ({children}) => <ul className="list-disc pl-4 space-y-1 mb-2">{children}</ul>,
                          ol: ({children}) => <ol className="list-decimal pl-4 space-y-1 mb-2">{children}</ol>,
                          li: ({children}) => <li className="text-inherit">{children}</li>,
                          strong: ({children}) => <strong className="font-semibold">{children}</strong>,
                          code: ({children}) => <code className="bg-gray-100 px-1 py-0.5 rounded text-sm font-mono">{children}</code>,
                          p: ({children}) => <p className="mb-2 last:mb-0">{children}</p>
                        }}
                      >
                        {msg.text}
                      </ReactMarkdown>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
          {isLoading && ( <div className="flex justify-start"><div className="bg-gray-200 text-gray-800 p-2 md:p-3 rounded-lg text-sm md:text-base inline-flex items-center"><Loader2 className="h-4 w-4 md:h-5 md:w-5 animate-spin"/></div></div>)}
          <div ref={chatEndRef} />
        </div>

        {/* Dynamic Input Area */}
        <div className="p-2 border-t border-purple-200 bg-white/80 backdrop-blur-sm rounded-b-lg">
          <form onSubmit={handleSubmit} className="flex items-center gap-2">
            <AgentAutocompleteInput
              value={userInput}
              onChange={setUserInput}
              placeholder={getPlaceholderText()}
              disabled={isInputDisabled}
              disableAutocomplete={true}
              className="flex-1 p-2 md:p-3 border border-purple-300 rounded-lg text-sm md:text-base text-gray-700 disabled:bg-gray-100 disabled:cursor-not-allowed focus:ring-2 focus:ring-purple-500 focus:border-purple-500 resize-none"
            />
            
            {!isUsingObServer && (
              <button
                type="button"
                onClick={() => setIsLocalModalOpen(true)}
                className="p-2 bg-slate-700 text-white rounded-md hover:bg-slate-800 transition-colors flex items-center"
                title="Configure Local Model"
              >
                <Cpu className="h-5 w-5" />
              </button>
            )}

            <button
              type="submit"
              className="p-2 md:p-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:bg-gray-300 transition-colors flex items-center flex-shrink-0"
              disabled={isSendDisabled}
              title="Send"
            >
              <Send className="h-4 w-4" />
            </button>
          </form>
        </div>
      </div>
      
      {/* Render the modal (controlled by state) */}
      <LocalWarning
        isOpen={isLocalModalOpen}
        onClose={() => setIsLocalModalOpen(false)}
        currentModel={selectedLocalModel}
        onSelectModel={setSelectedLocalModel}
        onSignIn={onSignIn}
        onSwitchToObServer={onSwitchToObServer}
        isAuthenticated={isAuthenticated}
        featureType="conversational"
      />
    </>
  );
};

export default ConversationalGenerator;
