// src/components/ConversationalGenerator.tsx

import React, { useState, useRef, useEffect } from 'react';
import { Send, Loader2, Save, Cpu, X, AlertTriangle } from 'lucide-react';
import { sendPrompt } from '@utils/sendApi';
import { CompleteAgent } from '@utils/agent_database';
import { extractAgentConfig, parseAgentResponse } from '@utils/agentParser';
import getConversationalSystemPrompt from '@utils/conversational_system_prompt';
import type { TokenProvider } from '@utils/main_loop';
import { getOllamaServerAddress } from '@utils/main_loop';
import { listModels, Model } from '@utils/ollamaServer';

// ===================================================================================
//  MODAL SUB-COMPONENT (LIVES INSIDE THE MAIN COMPONENT FILE)
// ===================================================================================
interface LocalModelSelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentModel: string;
  onSelectModel: (modelName: string) => void;
}

const LocalModelSelectionModal: React.FC<LocalModelSelectionModalProps> = ({ isOpen, onClose, currentModel, onSelectModel }) => {
  const [localModels, setLocalModels] = useState<Model[]>([]);
  const [isFetchingModels, setIsFetchingModels] = useState(false);
  const [localModelError, setLocalModelError] = useState<string | null>(null);

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
          <div className="bg-yellow-100 border-l-4 border-yellow-500 text-yellow-800 p-4 rounded-md text-sm flex items-start space-x-3">
            <AlertTriangle className="h-5 w-5 mt-0.5 flex-shrink-0" />
            <div>
              <p className="font-bold">Heads Up!</p>
              <p>This feature requires large, capable models for best results.</p>
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
  sender: 'user' | 'ai' | 'system';
}

interface ConversationalGeneratorProps {
  onAgentGenerated: (agent: CompleteAgent, code: string) => void;
  getToken: TokenProvider;
  isAuthenticated: boolean;
  isUsingObServer: boolean;
}

const ConversationalGenerator: React.FC<ConversationalGeneratorProps> = ({ onAgentGenerated, getToken, isAuthenticated, isUsingObServer }) => {
  const [messages, setMessages] = useState<Message[]>([
  {
    id: 1,
    sender: 'ai',
    text: `Hi there! I'm Observer's agent builder. I can help you create agents to automate tasks by watching your screen.

For example, I can build an agent to:
*   **Record 🎥** when something specific happens.
*   **Log 🧠** important information to memory.
*   **Send alerts 🚀** via Discord, Email, or Pushover.

What would you like to create today?`
  }
]);
  const [userInput, setUserInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  
  // --- STATE FOR MODAL AND LOCAL MODEL SELECTION ---
  const [isLocalModalOpen, setIsLocalModalOpen] = useState(false);
  const [selectedLocalModel, setSelectedLocalModel] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userInput.trim() || isLoading) return;

    // Guard against submission if local model isn't selected in local mode
    if (!isUsingObServer && !selectedLocalModel) return;

    const newUserMessage: Message = { id: Date.now(), sender: 'user', text: userInput };
    setMessages(prev => [...prev, newUserMessage]);
    setUserInput('');
    setIsLoading(true);

    const conversationHistory = [...messages, newUserMessage].map(msg => `${msg.sender}: ${msg.text}`).join('\n');
    const fullPrompt = `${getConversationalSystemPrompt()}\n${conversationHistory}\nai:`;

    try {
      let responseText: string;
      if (isUsingObServer) {
        // --- CLOUD PATH ---
        const token = await getToken();
        if (!token) throw new Error("Authentication failed.");
        responseText = await sendPrompt('https://api.observer-ai.com', '443', 'gemini-2.0-flash-lite', { modifiedPrompt: fullPrompt, images: [] }, token);
      } else {
        // --- LOCAL PATH ---
        const { host, port } = getOllamaServerAddress();
        responseText = await sendPrompt(host, port, selectedLocalModel, { modifiedPrompt: fullPrompt, images: [] });
      }

      const agentConfig = extractAgentConfig(responseText);
      const responseMessage: Message = {
        id: Date.now() + 1,
        text: agentConfig || responseText,
        sender: agentConfig ? 'system' : 'ai',
      };
      setMessages(prev => [...prev, responseMessage]);

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
      setMessages(prev => [...prev, { id: Date.now(), sender: 'ai', text: "I'm sorry, there was an error parsing that. Could you try describing your agent again?" }]);
    }
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
      <div className="flex flex-col h-[450px] bg-white rounded-b-xl border-x border-b border-indigo-200 shadow-md">
        {/* Chat Messages Area - No Changes */}
        <div className="flex-1 p-4 space-y-4 overflow-y-auto">
          {messages.map((msg) => (
            <div key={msg.id} className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
              {msg.sender === 'system' ? (
                <div className="w-full bg-indigo-50 border border-indigo-200 rounded-lg p-4 text-center">
                  <p className="text-indigo-800 font-medium mb-3">I've generated your agent blueprint!</p>
                  <button onClick={() => handleConfigureAndSave(msg.text)} className="px-4 py-2 bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-lg hover:from-green-600 hover:to-emerald-700 font-medium transition-colors flex items-center mx-auto"><Save className="h-4 w-4 mr-2" />Configure & Save Agent</button>
                </div>
              ) : (
                <div className={`max-w-md p-3 rounded-lg ${msg.sender === 'user' ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-800'}`}>{msg.text}</div>
              )}
            </div>
          ))}
          {isLoading && ( <div className="flex justify-start"><div className="bg-gray-200 text-gray-800 p-3 rounded-lg inline-flex items-center"><Loader2 className="h-5 w-5 animate-spin"/></div></div>)}
          <div ref={chatEndRef} />
        </div>

        {/* --- DYNAMIC INPUT AREA --- */}
        <div className="p-3 border-t border-gray-200 bg-gray-50">
          <form onSubmit={handleSubmit} className="flex items-center space-x-2">
            <input
              type="text"
              value={userInput}
              onChange={(e) => setUserInput(e.target.value)}
              placeholder={getPlaceholderText()}
              className="flex-1 p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 text-gray-700 disabled:bg-gray-100 disabled:cursor-not-allowed"
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
              className="p-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-blue-300 transition-colors flex items-center"
              disabled={isSendDisabled}
              title="Send"
            >
              <Send className="h-5 w-5" />
            </button>
          </form>
        </div>
      </div>
      
      {/* --- RENDER THE MODAL (controlled by state) --- */}
      <LocalModelSelectionModal 
        isOpen={isLocalModalOpen}
        onClose={() => setIsLocalModalOpen(false)}
        currentModel={selectedLocalModel}
        onSelectModel={setSelectedLocalModel}
      />
    </>
  );
};

export default ConversationalGenerator;
