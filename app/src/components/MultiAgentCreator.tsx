// src/components/MultiAgentCreator.tsx

import React, { useState, useRef, useEffect } from 'react';
import { Send, Loader2, Save, Cpu, X, AlertTriangle, Clipboard, Users } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { sendPrompt, fetchResponse } from '@utils/sendApi';
import { CompleteAgent, updateAgentImageMemory, saveAgent, getAgentCode } from '@utils/agent_database';
import { extractMultipleAgentConfigs, parseAgentResponse, extractImageRequest } from '@utils/agentParser';
import MediaUploadMessage from './MediaUploadMessage';
import getMultiAgentSystemPrompt from '@utils/multi_agent_creator';
import type { TokenProvider } from '@utils/main_loop';
import { listModels, Model } from '@utils/inferenceServer';

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

const LocalModelSelectionModal: React.FC<LocalModelSelectionModalProps> = ({
  isOpen, onClose, currentModel, onSelectModel, onSignIn, onSwitchToObServer, isAuthenticated
}) => {
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
          const result = listModels();
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
    const promptText = getMultiAgentSystemPrompt();
    navigator.clipboard.writeText(promptText).then(() => {
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
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
                <p>Multi-agent creation requires large, capable models for best results.</p>
                <p className="text-xs text-yellow-700 mt-2">
                  If you don't have a model bigger than 70B parameters, it is recommended to use Ob-Server.
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

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-start space-x-3">
              <span className="text-2xl">💡</span>
              <div className="flex-1">
                <p className="font-semibold text-blue-800 mb-1">Recommended:</p>
                <p className="text-sm text-blue-700 mb-3">
                  Turn on Ob-Server for multi-agent creation. Provides instant access to large, capable models.
                </p>
                <button
                  onClick={handleTryObServer}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors"
                >
                  Turn on Ob-Server for multi-agent creation
                </button>
              </div>
            </div>
          </div>

          <div>
            <label htmlFor="model-select" className="block text-sm font-medium text-gray-700 mb-2">
              Select a model to power the multi-agent creator:
            </label>
            {isFetchingModels ? <div className="text-sm text-gray-500">Loading models...</div>
            : localModelError ? <div className="text-sm text-red-600">{localModelError}</div>
            : (
              <select
                id="model-select"
                value={currentModel}
                onChange={(e) => handleSelectAndClose(e.target.value)}
                className="block w-full p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500 bg-white"
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
//  MULTI-AGENT PREVIEW COMPONENT
// ===================================================================================
interface MultiAgentPreviewProps {
  configsJson: string;
  onSaveAll: (configsJson: string) => void;
}

const MultiAgentPreview: React.FC<MultiAgentPreviewProps> = ({ configsJson, onSaveAll }) => {
  try {
    const agentConfigs = JSON.parse(configsJson) as string[];
    const previews = agentConfigs.map((config, index) => {
      const parsed = parseAgentResponse(config);
      return parsed ? { agent: parsed.agent, code: parsed.code } : null;
    }).filter(Boolean);

    if (previews.length === 0) {
      return (
        <div className="w-full bg-red-50 border border-red-200 rounded-lg p-3 md:p-4 text-center">
          <p className="text-red-800 font-medium">Error parsing agent configurations</p>
        </div>
      );
    }

    return (
      <div className="w-full bg-gradient-to-r from-purple-50 to-indigo-50 border border-purple-200 rounded-lg p-4 md:p-6">
        <div className="text-center mb-4">
          <div className="flex items-center justify-center mb-2">
            <Users className="h-6 w-6 text-purple-600 mr-2" />
            <h3 className="text-lg font-bold text-purple-800">
              🎉 I've created {previews.length} coordinated agents!
            </h3>
          </div>
          <p className="text-purple-700 text-sm">
            These agents will work together to accomplish your task
          </p>
        </div>

        <div className="space-y-4 mb-6">
          {previews.map((preview, index) => (
            <div key={index} className="bg-white border border-gray-200 rounded-lg p-4">
              <div className="flex items-center mb-3">
                <div className="w-8 h-8 bg-purple-100 rounded-full flex items-center justify-center mr-3">
                  <span className="text-purple-600 font-bold text-sm">{index + 1}</span>
                </div>
                <div>
                  <h4 className="font-semibold text-gray-900">{preview!.agent.name}</h4>
                  <p className="text-sm text-gray-600">{preview!.agent.description}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                <div>
                  <h5 className="font-medium text-gray-700 mb-2">System Prompt:</h5>
                  <div className="bg-gray-50 border rounded p-2 max-h-20 overflow-y-auto">
                    <code className="text-gray-600 whitespace-pre-wrap text-xs">
                      {preview!.agent.system_prompt.substring(0, 200)}
                      {preview!.agent.system_prompt.length > 200 ? '...' : ''}
                    </code>
                  </div>
                </div>
                <div>
                  <h5 className="font-medium text-gray-700 mb-2">Code:</h5>
                  <div className="bg-gray-50 border rounded p-2 max-h-20 overflow-y-auto">
                    <code className="text-gray-600 whitespace-pre-wrap text-xs">
                      {preview!.code.substring(0, 200)}
                      {preview!.code.length > 200 ? '...' : ''}
                    </code>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="text-center">
          <button
            onClick={() => onSaveAll(configsJson)}
            className="px-6 py-3 text-base bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-lg hover:from-purple-700 hover:to-indigo-700 font-medium transition-colors flex items-center mx-auto shadow-lg"
          >
            <Save className="h-5 w-5 mr-2" />
            Save All {previews.length} Agents
          </button>
        </div>
      </div>
    );
  } catch (error) {
    return (
      <div className="w-full bg-red-50 border border-red-200 rounded-lg p-3 md:p-4 text-center">
        <p className="text-red-800 font-medium">Error parsing agent configurations</p>
      </div>
    );
  }
};

// ===================================================================================
//  MAIN MULTI-AGENT CREATOR COMPONENT
// ===================================================================================
interface Message {
  id: number;
  text: string;
  sender: 'user' | 'ai' | 'system' | 'image-request' | 'multi-agent-system';
  imageData?: string;
  isStreaming?: boolean;
}

interface MultiAgentCreatorProps {
  getToken: TokenProvider;
  isAuthenticated: boolean;
  isUsingObServer: boolean;
  onSignIn?: () => void;
  onSwitchToObServer?: () => void;
}

const MultiAgentCreator: React.FC<MultiAgentCreatorProps> = ({
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
      text: `Hi there! I'm Observer's **Multi-Agent Builder**. I specialize in creating teams of coordinated agents that work together to accomplish complex tasks.

For example, I can build agent teams to:
🤖 **Monitor & Document** - One agent watches your screen, another documents processes
🔍 **Extract & Solve** - One agent reads problems from screen, another solves them
👀 **Watch & Guide** - One agent observes, another provides step-by-step guidance

What kind of agent team would you like me to create today?`
    }
  ]);
  const [userInput, setUserInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new messages are added
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Local model selection state
  const [isLocalModalOpen, setIsLocalModalOpen] = useState(false);
  const [selectedLocalModel, setSelectedLocalModel] = useState('');

  const sendConversation = async (allMessages: Message[]) => {
    setIsLoading(true);

    const conversationHistory = allMessages.map(msg => `${msg.sender}: ${msg.text}`).join('\n');
    const fullPrompt = `${getMultiAgentSystemPrompt()}\n${conversationHistory}\nai:`;

    const images = allMessages
      .filter(msg => msg.imageData)
      .map(msg => msg.imageData!);

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
        const token = await getToken();
        if (!token) throw new Error("Authentication failed.");

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
          'gemini-2.5-flash',
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

      // Check for multi-agent configs
      const agentConfigs = extractMultipleAgentConfigs(responseText);
      if (agentConfigs.length > 0) {
        const textOutsideBlocks = responseText.replace(/\$\$\$\s*\n?[\s\S]*?\n?\$\$\$/g, '').trim();

        if (textOutsideBlocks) {
          setMessages(prev => prev.map(msg =>
            msg.id === streamingMessageId
              ? { ...msg, text: textOutsideBlocks }
              : msg
          ));
        } else {
          setMessages(prev => prev.filter(msg => msg.id !== streamingMessageId));
        }

        setMessages(prev => [...prev, {
          id: Date.now() + Math.random() * 1000,
          text: JSON.stringify(agentConfigs),
          sender: 'multi-agent-system',
        }]);
      } else {
        // Check for image request
        const imageRequest = extractImageRequest(responseText);
        if (imageRequest) {
          const textOutsideBlocks = responseText.replace(/%%%\s*\n?[\s\S]*?\n?%%%/g, '').trim();

          if (textOutsideBlocks) {
            setMessages(prev => prev.map(msg =>
              msg.id === streamingMessageId
                ? { ...msg, text: textOutsideBlocks }
                : msg
            ));
          } else {
            setMessages(prev => prev.filter(msg => msg.id !== streamingMessageId));
          }

          setMessages(prev => [...prev, {
            id: Date.now() + Math.random() * 1000,
            text: imageRequest,
            sender: 'image-request',
          }]);
        }
      }

    } catch (err) {
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

    if (!isUsingObServer && !selectedLocalModel) {
        setIsLocalModalOpen(true);
        return;
    }

    const newUserMessage: Message = { id: Date.now() + Math.random() * 1000, sender: 'user', text: userInput };
    setMessages(prev => [...prev, newUserMessage]);
    setUserInput('');

    const allMessages = [...messages, newUserMessage];
    await sendConversation(allMessages);
  };

  const handleSaveAllAgents = async (configsJson: string) => {
    try {
      const agentConfigs = JSON.parse(configsJson) as string[];
      const savedAgents: CompleteAgent[] = [];

      for (const configText of agentConfigs) {
        const parsed = parseAgentResponse(configText);
        if (parsed) {
          try {
            const savedAgent = await saveAgent(parsed.agent, parsed.code);
            savedAgents.push(savedAgent);

            const images = messages
              .filter(msg => msg.imageData)
              .map(msg => msg.imageData!);

            if (images.length > 0) {
              await updateAgentImageMemory(parsed.agent.id, images);
            }
          } catch (saveError) {
            console.error(`Failed to save agent ${parsed.agent.id}:`, saveError);
            setMessages(prev => [...prev, {
              id: Date.now() + Math.random() * 1000,
              sender: 'ai',
              text: `Error saving agent "${parsed.agent.name}": ${saveError instanceof Error ? saveError.message : 'Unknown error'}`
            }]);
            return;
          }
        }
      }

      if (savedAgents.length > 0) {
        setMessages(prev => [...prev, {
          id: Date.now() + Math.random() * 1000,
          sender: 'ai',
          text: `🎉 Successfully saved ${savedAgents.length} agents: ${savedAgents.map(a => a.name).join(', ')}!\n\nYour agent team is ready to work together!`
        }]);
      } else {
        setMessages(prev => [...prev, { id: Date.now() + Math.random() * 1000, sender: 'ai', text: "I'm sorry, there was an error parsing the agents. Could you try again?" }]);
      }
    } catch (error) {
      setMessages(prev => [...prev, { id: Date.now() + Math.random() * 1000, sender: 'ai', text: "I'm sorry, there was an error processing the agents. Could you try again?" }]);
    }
  };

  const handleMediaResponse = async (messageId: number, result: string | { type: 'image', data: string }) => {
    const newUserMessage: Message = typeof result === 'string'
      ? { id: Date.now() + Math.random() * 1000, sender: 'user', text: result }
      : { id: Date.now() + Math.random() * 1000, sender: 'user', text: '[Image uploaded]', imageData: result.data };

    setMessages(prev => [...prev.filter(msg => msg.id !== messageId), newUserMessage]);

    const currentMessages = messages.filter(msg => msg.id !== messageId);
    const allMessages = [...currentMessages, newUserMessage];
    await sendConversation(allMessages);
  };

  const getPlaceholderText = () => {
    if (isUsingObServer) {
      return isAuthenticated ? "Describe the agent team you want to build..." : "Enable Ob-Server and log in to use Multi-Agent Builder";
    }
    return selectedLocalModel ? "Describe the agent team to build with your model..." : "Click the CPU icon to select a local model";
  };

  const isInputDisabled = isLoading || (isUsingObServer ? !isAuthenticated : !selectedLocalModel);
  const isSendDisabled = isInputDisabled || !userInput.trim();

  return (
    <>
      <div className="flex flex-col h-[350px] md:h-[450px] bg-gradient-to-br from-purple-50 to-indigo-50 rounded-lg border border-purple-200">
        {/* Chat Messages Area */}
        <div className="flex-1 p-3 md:p-4 space-y-3 md:space-y-4 overflow-y-auto">
          {messages.map((msg) => (
            <div key={msg.id} className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
              {msg.sender === 'multi-agent-system' ? (
                <MultiAgentPreview configsJson={msg.text} onSaveAll={handleSaveAllAgents} />
              ) : msg.sender === 'image-request' ? (
                <div className="w-full">
                  <MediaUploadMessage
                    requestText={msg.text}
                    onResponse={(result) => handleMediaResponse(msg.id, result)}
                  />
                </div>
              ) : (
                <div className={`max-w-xs md:max-w-md p-2 md:p-3 rounded-lg text-sm md:text-base ${
                  msg.sender === 'user'
                    ? 'bg-purple-600 text-white'
                    : 'bg-white text-gray-800 shadow-sm'
                } ${msg.isStreaming ? 'animate-pulse' : ''}`}>
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
          {isLoading && (
            <div className="flex justify-start">
              <div className="bg-white text-gray-800 p-2 md:p-3 rounded-lg text-sm md:text-base inline-flex items-center shadow-sm">
                <Loader2 className="h-4 w-4 md:h-5 md:w-5 animate-spin"/>
              </div>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>

        {/* Input Area */}
        <div className="p-3 md:p-5 border-t border-purple-200 bg-white/80 backdrop-blur-sm rounded-b-lg">
          <form onSubmit={handleSubmit} className="flex items-center space-x-2">
            <input
              type="text"
              value={userInput}
              onChange={(e) => setUserInput(e.target.value)}
              placeholder={getPlaceholderText()}
              className="flex-1 p-2 md:p-3 border border-purple-300 rounded-lg text-sm md:text-base text-gray-700 disabled:bg-gray-100 disabled:cursor-not-allowed focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
              disabled={isInputDisabled}
            />

            {!isUsingObServer && (
              <button
                type="button"
                onClick={() => setIsLocalModalOpen(true)}
                className="p-2 bg-purple-700 text-white rounded-md hover:bg-purple-800 transition-colors flex items-center"
                title="Configure Local Model"
              >
                <Cpu className="h-5 w-5" />
              </button>
            )}

            <button
              type="submit"
              className="p-2 md:p-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:bg-gray-300 transition-colors flex items-center"
              disabled={isSendDisabled}
              title="Send"
            >
              <Send className="h-4 w-4" />
            </button>
          </form>
        </div>
      </div>

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

export default MultiAgentCreator;