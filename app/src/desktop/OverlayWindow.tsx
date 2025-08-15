import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { listen } from '@tauri-apps/api/event';

interface OverlayMessage {
  id: string;
  content: string;
  timestamp: number;
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

  
  const fetchActiveShortcuts = useCallback(async () => {
    try {
      const shortcuts = await invoke<string[]>('get_active_shortcuts');
      setActiveShortcuts(shortcuts);
    } catch (error) {
      console.error('Failed to fetch active shortcuts:', error);
    }
  }, []);

  // Note: Message polling replaced with event listener below
  // Note: Click-through polling removed - now only enforced after window operations

  // Initial setup and event listeners
  useEffect(() => {
    // Initial data fetch
    fetchMessages();
    fetchActiveShortcuts();
    
    const setupOverlayFeatures = async () => {
      try {
        // Enable content protection on the overlay window
        await getCurrentWindow().setContentProtected(true);
        console.log('Content protection enabled on overlay window');
        
        // Always enable click-through (ignore cursor events)
        await getCurrentWindow().setIgnoreCursorEvents(true);
        console.log('Always click-through enabled on overlay window');
      } catch (error) {
        console.warn('Failed to setup overlay features:', error);
      }
    };
    
    // Set up event listener for real-time message updates
    const setupMessageListener = async () => {
      try {
        const unlisten = await listen<OverlayMessage[]>('overlay-messages-updated', (event) => {
          console.log('Received overlay messages update:', event.payload);
          setMessages(event.payload);
          setIsLoading(false);
        });
        
        // Return cleanup function
        return unlisten;
      } catch (error) {
        console.warn('Failed to setup message listener:', error);
        return () => {};
      }
    };
    
    setupOverlayFeatures();
    
    // Setup message listener and store cleanup function
    let messageUnlisten: (() => void) | null = null;
    setupMessageListener().then(unlisten => {
      messageUnlisten = unlisten;
    });
    
    // Cleanup function
    return () => {
      if (messageUnlisten) {
        messageUnlisten();
      }
    };
  }, []); // Remove dependencies - only run once on mount

  return (
    <div 
      className="fixed inset-0 pointer-events-none"
      style={{ 
        backgroundColor: 'rgba(0, 0, 0, 0)',
        WebkitAppRegion: 'no-drag' 
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
      
      {/* Shortcuts list in top right */}
      <div className="absolute top-4 right-4">
        <div className="bg-black/70 backdrop-blur-xl rounded-lg px-3 py-2 border border-white/20 shadow-xl">
          {activeShortcuts.length > 0 ? (
            <div className="space-y-2">
              {(() => {
                // Group shortcuts by category
                const overlayShortcuts = activeShortcuts.filter(s => s.includes('toggle') && !s.includes('agent'));
                const moveShortcuts = activeShortcuts.filter(s => s.includes('move'));
                const resizeShortcuts = activeShortcuts.filter(s => s.includes('resize'));
                const agentShortcuts = activeShortcuts.filter(s => s.includes('toggle agent'));
                
                const formatKey = (keyPart: string) => keyPart
                  .replace('Cmd+', '⌘')
                  .replace('Alt+', '⌥')
                  .replace('Ctrl+', '^')
                  .replace('Arrow', '')
                  .replace('Up', '↑')
                  .replace('Down', '↓')
                  .replace('Left', '←')
                  .replace('Right', '→')
                  .replace('Shift+', '⇧');
                
                const renderGroup = (shortcuts: string[], groupName: string) => {
                  if (shortcuts.length === 0) return null;
                  
                  if (groupName === 'Move' || groupName === 'Resize') {
                    // Show grouped format for move/resize
                    const baseKey = shortcuts[0]?.split(' ')[0]?.replace(/Arrow(Up|Down|Left|Right)/, '') || '';
                    const formattedBase = formatKey(baseKey);
                    return (
                      <div className="text-white/70 text-xs font-mono">
                        <span className="text-white/90 font-semibold">{formattedBase}↑↓←→</span>
                        <span className="text-white/60 ml-1 font-normal">{groupName}</span>
                      </div>
                    );
                  } else {
                    // Show individual shortcuts for toggle and agents
                    return shortcuts.map((shortcut, index) => {
                      const parts = shortcut.split(' ');
                      const keyPart = parts[0] || '';
                      const descriptionPart = parts.slice(1).join(' ') || '';
                      const formattedKey = formatKey(keyPart);
                      
                      return (
                        <div key={index} className="text-white/70 text-xs font-mono">
                          <span className="text-white/90 font-semibold">{formattedKey}</span>
                          {descriptionPart && !descriptionPart.includes('agent') && (
                            <span className="text-white/60 ml-1 font-normal capitalize">
                              {descriptionPart}
                            </span>
                          )}
                        </div>
                      );
                    });
                  }
                };
                
                return (
                  <>
                    {renderGroup(overlayShortcuts, 'Toggle')}
                    {renderGroup(moveShortcuts, 'Move')}
                    {renderGroup(resizeShortcuts, 'Resize')}
                    {renderGroup(agentShortcuts, 'Agents')}
                  </>
                );
              })()}
            </div>
          ) : (
            <div className="text-white/40 text-xs">No shortcuts</div>
          )}
        </div>
      </div>
    </div>
  );
}
