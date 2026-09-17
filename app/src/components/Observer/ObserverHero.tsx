// src/components/Observer/ObserverHero.tsx
//
// The Observer tab's empty-conversation splash — minimal, centered, front-and-center
// input, matching Claude Cowork/ChatGPT's own "new chat" screen. Deliberately small and
// self-contained: it does not reuse or refactor MCP.tsx's internal input, so GetStarted.tsx
// (which embeds MCP.tsx as-is for the My Agents tab) is completely unaffected by this file.

import React, { useState } from 'react';
import { Send, Loader2 } from 'lucide-react';
import { useMCPContext } from '../../mcp/MCPContext';

const ObserverHero: React.FC = () => {
  const { send, isRunning } = useMCPContext();
  const [value, setValue] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const text = value.trim();
    if (!text || isRunning) return;
    setValue('');
    void send(text);
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center px-4">
      <h1 className="text-2xl md:text-3xl font-semibold text-gray-800 mb-6 text-center">
        What do you want Observer to watch for?
      </h1>
      <form onSubmit={handleSubmit} className="w-full max-w-2xl flex items-center gap-2">
        <input
          type="text"
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Describe what you want monitored…"
          disabled={isRunning}
          className="flex-1 min-w-0 p-4 md:p-5 text-base md:text-lg text-gray-700 bg-white border border-gray-200 rounded-full shadow-sm disabled:bg-gray-100 disabled:cursor-not-allowed focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
        />
        <button
          type="submit"
          disabled={isRunning || !value.trim()}
          className="p-4 md:p-5 bg-purple-600 text-white rounded-full hover:bg-purple-700 disabled:bg-gray-300 transition-colors flex items-center flex-shrink-0"
          title="Send"
        >
          {isRunning ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
        </button>
      </form>
    </div>
  );
};

export default ObserverHero;
