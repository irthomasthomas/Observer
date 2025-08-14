import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';

interface OverlayMessage {
  id: string;
  content: string;
  timestamp: number;
}

// Custom hook for interval polling
function useInterval(callback: () => void, delay: number | null) {
  useEffect(() => {
    if (delay === null) return;
    const interval = setInterval(callback, delay);
    return () => clearInterval(interval);
  }, [callback, delay]);
}

// Simple markdown renderer for basic formatting
function renderMarkdown(text: string): string {
  return text
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') // Bold
    .replace(/\*(.*?)\*/g, '<em>$1</em>') // Italic
    .replace(/`(.*?)`/g, '<code>$1</code>') // Inline code
    .replace(/\n/g, '<br>'); // Line breaks
}

function formatTime(timestamp: number): string {
  const date = new Date(timestamp * 1000);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export default function OverlayWindow() {
  const [messages, setMessages] = useState<OverlayMessage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeShortcuts, setActiveShortcuts] = useState<string[]>([]);

  const fetchMessages = useCallback(async () => {
    try {
      const newMessages = await invoke<OverlayMessage[]>('get_overlay_messages');
      setMessages(newMessages);
      setIsLoading(false);
    } catch (error) {
      console.error('Failed to fetch overlay messages:', error);
      setIsLoading(false);
    }
  }, []);

  const clearMessages = useCallback(async () => {
    try {
      await invoke('clear_overlay_messages');
      setMessages([]);
    } catch (error) {
      console.error('Failed to clear overlay messages:', error);
    }
  }, []);
  
  const fetchActiveShortcuts = useCallback(async () => {
    try {
      const shortcuts = await invoke<string[]>('get_active_shortcuts');
      setActiveShortcuts(shortcuts);
    } catch (error) {
      console.error('Failed to fetch active shortcuts:', error);
    }
  }, []);

  // Poll for messages every 500ms
  useInterval(fetchMessages, 500);

  // Initial fetch and content protection setup
  useEffect(() => {
    fetchMessages();
    fetchActiveShortcuts();
    
    // Enable content protection on the overlay window
    const setupContentProtection = async () => {
      try {
        await getCurrentWindow().setContentProtected(true);
        console.log('Content protection enabled on overlay window');
      } catch (error) {
        console.warn('Failed to enable content protection:', error);
      }
    };
    
    setupContentProtection();
  }, [fetchMessages, fetchActiveShortcuts]);

  return (
    <div 
      className="fixed inset-0"
      data-tauri-drag-region
      style={{ 
        backgroundColor: 'rgba(0, 0, 0, 0)',
        WebkitAppRegion: 'drag' 
      } as React.CSSProperties}
    >
      <div className="h-full w-full flex items-start justify-start p-4">
        {/* Compact Messages Container */}
        <div className="min-w-0 max-w-md">
          {isLoading ? (
            <div className="bg-black/70 backdrop-blur-xl rounded-lg px-4 py-3 border border-white/20 shadow-xl">
              <div className="text-white/70 text-sm">Loading...</div>
            </div>
          ) : messages.length === 0 ? (
            <div className="bg-black/70 backdrop-blur-xl rounded-lg px-4 py-3 border border-white/20 shadow-xl">
              <div className="text-white/60 text-sm text-center font-medium">
                Observer Overlay
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              {/* Latest message (largest) */}
              <div className="bg-black/70 backdrop-blur-xl rounded-lg px-4 py-3 border border-white/20 shadow-xl animate-in slide-in-from-bottom-2 duration-300">
                <div className="flex items-start justify-between mb-1">
                  <div className="text-white/40 text-xs font-mono">
                    {formatTime(messages[messages.length - 1].timestamp)}
                  </div>
                  <div className="flex items-center space-x-2">
                    {messages.length > 1 && (
                      <div className="text-white/30 text-xs bg-white/5 px-1.5 py-0.5 rounded text-center min-w-[1rem]">
                        {messages.length}
                      </div>
                    )}
                    <button
                      onClick={clearMessages}
                      className="text-white/40 hover:text-white/70 text-xs transition-colors"
                      title="Clear messages"
                    >
                      ✕
                    </button>
                  </div>
                </div>
                <div 
                  className="text-white/90 text-xs leading-relaxed max-w-none"
                  dangerouslySetInnerHTML={{ 
                    __html: renderMarkdown(messages[messages.length - 1].content) 
                  }}
                />
              </div>

              {/* Previous messages (smaller, if any) */}
              {messages.length > 1 && (
                <div className="space-y-1 max-h-32 overflow-y-auto scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
                  {messages.slice(-6, -1).reverse().map((message) => (
                    <div
                      key={message.id}
                      className="bg-black/50 backdrop-blur-lg rounded-md px-2 py-1 border border-white/5 shadow-lg opacity-75 hover:opacity-100 transition-opacity"
                    >
                      <div className="flex items-center justify-between mb-1">
                        <div className="text-white/30 text-xs font-mono">
                          {formatTime(message.timestamp)}
                        </div>
                      </div>
                      <div 
                        className="text-white/70 text-xs leading-tight line-clamp-2"
                        dangerouslySetInnerHTML={{ 
                          __html: renderMarkdown(message.content.slice(0, 100) + (message.content.length > 100 ? '...' : ''))
                        }}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      
      {/* Dynamic footer hint */}
      <div className="absolute bottom-2 right-2">
        <div className="text-white/20 text-xs bg-black/20 backdrop-blur-sm rounded px-2 py-1 border border-white/5">
          {activeShortcuts.length > 0 ? (
            activeShortcuts
              .slice(0, 2) // Show first 2 shortcuts
              .map(shortcut => 
                shortcut
                  .replace('Cmd+', '⌘')
                  .replace('Alt+', '⌥')
                  .replace('Ctrl+', '^')
                  .replace('Arrow', '')
                  .replace('Up', '↑')
                  .replace('Down', '↓')
                  .replace('Left', '←')
                  .replace('Right', '→')
              )
              .join(' • ')
            + (activeShortcuts.length > 2 ? ` • +${activeShortcuts.length - 2}` : '')
          ) : (
            'No shortcuts'
          )}
        </div>
      </div>
    </div>
  );
}