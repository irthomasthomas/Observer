import React, { useState, useEffect, useRef } from 'react';
import { X, Save, Trash2 } from 'lucide-react';
import { getAgentMemory, updateAgentMemory } from '@utils/agent_database';
import { Logger } from '@utils/logging';

// Create a custom event for memory updates
export const MEMORY_UPDATE_EVENT = 'agent-memory-update';

// Dispatch a memory update event
export function dispatchMemoryUpdate(agentId: string) {
  const event = new CustomEvent(MEMORY_UPDATE_EVENT, { 
    detail: { agentId } 
  });
  window.dispatchEvent(event);
}

interface MemoryManagerProps {
  agentId: string;
  agentName: string;
  isOpen: boolean;
  onClose: () => void;
}

const MemoryManager: React.FC<MemoryManagerProps> = ({ 
  agentId, 
  agentName, 
  isOpen, 
  onClose 
}) => {
  const [memory, setMemory] = useState('');
  const [savedMemory, setSavedMemory] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Polling interval for memory updates (in milliseconds)
  const pollingInterval = 2000;
  const pollingTimer = useRef<number | null>(null);
  
  // Start polling for memory updates when the component is open
  useEffect(() => {
    if (isOpen) {
      // Initial load
      loadMemory();
      
      // Set up polling for updates
      pollingTimer.current = window.setInterval(() => {
        loadMemory(false); // Silent update (no logging for routine checks)
      }, pollingInterval);
      
      // Clean up interval on unmount or when closing
      return () => {
        if (pollingTimer.current !== null) {
          window.clearInterval(pollingTimer.current);
          pollingTimer.current = null;
        }
      };
    }
  }, [isOpen, agentId]);
  
  // Listen for memory update events
  useEffect(() => {
    const handleMemoryUpdate = (event: CustomEvent) => {
      if (event.detail.agentId === agentId && isOpen) {
        loadMemory(false); // Silent update
      }
    };
    
    // Add event listener
    window.addEventListener(MEMORY_UPDATE_EVENT, handleMemoryUpdate as EventListener);
    
    // Clean up
    return () => {
      window.removeEventListener(MEMORY_UPDATE_EVENT, handleMemoryUpdate as EventListener);
    };
  }, [agentId, isOpen]);

  const loadMemory = async (logActivity = true) => {
    try {
      setError(null);
      const agentMemory = await getAgentMemory(agentId);
      
      // Skip update if memory hasn't changed
      if (agentMemory === savedMemory && memory === savedMemory) {
        return;
      }
      
      setMemory(agentMemory);
      setSavedMemory(agentMemory);
      
      if (logActivity) {
        Logger.info(agentId, `Memory loaded (${agentMemory.length} characters)`);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(`Failed to load memory: ${errorMessage}`);
      Logger.error(agentId, `Failed to load memory: ${errorMessage}`, err);
    }
  };

  const handleSave = async () => {
    try {
      setError(null);
      setIsSaving(true);
      await updateAgentMemory(agentId, memory);
      setSavedMemory(memory);
      Logger.info(agentId, `Memory saved (${memory.length} characters)`);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(`Failed to save memory: ${errorMessage}`);
      Logger.error(agentId, `Failed to save memory: ${errorMessage}`, err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleClear = async () => {
    if (window.confirm(`Are you sure you want to clear the memory for agent "${agentName}"?`)) {
      try {
        setError(null);
        setIsClearing(true);
        await updateAgentMemory(agentId, '');
        setMemory('');
        setSavedMemory('');
        Logger.info(agentId, 'Memory cleared');
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        setError(`Failed to clear memory: ${errorMessage}`);
        Logger.error(agentId, `Failed to clear memory: ${errorMessage}`, err);
      } finally {
        setIsClearing(false);
      }
    }
  };

  const hasChanges = memory !== savedMemory;

  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 bg-black bg-opacity-50 flex items-center justify-center">
      <div className="bg-white rounded-lg shadow-lg w-3/4 max-w-4xl h-3/4 flex flex-col">
        <div className="flex justify-between items-center p-4 border-b">
          <h2 className="text-xl font-semibold">Memory Manager: {agentName}</h2>
          <button onClick={onClose} className="p-1 rounded-full hover:bg-gray-100">
            <X className="h-6 w-6" />
          </button>
        </div>

        {error && (
          <div className="m-4 p-3 bg-red-100 text-red-700 rounded-md">
            {error}
          </div>
        )}

        <div className="flex-1 p-4 overflow-hidden">
          <textarea
            value={memory}
            onChange={(e) => setMemory(e.target.value)}
            className="w-full h-full p-3 border rounded-md font-mono resize-none"
            placeholder="Agent memory is empty..."
          />
        </div>

        <div className="p-4 border-t flex justify-between items-center">
          <div className="flex space-x-2">
            <button
              onClick={handleSave}
              disabled={isSaving || !hasChanges}
              className={`px-4 py-2 rounded-md flex items-center space-x-2 ${
                hasChanges ? 'bg-blue-500 text-white hover:bg-blue-600' : 'bg-gray-200 text-gray-500'
              }`}
            >
              <Save className="h-5 w-5" />
              <span>{isSaving ? 'Saving...' : 'Save'}</span>
            </button>
            
            <button
              onClick={handleClear}
              disabled={isClearing || memory.length === 0}
              className={`px-4 py-2 rounded-md flex items-center space-x-2 ${
                memory.length > 0 ? 'bg-red-500 text-white hover:bg-red-600' : 'bg-gray-200 text-gray-500'
              }`}
            >
              <Trash2 className="h-5 w-5" />
              <span>{isClearing ? 'Clearing...' : 'Clear Memory'}</span>
            </button>
          </div>
          
          <div className="text-sm text-gray-500">
            {memory.length} characters
          </div>
        </div>
      </div>
    </div>
  );
};

export default MemoryManager;
