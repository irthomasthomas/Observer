// src/components/ConversationalGenerator.tsx

import React, { useState, useRef, useEffect } from 'react';
import { Send, Loader2, Save, Cpu, X, AlertTriangle, Clipboard } from 'lucide-react';
import { sendPrompt } from '@utils/sendApi';
import { CompleteAgent, updateAgentImageMemory } from '@utils/agent_database';
import { extractAgentConfig, parseAgentResponse, extractImageRequest } from '@utils/agentParser';
import MediaUploadMessage from './MediaUploadMessage';
import getConversationalSystemPrompt from '@utils/conversational_system_prompt';
import type { TokenProvider } from '@utils/main_loop';
import { getOllamaServerAddress } from '@utils/main_loop';
import { listModels, Model } from '@utils/ollamaServer';

// ===================================================================================
//  LOCAL MODEL SELECTION MODAL
// ===================================================================================
interface LocalModelSelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentModel: string;
  onSelectModel: (modelName: string) => void;
  onSignIn?: () => void;
  onSwitchToObServer?: () => void;
  isAuthenticated: boolean;
}

const LocalModelSelectionModal: React.FC<LocalModelSelectionModalProps> = ({ isOpen, onClose, currentModel, onSelectModel, onSignIn, onSwitchToObServer, isAuthenticated }) => {
  const [localModels, setLocalModels] = useState<Model[]>([]);
  const [isFetchingModels, setIsFetchingModels] = useState(false);
  const [localModelError, setLocalModelError] = useState<string | null>(null);
  const [isCopied, setIsCopied] = useState(false);

  useEffect(() => {
    if (isOpen) {
      const fetchLocalModels = async () => {
        setIsFetchingModels(true);
        setLocalModelError(null);
        try {
          const { host, port } = getOllamaServerAddress();
          const result = await listModels(host, port);
          if (result.error) throw new Error(result.error);
          if (result.models.length === 0) {
            setLocalModelError("No models found. Ensure your local server is running and has models available.");
          } else {
            setLocalModels(result.models);
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : "An unknown error occurred.";
          setLocalModelError(`Connection failed: ${message}`);
        } finally {
          setIsFetchingModels(false);
        }
      };
      fetchLocalModels();
    }
  }, [isOpen]);

  const handleCopyPrompt = () => {
    const promptText = getConversationalSystemPrompt();
    navigator.clipboard.writeText(promptText).then(() => {
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000); // Reset after 2 seconds
    });
  };

  const handleTryObServer = () => {
    if (!isAuthenticated) {
      onSignIn?.();
    } else {
      onSwitchToObServer?.();
      onClose();
    }
  };

  const handleSelectAndClose = (modelName: string) => {
    onSelectModel(modelName);
    onClose();
  };
  
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md transform transition-all">
        <div className="flex justify-between items-center p-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-800">Configure Local Model</h2>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-100">
            <X className="h-5 w-5 text-gray-500" />
          </button>
        </div>
        <div className="p-6 space-y-6">
          <div className="bg-yellow-100 border-l-4 border-yellow-500 text-yellow-800 p-4 rounded-md text-sm">
            <div className="flex items-start space-x-3">
              <AlertTriangle className="h-5 w-5 mt-0.5 flex-shrink-0" />
              <div>
                <p className="font-bold">Heads Up!</p>
                <p>This feature requires large, capable models for best results.</p>
                <p className="text-xs text-yellow-700 mt-2">
                  If you don't have a model bigger than 70B parameters, it is recommended to use Ob-Server or any large LLM provider of your choice by copying the agent creator system prompt to your clipboard.
                </p>
                <button 
                  onClick={handleCopyPrompt}
                  className="mt-3 px-3 py-1.5 text-xs font-medium text-white bg-slate-700 rounded-md hover:bg-slate-800 transition-colors flex items-center"
                >
                  <Clipboard className="h-4 w-4 mr-2" />
                  {isCopied ? 'Copied!' : 'Copy System Prompt'}
                </button>
              </div>
            </div>
          </div>
          
          {/* Recommended: Turn on Ob-Server Section */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-start space-x-3">
              <span className="text-2xl">💡</span>
              <div className="flex-1">
                <p className="font-semibold text-blue-800 mb-1">Recommended:</p>
                <p className="text-sm text-blue-700 mb-3">
                  Turn on Ob-Server for this feature only. Provides instant access to large, capable models without local hardware requirements.
                </p>
                <button 
                  onClick={handleTryObServer}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors"
                >
                  Turn on Ob-Server for this feature only
                </button>
              </div>
            </div>
          </div>
          
          <div>
            <label htmlFor="model-select" className="block text-sm font-medium text-gray-700 mb-2">
              Select a model to power the generator:
            </label>
            {isFetchingModels ? <div className="text-sm text-gray-500">Loading models...</div>
            : localModelError ? <div className="text-sm text-red-600">{localModelError}</div>
            : (
              <select
                id="model-select"
                value={currentModel}
                onChange={(e) => handleSelectAndClose(e.target.value)}
                className="block w-full p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
              >
                <option value="" disabled>-- Choose your model --</option>
                {localModels.map(model => (
                  <option key={model.name} value={model.name}>{model.name}</option>
                ))}
              </select>
            )}
          </div>
          <div className="text-right">
             <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};


// ===================================================================================
//  MAIN CONVERSATIONAL GENERATOR COMPONENT
// ===================================================================================
interface Message {
  id: number;
  text: string;
  sender: 'user' | 'ai' | 'system' | 'image-request';
  imageData?: string; // For displaying uploaded images
}

interface ConversationalGeneratorProps {
  onAgentGenerated: (agent: CompleteAgent, code: string) => void;
  getToken: TokenProvider;
  isAuthenticated: boolean;
  isUsingObServer: boolean;
  onSignIn?: () => void;
  onSwitchToObServer?: () => void;
}

const ConversationalGenerator: React.FC<ConversationalGeneratorProps> = ({ onAgentGenerated, getToken, isAuthenticated, isUsingObServer, onSignIn, onSwitchToObServer }) => {
  
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

    try {
      let responseText: string;
      if (isUsingObServer) {
        // --- CLOUD PATH ---
        const token = await getToken();
        if (!token) throw new Error("Authentication failed.");
        // if you think of spamming this model somehow te voy a jalar las patas en la noche >:(
        responseText = await sendPrompt('https://api.observer-ai.com', '443', 'gemini-2.0-flash-lite-free', { modifiedPrompt: fullPrompt, images }, token);
      } else {
        // --- LOCAL PATH ---
        const { host, port } = getOllamaServerAddress();
        responseText = await sendPrompt(host, port, selectedLocalModel, { modifiedPrompt: fullPrompt, images });
      }

      // Check for agent config first (priority)
      const agentConfig = extractAgentConfig(responseText);
      if (agentConfig) {
        // Extract text outside $$$ blocks
        const textOutsideBlocks = responseText.replace(/\$\$\$\s*\n?[\s\S]*?\n?\$\$\$/g, '').trim();
        
        const newMessages: Message[] = [];
        
        // Add regular AI message if there's text outside the $$$ blocks
        if (textOutsideBlocks) {
          newMessages.push({
            id: Date.now() + 1,
            text: textOutsideBlocks,
            sender: 'ai',
          });
        }
        
        // Add system message
        newMessages.push({
          id: Date.now() + 2,
          text: agentConfig,
          sender: 'system',
        });
        
        setMessages(prev => [...prev, ...newMessages]);
      } else {
        // Check for image request
        const imageRequest = extractImageRequest(responseText);
        if (imageRequest) {
          // Extract text outside %%% blocks
          const textOutsideBlocks = responseText.replace(/%%%\s*\n?[\s\S]*?\n?%%%/g, '').trim();
          
          const newMessages: Message[] = [];
          
          // Add regular AI message if there's text outside the %%% blocks
          if (textOutsideBlocks) {
            newMessages.push({
              id: Date.now() + 1,
              text: textOutsideBlocks,
              sender: 'ai',
            });
          }
          
          // Add image request message
          newMessages.push({
            id: Date.now() + 2,
            text: imageRequest,
            sender: 'image-request',
          });
          
          setMessages(prev => [...prev, ...newMessages]);
        } else {
          // Regular AI response
          const responseMessage: Message = {
            id: Date.now() + 1,
            text: responseText,
            sender: 'ai',
          };
          setMessages(prev => [...prev, responseMessage]);
        }
      }

    } catch (err) {
      const errorText = err instanceof Error ? err.message : 'An unknown error occurred.';
      setMessages(prev => [...prev, { id: Date.now() + 1, sender: 'ai', text: `Sorry, I ran into an error: ${errorText}` }]);
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

    const newUserMessage: Message = { id: Date.now(), sender: 'user', text: userInput };
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
      setMessages(prev => [...prev, { id: Date.now(), sender: 'ai', text: "I'm sorry, there was an error parsing that. Could you try describing your agent again?" }]);
    }
  };

  const handleMediaResponse = async (messageId: number, result: string | { type: 'image', data: string }) => {
    // Remove the image-request message and add user response
    const newUserMessage: Message = typeof result === 'string'
      ? { id: Date.now(), sender: 'user', text: result }
      : { id: Date.now(), sender: 'user', text: '[Image uploaded]', imageData: result.data };
    
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
      <div className="flex flex-col h-[350px] md:h-[450px] bg-gray-50 rounded-lg border border-gray-200">
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
                <div className={`max-w-xs md:max-w-md p-2 md:p-3 rounded-lg text-sm md:text-base whitespace-pre-wrap ${msg.sender === 'user' ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-800'}`}>
                  {msg.imageData ? (
                    <div className="space-y-2">
                      <p>{msg.text}</p>
                      <img 
                        src={`data:image/png;base64,${msg.imageData}`} 
                        alt="Uploaded image" 
                        className="max-w-full h-auto rounded-lg"
                      />
                    </div>
                  ) : (
                    msg.text
                  )}
                </div>
              )}
            </div>
          ))}
          {isLoading && ( <div className="flex justify-start"><div className="bg-gray-200 text-gray-800 p-2 md:p-3 rounded-lg text-sm md:text-base inline-flex items-center"><Loader2 className="h-4 w-4 md:h-5 md:w-5 animate-spin"/></div></div>)}
          <div ref={chatEndRef} />
        </div>

        {/* Dynamic Input Area */}
        <div className="p-3 md:p-5 border-t border-gray-200 bg-white rounded-b-lg">
          <form onSubmit={handleSubmit} className="flex items-center space-x-2">
            <input
              type="text"
              value={userInput}
              onChange={(e) => setUserInput(e.target.value)}
              placeholder={getPlaceholderText()}
              className="flex-1 p-2 md:p-3 border border-gray-300 rounded-lg text-sm md:text-base text-gray-700 disabled:bg-gray-100 disabled:cursor-not-allowed"
              disabled={isInputDisabled}
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
              className="p-2 md:p-3 bg-gray-400 text-white rounded-lg hover:bg-gray-500 disabled:bg-gray-300 transition-colors flex items-center"
              disabled={isSendDisabled}
              title="Send"
            >
              <Send className="h-4 w-4" />
            </button>
          </form>
        </div>
      </div>
      
      {/* Render the modal (controlled by state) */}
      <LocalModelSelectionModal 
        isOpen={isLocalModalOpen}
        onClose={() => setIsLocalModalOpen(false)}
        currentModel={selectedLocalModel}
        onSelectModel={setSelectedLocalModel}
        onSignIn={onSignIn}
        onSwitchToObServer={onSwitchToObServer}
        isAuthenticated={isAuthenticated}
      />
    </>
  );
};

export default ConversationalGenerator;
