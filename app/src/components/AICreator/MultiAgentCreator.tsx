// src/components/AICreator/MultiAgentCreator.tsx

import React, { useState, useRef, useEffect } from 'react';
import { Send, Loader2, Save, Users } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { fetchResponse } from '@utils/sendApi';
import { CompleteAgent, updateAgentImageMemory, saveAgent, getAllAgentIds } from '@utils/agent_database';
import {
  extractMultipleAgentConfigs,
  parseAgentResponse,
  extractImageRequest,
  extractAgentReferencesWithPositions,
  detectPartialAgentTyping,
  extractUniqueAgentReferencesFromConversation,
  fetchAgentReferenceData,
  buildSystemPromptWithAgentContext,
  AgentReferenceData
} from '@utils/agentParser';
import MediaUploadMessage from '../MediaUploadMessage';
import getMultiAgentSystemPrompt from '@utils/multi_agent_creator';
import type { TokenProvider } from '@utils/main_loop';
import AgentReferenceModal from './AgentReferenceModal';

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
    const previews = agentConfigs.map((config, _) => {
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
            {previews.length === 1 ? 'Save Agent' : `Save All ${previews.length} Agents`}
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
//  AGENT AUTOCOMPLETE INPUT
// ===================================================================================
interface AgentAutocompleteInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  disabled: boolean;
  className?: string;
}

const AgentAutocompleteInput: React.FC<AgentAutocompleteInputProps> = ({
  value, onChange, placeholder, disabled, className
}) => {
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [agentIds, setAgentIds] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [filteredSuggestions, setFilteredSuggestions] = useState<string[]>([]);
  const [partialTyping, setPartialTyping] = useState<{
    partialMatch: string;
    start: number;
    end: number;
  } | null>(null);

  // Load agent IDs on component mount
  useEffect(() => {
    const loadAgentIds = async () => {
      try {
        const ids = await getAllAgentIds();
        setAgentIds(ids);
      } catch (error) {
        console.error('Failed to load agent IDs:', error);
      }
    };
    loadAgentIds();
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    const newCursorPos = e.target.selectionStart || 0;

    onChange(newValue);

    // Check for partial agent typing
    const partial = detectPartialAgentTyping(newValue, newCursorPos);
    setPartialTyping(partial);

    if (partial) {
      // Filter agent IDs based on partial match
      const filtered = agentIds.filter(id =>
        id.toLowerCase().includes(partial.partialMatch.toLowerCase())
      );
      setFilteredSuggestions(filtered);
      setShowSuggestions(filtered.length > 0);
    } else {
      setShowSuggestions(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      // Trigger the form submit
      const form = e.currentTarget.closest('form');
      if (form) {
        form.requestSubmit();
      }
    }
  };

  const handleKeyUp = (_: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Remove cursor position tracking as it's not needed
  };

  const handleSuggestionClick = (agentId: string) => {
    if (!partialTyping) return;

    // Replace partial typing with selected agent ID
    const newValue =
      value.substring(0, partialTyping.start) +
      agentId +
      value.substring(partialTyping.end);

    onChange(newValue);
    setShowSuggestions(false);
    setPartialTyping(null);

    // Focus back to input
    inputRef.current?.focus();
  };

  const handleBlur = () => {
    // Delay hiding suggestions to allow clicking
    setTimeout(() => setShowSuggestions(false), 150);
  };


  return (
    <div className="relative w-full">
      <textarea
        ref={inputRef}
        value={value}
        onChange={handleInputChange}
        onKeyDown={handleKeyDown}
        onKeyUp={handleKeyUp}
        onBlur={handleBlur}
        placeholder={placeholder}
        disabled={disabled}
        rows={1}
        className={`w-full resize-none ${className}`}
        style={{
          minHeight: '2.5rem'
        }}
        onInput={(e) => {
          const target = e.target as HTMLTextAreaElement;
          target.style.height = 'auto';
          target.style.height = Math.max(target.scrollHeight, 40) + 'px';
        }}
      />

      {renderSuggestions()}
    </div>
  );


  function renderSuggestions() {
    if (!showSuggestions || filteredSuggestions.length === 0) return null;

    return (
      <div className="absolute bottom-full left-0 right-0 mb-1 bg-white border border-gray-300 rounded-md shadow-lg z-50 max-h-40 overflow-y-auto">
        {filteredSuggestions.map((agentId, _) => (
          <button
            key={agentId}
            onClick={() => handleSuggestionClick(agentId)}
            className="w-full text-left px-3 py-2 hover:bg-purple-50 text-sm flex items-center border-b border-gray-100 last:border-b-0"
          >
            <Users className="h-4 w-4 text-purple-500 mr-2" />
            <span className="font-mono">@{agentId}</span>
          </button>
        ))}
      </div>
    );
  }
};

// ===================================================================================
//  MESSAGE CONTENT WITH AGENT BADGES
// ===================================================================================
interface MessageContentProps {
  text: string;
  onAgentClick: (agentId: string) => void;
}

const MessageContent: React.FC<MessageContentProps> = ({ text, onAgentClick }) => {
  const agentRefs = extractAgentReferencesWithPositions(text);

  if (agentRefs.length === 0) {
    return (
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
          {text}
        </ReactMarkdown>
      </div>
    );
  }

  // Replace @references with agent badges
  return (
    <div className="prose prose-sm max-w-none">
      <div className="mb-2 last:mb-0">
        {renderTextWithAgentBadges(text, agentRefs, onAgentClick)}
      </div>
    </div>
  );
};

function renderTextWithAgentBadges(
  text: string,
  agentRefs: Array<{
    reference: { agentId: string; runCount: number };
    start: number;
    end: number;
    fullMatch: string;
  }>,
  onAgentClick: (agentId: string) => void
) {
  const elements: React.ReactNode[] = [];
  let lastIndex = 0;

  agentRefs.forEach((ref, i) => {
    // Add text before this reference (with markdown parsing)
    if (ref.start > lastIndex) {
      const beforeText = text.substring(lastIndex, ref.start);
      elements.push(
        <ReactMarkdown
          key={`text-${i}`}
          components={{
            p: ({children}) => <span>{children}</span>,
            strong: ({children}) => <strong className="font-semibold">{children}</strong>,
            code: ({children}) => <code className="bg-gray-100 px-1 py-0.5 rounded text-sm font-mono">{children}</code>
          }}
        >
          {beforeText}
        </ReactMarkdown>
      );
    }

    // Add clickable agent badge
    elements.push(
      <button
        key={`agent-${i}`}
        onClick={() => onAgentClick(ref.reference.agentId)}
        className="inline-flex items-center px-3 py-1 rounded-full bg-purple-100 text-purple-700 text-sm font-medium hover:bg-purple-200 transition-colors mx-1"
      >
        <Users className="h-4 w-4 mr-1" />
        {ref.reference.agentId}
        {ref.reference.runCount !== 3 && (
          <span className="ml-1 text-xs opacity-75">#{ref.reference.runCount}</span>
        )}
      </button>
    );

    lastIndex = ref.end;
  });

  // Add remaining text (with markdown parsing)
  if (lastIndex < text.length) {
    const remainingText = text.substring(lastIndex);
    elements.push(
      <ReactMarkdown
        key="text-end"
        components={{
          p: ({children}) => <span>{children}</span>,
          strong: ({children}) => <strong className="font-semibold">{children}</strong>,
          code: ({children}) => <code className="bg-gray-100 px-1 py-0.5 rounded text-sm font-mono">{children}</code>
        }}
      >
        {remainingText}
      </ReactMarkdown>
    );
  }

  return elements;
}

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
  onRefresh?: () => void;
}

const MultiAgentCreator: React.FC<MultiAgentCreatorProps> = ({
  getToken,
  isAuthenticated,
  isUsingObServer: _isUsingObServer,
  onSignIn: _onSignIn,
  onSwitchToObServer: _onSwitchToObServer,
  onRefresh
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

  // Modal state for agent reference details
  const [selectedAgentModal, setSelectedAgentModal] = useState<{
    isOpen: boolean;
    agentData: AgentReferenceData | null;
  }>({ isOpen: false, agentData: null });

  const sendConversation = async (allMessages: Message[]) => {
    setIsLoading(true);

    // Extract all message texts for agent reference scanning
    const messageTexts = allMessages.map(msg => msg.text);

    // Extract unique agent references from entire conversation
    const uniqueReferences = extractUniqueAgentReferencesFromConversation(messageTexts);

    // Fetch agent data for all unique references
    let referenceData: AgentReferenceData[] = [];
    if (uniqueReferences.length > 0) {
      try {
        referenceData = await fetchAgentReferenceData(uniqueReferences);
      } catch (error) {
        console.error('Failed to fetch agent references:', error);
      }
    }

    // Build enhanced system prompt with agent context
    const enhancedSystemPrompt = buildSystemPromptWithAgentContext(
      getMultiAgentSystemPrompt(),
      referenceData
    );

    // Keep conversation history clean (no agent data injected)
    const conversationHistory = allMessages.map(msg => `${msg.sender}: ${msg.text}`).join('\n');
    const fullPrompt = `${enhancedSystemPrompt}\n\n${conversationHistory}\nai:`;

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
      // Multi-Agent Creator only works with Ob-Server
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
          text: `🎉 Successfully saved ${savedAgents.length} ${savedAgents.length === 1 ? 'agent' : 'agents'}: ${savedAgents.map(a => a.name).join(', ')}!\n\nYour agent ${savedAgents.length === 1 ? 'is' : 'team is'} ready to work together!`
        }]);

        // Refresh the agent list
        if (onRefresh) {
          onRefresh();
        }
      } else {
        setMessages(prev => [...prev, { id: Date.now() + Math.random() * 1000, sender: 'ai', text: "I'm sorry, there was an error parsing the agents. Could you try again?" }]);
      }
    } catch (error) {
      setMessages(prev => [...prev, { id: Date.now() + Math.random() * 1000, sender: 'ai', text: "I'm sorry, there was an error processing the agents. Could you try again?" }]);
    }
  };

  const handleAgentBadgeClick = async (agentId: string) => {
    // Fetch the agent data
    let agentData: AgentReferenceData;
    try {
      const references = [{ agentId, runCount: 3 }];
      const referenceData = await fetchAgentReferenceData(references);
      agentData = referenceData[0];
    } catch (error) {
      console.error('Failed to fetch agent data for modal:', error);
      // Create a placeholder for missing agent
      agentData = {
        reference: { agentId, runCount: 3 },
        agent: null,
        code: null,
        memory: '',
        recentRuns: []
      };
    }

    setSelectedAgentModal({ isOpen: true, agentData });
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
    return isAuthenticated ? "Describe the agent team you want to build..." : "Enable Ob-Server and log in to use Multi-Agent Builder";
  };

  const isInputDisabled = isLoading || !isAuthenticated;
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
                      <MessageContent text={msg.text} onAgentClick={handleAgentBadgeClick} />
                      <img
                        src={`data:image/png;base64,${msg.imageData}`}
                        alt="Uploaded image"
                        className="max-w-full h-auto rounded-lg"
                      />
                    </div>
                  ) : (
                    <MessageContent text={msg.text} onAgentClick={handleAgentBadgeClick} />
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
        <div className="p-2 border-t border-purple-200 bg-white/80 backdrop-blur-sm rounded-b-lg">
          <form onSubmit={handleSubmit} className="flex items-center gap-2">
            <AgentAutocompleteInput
              value={userInput}
              onChange={setUserInput}
              placeholder={getPlaceholderText()}
              disabled={isInputDisabled}
              className="flex-1 p-2 md:p-3 border border-purple-300 rounded-lg text-sm md:text-base text-gray-700 disabled:bg-gray-100 disabled:cursor-not-allowed focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
            />

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

      <AgentReferenceModal
        isOpen={selectedAgentModal.isOpen}
        onClose={() => setSelectedAgentModal({ isOpen: false, agentData: null })}
        agentData={selectedAgentModal.agentData}
      />
    </>
  );
};

export default MultiAgentCreator;
