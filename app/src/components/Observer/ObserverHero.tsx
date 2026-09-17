// src/components/Observer/ObserverHero.tsx
//
// The Observer tab's empty-conversation splash — minimal, centered, front-and-center
// input, matching Claude Cowork/ChatGPT's own "new chat" screen. Deliberately small and
// self-contained: it does not reuse or refactor MCP.tsx's internal input, so GetStarted.tsx
// (which embeds MCP.tsx as-is for the My Agents tab) is completely unaffected by this file.
//
// RecipeInline's wheels are pinned at a fixed spot behind the textarea (absolutely
// positioned, not in its flow) so they never shift as the textarea grows with wrapped text.
// Until the user types their own words, the textarea just mirrors whatever sentence the
// wheels are currently spelling out — spinning a wheel visibly grows/edits the input live.

import React, { useEffect, useRef, useState } from 'react';
import { Send, Loader2 } from 'lucide-react';
import { useMCPContext } from '../../mcp/MCPContext';
import RecipeInline from '../AICreator/RecipeInline';

const ObserverHero: React.FC = () => {
  const { send, isRunning } = useMCPContext();
  const [value, setValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // Once the user types their own text, wheel spins stop overwriting it. Clearing the box
  // (back to empty) hands control back to the wheels.
  const [userEdited, setUserEdited] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const text = value.trim();
    if (!text || isRunning) return;
    setValue('');
    setUserEdited(false);
    void send(text);
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const next = e.target.value;
    setValue(next);
    setUserEdited(next.length > 0);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  // Grow the textarea to fit wrapped/typed content — a plain <textarea> never resizes
  // itself, so height must be recalculated from scrollHeight on every value change
  // (including the live wheel-composed prompt, not just direct typing).
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);

  return (
    <div className="flex-1 flex flex-col items-center justify-center px-4 relative">
      <h1 className="text-2xl md:text-3xl font-semibold text-gray-800 mb-6 text-center">
        What do you want Observer<br className="md:hidden" /> to watch for?
      </h1>
      <form onSubmit={handleSubmit} className="w-full max-w-2xl flex items-end gap-2 relative z-10">
        <textarea
          ref={textareaRef}
          rows={1}
          autoFocus
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder="Describe what you want monitored…"
          disabled={isRunning}
          className="flex-1 min-w-0 p-4 md:p-5 text-base md:text-lg text-gray-700 bg-white border border-gray-200 rounded-3xl shadow-sm disabled:bg-gray-100 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none leading-snug max-h-56 overflow-y-auto"
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

      {/* Pinned behind the form at a fixed spot — absolutely positioned so it never moves
          when the textarea above grows with wrapped text. */}
      <div className="absolute left-1/2 -translate-x-1/2 top-[62%] md:top-[64%] z-0 pointer-events-auto">
        <RecipeInline onPromptChange={prompt => { if (!userEdited) setValue(prompt); }} />
      </div>
    </div>
  );
};

export default ObserverHero;
