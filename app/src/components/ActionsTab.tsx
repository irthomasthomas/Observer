// src/components/ActionsTab.tsx (updated version with fixes)
import React, { useState, useEffect, useRef } from 'react';
import { CompleteAgent, listAgents } from '../utils/agent_database';

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
  
  // Reference to keep track of textareas for auto-resizing
  const textAreaRefs = useRef<(HTMLTextAreaElement | null)[]>([]);
  
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
  
  // Handle dropping a block into the editor
  const handleDrop = (e: React.DragEvent<HTMLTextAreaElement>, blockIndex: number) => {
    e.preventDefault();
    const blockType = e.dataTransfer.getData('blockType');
    const agentId = e.dataTransfer.getData('agentId');
    const agentName = e.dataTransfer.getData('agentName');
    
    if (blockType === 'screen' || blockType === 'memory') {
      // Get the target textarea
      const textarea = e.target as HTMLTextAreaElement;
      const dropPosition = textarea.selectionStart || 0;
      
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
      }
    }
  };
  
  // Handle drag start
  const handleDragStart = (e: React.DragEvent<HTMLDivElement>, blockType: string, agentId?: string, agentName?: string) => {
    e.dataTransfer.setData('blockType', blockType);
    if (agentId) e.dataTransfer.setData('agentId', agentId);
    if (agentName) e.dataTransfer.setData('agentName', agentName);
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
  
  return (
    <div className="flex">
      {/* Left side - System Prompt with blocks */}
      <div className="w-2/3 pr-4">
        <div className="mb-4">
          <label className="block mb-1">System Prompt</label>
          <div 
            className="w-full p-2 border rounded font-mono text-sm bg-white flex flex-wrap min-h-[12rem] overflow-auto"
            onDragOver={(e) => e.preventDefault()}
          >
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
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => handleDrop(e, index)}
                    onClick={(e) => {
                      // Ensure textarea has focus for proper cursor positioning
                      (e.target as HTMLTextAreaElement).focus();
                    }}
                  />
                );
              } else if (block.type === 'block') {
                let bgColor = 'bg-blue-500';
                let label = 'Screen';
                
                if (block.value === 'memory') {
                  bgColor = 'bg-green-500';
                  label = `Memory: ${block.metadata?.agentName || 'Unknown Agent'}`;
                }
                
                return (
                  <span 
                    key={`block-${index}`}
                    className={`${bgColor} text-white px-2 py-1 rounded inline-flex items-center mr-1 my-1`}
                  >
                    {label}
                    <button 
                      className="ml-1 text-white opacity-75 hover:opacity-100"
                      onClick={() => handleRemoveBlock(index)}
                    >
                      ×
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
      <div className="w-1/3 bg-gray-100 p-3 rounded">
        <h3 className="text-lg font-medium mb-3">Available Blocks</h3>
        
        <div className="space-y-4">
          {/* Screen block */}
          <div 
            className="block p-2 bg-blue-500 text-white rounded cursor-grab shadow"
            draggable="true"
            onDragStart={(e) => handleDragStart(e, 'screen')}
          >
            Screen
          </div>
          
          {/* Memory block with dropdown */}
          <div className="relative">
            <div 
              className="block p-2 bg-green-500 text-white rounded cursor-grab shadow"
              onClick={() => setShowAgentDropdown(!showAgentDropdown)}
            >
              Agent Memory
            </div>
            
            {showAgentDropdown && (
              <div className="absolute top-full left-0 mt-1 w-full bg-white border rounded shadow-lg z-10 max-h-40 overflow-y-auto">
                <ul>
                  {availableAgents.length > 0 ? (
                    availableAgents.map(agent => (
                      <li 
                        key={agent.id} 
                        className="p-2 hover:bg-gray-100 cursor-pointer"
                      >
                        <div
                          draggable="true"
                          onDragStart={(e) => handleDragStart(e, 'memory', agent.id, agent.name)}
                          className="w-full cursor-grab"
                        >
                          {agent.name}
                        </div>
                      </li>
                    ))
                  ) : (
                    <li className="p-2 text-gray-500">No agents available</li>
                  )}
                </ul>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ActionsTab;
