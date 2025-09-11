import React, { useState, useEffect, useRef } from 'react';
import { X, Save, Trash2, Image as ImageIcon, Upload } from 'lucide-react';
import { getAgentMemory, updateAgentMemory, getAgentImageMemory, clearAgentImageMemory, updateAgentImageMemory, appendAgentImageMemory } from '@utils/agent_database';
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
  const [imageMemory, setImageMemory] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [isClearingImages, setIsClearingImages] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Load memory when component opens
  useEffect(() => {
    if (isOpen) {
      loadMemory();
      loadImageMemory();
    }
  }, [isOpen, agentId]);
  
  // Listen for memory update events
  useEffect(() => {
    const handleMemoryUpdate = (event: CustomEvent) => {
      if (event.detail.agentId === agentId && isOpen) {
        loadMemory(false); // Silent update
        loadImageMemory(false); // Also reload image memory
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
      
      setMemory(agentMemory);
      setSavedMemory(agentMemory);
      
      if (logActivity) {
        Logger.debug(agentId, `Memory loaded (${agentMemory.length} characters)`);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(`Failed to load memory: ${errorMessage}`);
      Logger.error(agentId, `Failed to load memory: ${errorMessage}`, err);
    }
  };

  const loadImageMemory = async (logActivity = true) => {
    try {
      const agentImageMemory = await getAgentImageMemory(agentId);
      setImageMemory(agentImageMemory);
      
      if (logActivity) {
        Logger.debug(agentId, `Image memory loaded (${agentImageMemory.length} images)`);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(`Failed to load image memory: ${errorMessage}`);
      Logger.error(agentId, `Failed to load image memory: ${errorMessage}`, err);
    }
  };

  const handleSave = async () => {
    try {
      setError(null);
      setIsSaving(true);
      await updateAgentMemory(agentId, memory);
      setSavedMemory(memory);
      Logger.debug(agentId, `Memory saved (${memory.length} characters)`);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(`Failed to save memory: ${errorMessage}`);
      Logger.error(agentId, `Failed to save memory: ${errorMessage}`, err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleClear = async () => {
    if (window.confirm(`Are you sure you want to clear the text memory for agent "${agentName}"?`)) {
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

  const handleClearImages = async () => {
    if (window.confirm(`Are you sure you want to clear all images for agent "${agentName}"?`)) {
      try {
        setError(null);
        setIsClearingImages(true);
        await clearAgentImageMemory(agentId);
        setImageMemory([]);
        Logger.info(agentId, 'Image memory cleared');
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        setError(`Failed to clear image memory: ${errorMessage}`);
        Logger.error(agentId, `Failed to clear image memory: ${errorMessage}`, err);
      } finally {
        setIsClearingImages(false);
      }
    }
  };

  const handleDeleteImage = async (index: number) => {
    try {
      setError(null);
      const updatedImages = imageMemory.filter((_, i) => i !== index);
      await updateAgentImageMemory(agentId, updatedImages);
      setImageMemory(updatedImages);
      Logger.info(agentId, `Image ${index} deleted`);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(`Failed to delete image: ${errorMessage}`);
      Logger.error(agentId, `Failed to delete image: ${errorMessage}`, err);
    }
  };

  const handleUploadImage = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      setError(null);
      setIsUploading(true);

      // Convert file to base64
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const result = e.target?.result as string;
          // Extract base64 data (remove data:image/...;base64, prefix)
          const base64Data = result.split(',')[1];
          
          // Append to agent's image memory
          await appendAgentImageMemory(agentId, [base64Data]);
          Logger.info(agentId, `Image uploaded (${Math.round(base64Data.length/1024)}KB)`);
          
          // Clear the file input
          if (fileInputRef.current) {
            fileInputRef.current.value = '';
          }
        } catch (err) {
          const errorMessage = err instanceof Error ? err.message : 'Unknown error';
          setError(`Failed to upload image: ${errorMessage}`);
          Logger.error(agentId, `Failed to upload image: ${errorMessage}`, err);
        } finally {
          setIsUploading(false);
        }
      };

      reader.onerror = () => {
        setError('Failed to read image file');
        setIsUploading(false);
      };

      reader.readAsDataURL(file);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(`Failed to upload image: ${errorMessage}`);
      setIsUploading(false);
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

        <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
          {/* Text Memory Section */}
          <div className="w-full md:w-1/2 p-4 border-b md:border-b-0 md:border-r">
            <div className="h-full flex flex-col">
              <h3 className="text-lg font-medium mb-2 flex items-center">
                <span className="mr-2">Text Memory</span>
                <span className="text-sm text-gray-500">({memory.length} characters)</span>
              </h3>
              <textarea
                value={memory}
                onChange={(e) => setMemory(e.target.value)}
                className="flex-1 p-3 border rounded-md font-mono resize-none"
                placeholder="Agent memory is empty..."
              />
              
              <div className="mt-2 flex space-x-2">
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
                  <span>{isClearing ? 'Clearing...' : 'Clear Text'}</span>
                </button>
              </div>
            </div>
          </div>

          {/* Image Memory Section */}
          <div className="w-full md:w-1/2 p-4">
            <div className="h-full flex flex-col">
              <h3 className="text-lg font-medium mb-2 flex items-center">
                <ImageIcon className="h-5 w-5 mr-2" />
                <span>Image Memory</span>
                <span className="text-sm text-gray-500 ml-2">({imageMemory.length} images)</span>
              </h3>
              
              <div className="flex-1 overflow-auto border rounded-md bg-gray-50">
                {imageMemory.length === 0 ? (
                  <div className="p-8 text-center text-gray-500">
                    <ImageIcon className="h-12 w-12 mx-auto mb-2 opacity-50" />
                    <p>No images stored</p>
                  </div>
                ) : (
                  <div className="p-2 grid grid-cols-2 gap-2">
                    {imageMemory.map((image, index) => (
                      <div key={index} className="relative group">
                        <img
                          src={`data:image/png;base64,${image}`}
                          alt={`Memory ${index + 1}`}
                          className="w-full h-24 object-cover rounded border cursor-pointer hover:opacity-75"
                          onClick={() => {
                            // Open image in new tab
                            const newWindow = window.open();
                            if (newWindow) {
                              newWindow.document.write(`<img src="data:image/png;base64,${image}" style="max-width:100%;height:auto;" />`);
                            }
                          }}
                        />
                        <button
                          onClick={() => handleDeleteImage(index)}
                          className="absolute top-1 right-1 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600"
                        >
                          <X className="h-3 w-3" />
                        </button>
                        <div className="absolute bottom-1 left-1 bg-black bg-opacity-75 text-white text-xs px-1 rounded">
                          #{index + 1}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              
              <div className="mt-2 flex space-x-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleUploadImage}
                  className="hidden"
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading}
                  className="px-4 py-2 rounded-md flex items-center space-x-2 bg-blue-500 text-white hover:bg-blue-600 disabled:bg-gray-400"
                >
                  <Upload className="h-5 w-5" />
                  <span>{isUploading ? 'Uploading...' : 'Upload'}</span>
                </button>
                <button
                  onClick={handleClearImages}
                  disabled={isClearingImages || imageMemory.length === 0}
                  className={`px-4 py-2 rounded-md flex items-center space-x-2 ${
                    imageMemory.length > 0 ? 'bg-red-500 text-white hover:bg-red-600' : 'bg-gray-200 text-gray-500'
                  }`}
                >
                  <Trash2 className="h-5 w-5" />
                  <span>{isClearingImages ? 'Clearing...' : 'Clear All'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MemoryManager;
