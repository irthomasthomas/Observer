// src/components/AICreator/AgentAutocompleteInput.tsx

import React, { useState, useRef, useEffect } from 'react';
import { Users } from 'lucide-react';
import { getAllAgentIds } from '@utils/agent_database';
import { detectPartialAgentTyping } from '@utils/agentParser';

interface AgentAutocompleteInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  disabled: boolean;
  className?: string;
  disableAutocomplete?: boolean;
}

export const AgentAutocompleteInput: React.FC<AgentAutocompleteInputProps> = ({
  value, onChange, placeholder, disabled, className, disableAutocomplete = false
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

  // Load agent IDs on component mount (only if autocomplete is enabled)
  useEffect(() => {
    if (disableAutocomplete) return;

    const loadAgentIds = async () => {
      try {
        const ids = await getAllAgentIds();
        setAgentIds(ids);
      } catch (error) {
        console.error('Failed to load agent IDs:', error);
      }
    };
    loadAgentIds();
  }, [disableAutocomplete]);

  // Collapse textarea to single line when disabled (better UX during model responses)
  useEffect(() => {
    if (disabled && inputRef.current) {
      inputRef.current.style.height = '48px';
    }
  }, [disabled]);

  // Auto-focus when input becomes enabled again
  useEffect(() => {
    if (!disabled && inputRef.current) {
      inputRef.current.focus();
    }
  }, [disabled]);

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    const newCursorPos = e.target.selectionStart || 0;

    onChange(newValue);

    // Skip autocomplete logic if disabled
    if (disableAutocomplete) return;

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

  function renderSuggestions() {
    if (disableAutocomplete || !showSuggestions || filteredSuggestions.length === 0) return null;

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
          minHeight: '48px',
          overflow: 'hidden'
        }}
        onInput={(e) => {
          const target = e.target as HTMLTextAreaElement;
          target.style.height = 'auto';
          target.style.height = Math.max(target.scrollHeight, 48) + 'px';
        }}
      />

      {!disableAutocomplete && renderSuggestions()}
    </div>
  );
};