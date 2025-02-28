// src/components/ActionsTab.tsx (with ghost block indicator)
import React, { useState, useEffect, useRef } from 'react';
import { CompleteAgent, listAgents } from '../utils/agent_database';
import { Monitor, Brain, ChevronDown, X } from 'lucide-react';

interface BlockData {
  type: 'text' | 'block';
  value: string;
  metadata?: {
    agentId?: string;
    agentName?: string;
  };
}

interface ActionsTabProps {
  systemPrompt: string;
  onSystemPromptChange: (newPrompt: string) => void;
}

const ActionsTab: React.FC<ActionsTabProps> = ({ 
  systemPrompt, 
  onSystemPromptChange 
}) => {
  // State for available agents
  const [availableAgents, setAvailableAgents] = useState<CompleteAgent[]>([]);
  const [showAgentDropdown, setShowAgentDropdown] = useState(false);
  
  // State for system prompt with blocks
  const [promptBlocks, setPromptBlocks] = useState<BlockData[]>([
    { type: 'text', value: systemPrompt }
  ]);
  
  // State for tracking the current drag operation
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [dragOverTextareaIndex, setDragOverTextareaIndex] = useState<number | null>(null);
  const [dragInfo, setDragInfo] = useState<{
    blockType: string;
    agentName?: string;
    textPosition: number;
    left: number;
    top: number;
  } | null>(null);
  
  // Reference to keep track of textareas for auto-resizing
  const textAreaRefs = useRef<(HTMLTextAreaElement | null)[]>([]);
  const promptContainerRef = useRef<HTMLDivElement>(null);
  
  // Load available agents on component mount
  useEffect(() => {
    const loadAgents = async () => {
      try {
        const agents = await listAgents();
        setAvailableAgents(agents);
      } catch (error) {
        console.error("Failed to load agents:", error);
      }
    };
    
    loadAgents();
  }, []);
  
  // Function to auto-resize textareas
  const adjustTextareaHeight = (textarea: HTMLTextAreaElement | null) => {
    if (!textarea) return;
    
    // Reset height to ensure proper scrollHeight calculation
    textarea.style.height = 'auto';
    
    // Set height to scrollHeight to fit content
    textarea.style.height = `${textarea.scrollHeight}px`;
  };
  
  // Adjust all textareas on render
  useEffect(() => {
    textAreaRefs.current.forEach(textarea => {
      adjustTextareaHeight(textarea);
    });
  }, [promptBlocks]);
  
  // When system prompt changes externally, update our blocks
  useEffect(() => {
    // Parse the system prompt to find existing special tokens
    const screenRegex = /\$SCREEN_OCR/g;
    const memoryRegex = /\$MEMORY@([a-z0-9_]+)/g;
    
    let newBlocks: BlockData[] = [];
    let lastIndex = 0;
    let match;
    
    // Find all $SCREEN_OCR tokens
    while ((match = screenRegex.exec(systemPrompt)) !== null) {
      // Add text before the token
      if (match.index > lastIndex) {
        newBlocks.push({
          type: 'text',
          value: systemPrompt.substring(lastIndex, match.index)
        });
      }
      
      // Add the screen block
      newBlocks.push({
        type: 'block',
        value: 'screen'
      });
      
      lastIndex = match.index + match[0].length;
    }
    
    // Reset regex lastIndex
    memoryRegex.lastIndex = 0;
    
    // Find all $MEMORY@agentId tokens in the remaining text
    let remainingText = systemPrompt.substring(lastIndex);
    lastIndex = 0;
    
    while ((match = memoryRegex.exec(remainingText)) !== null) {
      // Add text before the token
      if (match.index > lastIndex) {
        newBlocks.push({
          type: 'text',
          value: remainingText.substring(lastIndex, match.index)
        });
      }
      
      // Add the memory block
      const agentId = match[1];
      const agent = availableAgents.find(a => a.id === agentId);
      
      newBlocks.push({
        type: 'block',
        value: 'memory',
        metadata: {
          agentId,
          agentName: agent?.name || agentId
        }
      });
      
      lastIndex = match.index + match[0].length;
    }
    
    // Add any remaining text
    if (lastIndex < remainingText.length) {
      newBlocks.push({
        type: 'text',
        value: remainingText.substring(lastIndex)
      });
    }
    
    // If we didn't find any special tokens, just use the system prompt as a single text block
    if (newBlocks.length === 0) {
      newBlocks = [{ type: 'text', value: systemPrompt }];
    }
    
    setPromptBlocks(newBlocks);
  }, [systemPrompt, availableAgents]);
  
  // Convert our block structure back to a plain string for the actual systemPrompt
  useEffect(() => {
    const newPrompt = promptBlocks.map(block => {
      if (block.type === 'text') return block.value;
      if (block.type === 'block') {
        if (block.value === 'screen') return '$SCREEN_OCR';
        if (block.value === 'memory') return `$MEMORY@${block.metadata?.agentId}`;
      }
      return '';
    }).join('');
    
    onSystemPromptChange(newPrompt);
  }, [promptBlocks, onSystemPromptChange]);
  
  // Helper function to get text position from coordinates
  const getTextPositionFromCoords = (textarea: HTMLTextAreaElement, x: number, y: number) => {
    // Create a virtual range to find the text position
    const range = document.caretRangeFromPoint?.(x, y);
    
    if (range && range.startContainer.nodeType === Node.TEXT_NODE && 
        range.startContainer.parentNode === textarea) {
      return range.startOffset;
    }
    
    // Fallback to calculation method (more reliable for textarea)
    const style = window.getComputedStyle(textarea);
    const paddingLeft = parseFloat(style.paddingLeft);
    const paddingTop = parseFloat(style.paddingTop);
    const lineHeight = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.2;
    
    // Adjust coordinates for padding
    const adjustedX = Math.max(0, x - textarea.getBoundingClientRect().left - paddingLeft);
    const adjustedY = Math.max(0, y - textarea.getBoundingClientRect().top - paddingTop);
    
    // Find the line
    const lineIndex = Math.floor(adjustedY / lineHeight);
    
    // Get text content
    const text = textarea.value;
    const lines = text.split('\n');
    
    // Validate line index
    if (lineIndex >= lines.length) {
      return text.length;
    }
    
    // Create a temp element to measure text width
    const temp = document.createElement('span');
    temp.style.font = style.font;
    temp.style.visibility = 'hidden';
    document.body.appendChild(temp);
    
    const currentLine = lines[lineIndex];
    let charPosition = 0;
    
    // Binary search would be more efficient, but this is simpler for now
    for (let i = 0; i <= currentLine.length; i++) {
      temp.textContent = currentLine.substring(0, i);
      if (temp.getBoundingClientRect().width > adjustedX) {
        charPosition = Math.max(0, i - 1);
        break;
      }
      charPosition = i;
    }
    
    document.body.removeChild(temp);
    
    // Calculate final position in the entire text
    let position = 0;
    for (let i = 0; i < lineIndex; i++) {
      position += lines[i].length + 1; // +1 for newline character
    }
    
    position += charPosition;
    return position;
  };
  
  // Add a global type definition for our custom window property
  declare global {
    interface Window {
      draggedBlockType?: string;
      draggedAgentName?: string;
      draggedAgentId?: string;
    }
  }
  
  // Handle drag start
  const handleDragStart = (e: React.DragEvent<HTMLDivElement>, blockType: string, agentId?: string, agentName?: string) => {
    e.dataTransfer.setData('blockType', blockType);
    if (agentId) e.dataTransfer.setData('agentId', agentId);
    if (agentName) e.dataTransfer.setData('agentName', agentName);
    
    // Also store this information on the window object so it's accessible during dragover
    // Some browsers restrict access to dataTransfer during dragover
    window.draggedBlockType = blockType;
    window.draggedAgentId = agentId;
    window.draggedAgentName = agentName;
    
    // Create a custom drag image
    const ghostElement = document.createElement('div');
    ghostElement.className = blockType === 'screen' ? 'bg-blue-500' : 'bg-green-500';
    ghostElement.style.padding = '4px 8px';
    ghostElement.style.borderRadius = '4px';
    ghostElement.style.color = 'white';
    ghostElement.style.fontSize = '12px';
    ghostElement.style.pointerEvents = 'none';
    ghostElement.style.opacity = '0.7';
    ghostElement.innerHTML = blockType === 'screen' ? 'Screen' : `Memory${agentName ? ': ' + agentName : ''}`;
    
    document.body.appendChild(ghostElement);
    
    // Set the ghost image (not fully supported in all browsers)
    try {
      e.dataTransfer.setDragImage(ghostElement, 10, 10);
    } catch (error) {
      console.log('Custom drag image not supported');
    }
    
    // Remove the element after a delay
    setTimeout(() => {
      document.body.removeChild(ghostElement);
    }, 0);
  };
  
  // Handle drag over a textarea
  const handleDragOver = (e: React.DragEvent<HTMLTextAreaElement>, blockIndex: number) => {
    e.preventDefault();
    
    // We can't access getData during dragover in most browsers due to security restrictions
    // So we'll store the drag type on drag start in a shared state variable
    
    // Check if all transferable types include agentId for memory block
    const isMemoryBlock = Array.from(e.dataTransfer.types).some(
      type => type === 'agentid' || type === 'agentId'
    );
    
    const blockType = isMemoryBlock ? 'memory' : 'screen';
    
    setIsDraggingOver(true);
    setDragOverTextareaIndex(blockIndex);
    
    // Get the target textarea
    const textarea = e.currentTarget;
    const rect = textarea.getBoundingClientRect();
    
    // Calculate text position from mouse coordinates
    const textPosition = getTextPositionFromCoords(textarea, e.clientX, e.clientY);
    
    // Calculate position for the ghost block
    const { left, top } = calculateGhostPosition(textarea, textPosition);
    
    // Get agent name if available
    let agentName = 'Agent';
    
    // For memory blocks, try to get agent name from the drag data transfer
    // This may not work in all browsers during dragover
    try {
      if (isMemoryBlock && window.draggedAgentName) {
        // Use the globally stored agent name if available
        agentName = window.draggedAgentName;
      }
    } catch (error) {
      console.log('Error accessing agent name:', error);
    }
    
    // Update drag info
    setDragInfo({
      blockType,
      agentName,
      textPosition,
      left,
      top
    });
    
    // Store this position in a custom property for later use
    // @ts-ignore - Adding custom property
    textarea._lastCursorPosition = textPosition;
    
    // Update textarea cursor position
    textarea.setSelectionRange(textPosition, textPosition);
    textarea.focus();
  };
  
  // Helper function to calculate ghost position
  const calculateGhostPosition = (textarea: HTMLTextAreaElement, textPosition: number) => {
    const text = textarea.value;
    
    // Create a temporary span to measure text
    const span = document.createElement('span');
    span.style.font = window.getComputedStyle(textarea).font;
    span.style.whiteSpace = 'pre-wrap';
    span.style.position = 'absolute';
    span.style.visibility = 'hidden';
    
    // Add the span to the body to measure
    document.body.appendChild(span);
    
    // Get the text before the insertion point
    const textBefore = text.substring(0, textPosition);
    span.textContent = textBefore;
    
    // Calculate text dimensions
    const textWidth = span.offsetWidth;
    const textHeight = span.offsetHeight;
    
    // Remove the span
    document.body.removeChild(span);
    
    // Calculate where to place the ghost relative to the textarea
    const rect = textarea.getBoundingClientRect();
    const style = window.getComputedStyle(textarea);
    const paddingLeft = parseFloat(style.paddingLeft);
    const paddingTop = parseFloat(style.paddingTop);
    
    // Get the lines before the cursor
    const lines = textBefore.split('\n');
    const isLastLine = !text.substring(textPosition).includes('\n');
    
    // Calculate top position
    let top;
    if (lines.length > 0) {
      // Calculate based on line height
      const lineHeight = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.2;
      top = paddingTop + (lines.length - 1) * lineHeight;
    } else {
      top = paddingTop;
    }
    
    // Calculate left position
    let left;
    if (lines.length > 0) {
      const lastLine = lines[lines.length - 1];
      // Create a span to measure just the last line
      span.textContent = lastLine;
      document.body.appendChild(span);
      left = paddingLeft + span.offsetWidth;
      document.body.removeChild(span);
    } else {
      left = paddingLeft;
    }
    
    return { left, top };
  };
  
  // Reset drag state when leaving
  const handleDragLeave = () => {
    setIsDraggingOver(false);
    setDragOverTextareaIndex(null);
    setDragInfo(null);
  };
  
  // Handle dropping a block into the editor
  const handleDrop = (e: React.DragEvent<HTMLTextAreaElement>, blockIndex: number) => {
    e.preventDefault();
    
    // Clear drag state
    setIsDraggingOver(false);
    setDragOverTextareaIndex(null);
    setDragInfo(null);
    
    const blockType = e.dataTransfer.getData('blockType') || window.draggedBlockType;
    const agentId = e.dataTransfer.getData('agentId') || window.draggedAgentId;
    const agentName = e.dataTransfer.getData('agentName') || window.draggedAgentName;
    
    // Clean up the window object
    window.draggedBlockType = undefined;
    window.draggedAgentId = undefined;
    window.draggedAgentName = undefined;
    
    if (blockType === 'screen' || blockType === 'memory') {
      // Get the target textarea
      const textarea = e.target as HTMLTextAreaElement;
      
      // Use the stored position from dragover - more reliable than selectionStart
      // @ts-ignore - Using custom property
      const dropPosition = textarea._lastCursorPosition !== undefined 
        ? textarea._lastCursorPosition 
        : textarea.selectionStart || 0;
      
      const newBlocks = [...promptBlocks];
      const targetBlock = newBlocks[blockIndex];
      
      if (targetBlock && targetBlock.type === 'text') {
        const beforeText = targetBlock.value.substring(0, dropPosition);
        const afterText = targetBlock.value.substring(dropPosition);
        
        // Replace the text block with text before, new block, text after
        newBlocks.splice(blockIndex, 1, 
          { type: 'text', value: beforeText },
          { 
            type: 'block', 
            value: blockType,
            metadata: blockType === 'memory' ? { agentId, agentName } : undefined
          },
          { type: 'text', value: afterText }
        );
        
        setPromptBlocks(newBlocks);
        
        // Focus back on the newly created text element after the block
        setTimeout(() => {
          const newTextAreaIndex = blockIndex + 2; // +2 because we added two new blocks
          if (textAreaRefs.current[newTextAreaIndex]) {
            textAreaRefs.current[newTextAreaIndex]?.focus();
          }
        }, 0);
      }
    }
  };
  
  // Handle removing a block
  const handleRemoveBlock = (blockIndex: number) => {
    const newBlocks = [...promptBlocks];
    
    // If there's text before and after this block, merge them
    if (blockIndex > 0 && 
        newBlocks[blockIndex - 1].type === 'text' && 
        blockIndex + 1 < newBlocks.length && 
        newBlocks[blockIndex + 1].type === 'text') {
      
      newBlocks[blockIndex - 1].value += newBlocks[blockIndex + 1].value;
      newBlocks.splice(blockIndex, 2); // Remove block and text after
    } else {
      newBlocks.splice(blockIndex, 1); // Just remove the block
    }
    
    setPromptBlocks(newBlocks);
  };
  
  // Render the ghost block
  const renderGhostBlock = () => {
    if (!dragInfo) return null;
    
    const isMemory = dragInfo.blockType === 'memory';
    const isScreen = dragInfo.blockType === 'screen';
    
    let bgColor = isScreen ? 'bg-blue-100' : 'bg-green-100';
    let borderColor = isScreen ? 'border-blue-300' : 'border-green-300';
    let textColor = isScreen ? 'text-blue-700' : 'text-green-700';
    let label = isScreen ? 'Screen' : `Memory${dragInfo.agentName ? ': ' + dragInfo.agentName : ''}`;
    
    return (
      <div 
        className={`absolute pointer-events-none ${bgColor} ${textColor} border ${borderColor} 
                   px-2 py-1 rounded inline-flex items-center opacity-70 shadow-sm`}
        style={{
          left: `${dragInfo.left}px`,
          top: `${dragInfo.top}px`,
          zIndex: 10,
          transition: 'all 0.05s ease-out'
        }}
      >
        {isScreen ? (
          <Monitor className="w-4 h-4 mr-1 opacity-60" />
        ) : (
          <Brain className="w-4 h-4 mr-1 opacity-60" />
        )}
        {label}
      </div>
    );
  };
  
  return (
    <div className="flex">
      {/* Left side - System Prompt with blocks */}
      <div className="w-2/3 pr-4">
        <div className="mb-4">
          <label className="block mb-1 font-medium">System Prompt</label>
          <p className="text-sm text-gray-500 mb-2">Drag and drop blocks into your prompt to access special capabilities</p>
          <div 
            className="w-full p-2 border rounded font-mono text-sm bg-white flex flex-wrap min-h-[12rem] overflow-auto relative"
            onDragOver={(e) => e.preventDefault()}
            ref={promptContainerRef}
          >
            {/* Ghost block indicator - shown when dragging over */}
            {isDraggingOver && dragOverTextareaIndex !== null && dragInfo && renderGhostBlock()}
            
            {promptBlocks.map((block, index) => {
              if (block.type === 'text') {
                return (
                  <textarea
                    key={`text-${index}`}
                    ref={(el) => {
                      textAreaRefs.current[index] = el;
                      adjustTextareaHeight(el);
                    }}
                    value={block.value}
                    onChange={(e) => {
                      const newBlocks = [...promptBlocks];
                      newBlocks[index].value = e.target.value;
                      setPromptBlocks(newBlocks);
                      
                      // Adjust height on content change
                      adjustTextareaHeight(e.target);
                    }}
                    className="border-none outline-none resize-none overflow-hidden min-w-[4rem] flex-grow w-full"
                    onInput={(e) => adjustTextareaHeight(e.target as HTMLTextAreaElement)}
                    onDragOver={(e) => handleDragOver(e, index)}
                    onDragLeave={handleDragLeave}
                    onDrop={(e) => handleDrop(e, index)}
                    onClick={(e) => {
                      // Ensure textarea has focus for proper cursor positioning
                      (e.target as HTMLTextAreaElement).focus();
                    }}
                  />
                );
              } else if (block.type === 'block') {
                let bgColor = 'bg-blue-100 border-blue-300';
                let textColor = 'text-blue-700';
                let icon = <Monitor className="w-4 h-4 mr-1" />;
                let label = 'Screen';
                
                if (block.value === 'memory') {
                  bgColor = 'bg-green-100 border-green-300';
                  textColor = 'text-green-700';
                  icon = <Brain className="w-4 h-4 mr-1" />;
                  label = `Memory: ${block.metadata?.agentName || 'Unknown Agent'}`;
                }
                
                return (
                  <span 
                    key={`block-${index}`}
                    className={`${bgColor} ${textColor} border px-2 py-1 rounded inline-flex items-center mr-1 my-1`}
                  >
                    {icon}
                    {label}
                    <button 
                      className="ml-1 hover:bg-gray-200 rounded-full p-0.5"
                      onClick={() => handleRemoveBlock(index)}
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                );
              }
              return null;
            })}
          </div>
        </div>
      </div>
      
      {/* Right side - Block Menu */}
      <div className="w-1/3 bg-gray-100 p-4 rounded">
        <h3 className="text-lg font-medium mb-3">Available Blocks</h3>
        <p className="text-sm text-gray-600 mb-4">Drag these blocks into your system prompt</p>
        
        <div className="space-y-4">
          {/* Screen block */}
          <div 
            className="block p-3 bg-white border border-blue-300 text-blue-700 rounded-lg cursor-grab shadow-sm hover:shadow transition-all duration-200 flex items-center"
            draggable="true"
            onDragStart={(e) => handleDragStart(e, 'screen')}
          >
            <div className="bg-blue-100 p-2 rounded-md mr-3">
              <Monitor className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="font-medium">Screen</p>
              <p className="text-xs text-gray-500">Access screen content via OCR</p>
            </div>
          </div>
          
          {/* Memory block with dropdown */}
          <div className="relative">
            <div 
              className="block p-3 bg-white border border-green-300 text-green-700 rounded-lg shadow-sm hover:shadow transition-all duration-200 flex items-center justify-between cursor-pointer"
              onClick={() => setShowAgentDropdown(!showAgentDropdown)}
            >
              <div className="flex items-center">
                <div className="bg-green-100 p-2 rounded-md mr-3">
                  <Brain className="w-5 h-5 text-green-600" />
                </div>
                <div>
                  <p className="font-medium">Agent Memory</p>
                  <p className="text-xs text-gray-500">Access another agent's memory</p>
                </div>
              </div>
              <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${showAgentDropdown ? 'transform rotate-180' : ''}`} />
            </div>
            
            {showAgentDropdown && (
              <div className="absolute top-full left-0 mt-1 w-full bg-white border rounded-md shadow-lg z-10 max-h-48 overflow-y-auto">
                {availableAgents.length > 0 ? (
                  <ul className="py-1">
                    {availableAgents.map(agent => (
                      <li 
                        key={agent.id} 
                        className="hover:bg-gray-50"
                      >
                        <div
                          draggable="true"
                          onDragStart={(e) => handleDragStart(e, 'memory', agent.id, agent.name)}
                          className="w-full cursor-grab p-2 text-gray-700 flex items-center"
                        >
                          <Brain className="w-4 h-4 mr-2 text-green-500" />
                          {agent.name}
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="p-3 text-gray-500 text-center">
                    <p>No agents available</p>
                    <p className="text-xs">Create agents first</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ActionsTab;
