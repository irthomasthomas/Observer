// src/components/CommunityTab.tsx
import React, { useState, useEffect, useRef } from 'react';
import { Download, RefreshCw, Info, Upload, AlertTriangle, Edit } from 'lucide-react';
import { saveAgent, CompleteAgent, getAgentCode, getAgentMemory } from '@utils/agent_database';
import { Logger } from '@utils/logging';
import { useAuth0 } from '@auth0/auth0-react';
import EditAgentModal from '@components/EditAgent/EditAgentModal';

// Type for marketplace agents matching CompleteAgent structure
interface MarketplaceAgent {
  id: string;
  name: string;
  description: string;
  model_name: string;
  system_prompt: string;
  loop_interval_seconds: number;
  code: string;
  memory: string;
  author?: string;
  author_id?: string;
  date_added?: string;
}

// Simple type for uploading agents
interface AgentUpload {
  id: string;
  name: string;
  description: string;
  model_name: string;
  system_prompt: string;
  loop_interval_seconds: number;
  code: string;
  memory: string;
  author: string;
  author_id: string;
  date_added: string;
}

const CommunityTab: React.FC = () => {
  const { isAuthenticated: auth0IsAuthenticated, loginWithRedirect, user: auth0User, isLoading } = useAuth0();
  const [agents, setAgents] = useState<MarketplaceAgent[]>([]);
  const [isLoadingAgents, setIsLoadingAgents] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [importing, setImporting] = useState<string | null>(null);
  const [selectedAgent, setSelectedAgent] = useState<MarketplaceAgent | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [myAgents, setMyAgents] = useState<CompleteAgent[]>([]);
  const [selectedUploadAgent, setSelectedUploadAgent] = useState<string | null>(null);
  
  // New state for edit modal
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingAgent, setEditingAgent] = useState<MarketplaceAgent | null>(null);
  
  // File input ref for direct file uploads
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Server URL - update this to your Python backend address
  const SERVER_URL = 'https://api.observer-ai.com';

  // Improved auth state handling
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    // Check localStorage first (for cases where the auth state might not be immediately available)
    const storedAuthState = localStorage.getItem('auth_authenticated') === 'true';
    const storedUser = localStorage.getItem('auth_user');
    
    if (storedAuthState && storedUser) {
      setIsAuthenticated(true);
      setUser(JSON.parse(storedUser));
    }
    
    // Update with Auth0 state when available
    if (!isLoading) {
      if (auth0IsAuthenticated && auth0User) {
        setIsAuthenticated(true);
        setUser(auth0User);
        // Save auth state to localStorage
        localStorage.setItem('auth_authenticated', 'true');
        localStorage.setItem('auth_user', JSON.stringify(auth0User));
      } else if (!storedAuthState) {
        // Only reset if there's no stored auth state
        setIsAuthenticated(false);
        setUser(null);
      }
    }
  }, [auth0IsAuthenticated, auth0User, isLoading]);
  
  const fetchAgents = async () => {
    try {
      setIsLoadingAgents(true);
      setError(null);
      
      const response = await fetch(`${SERVER_URL}/agents`);
      
      if (!response.ok) {
        throw new Error(`Server returned ${response.status}`);
      }
      
      const data = await response.json();
      setAgents(data);
      
      Logger.info('COMMUNITY', `Fetched ${data.length} agents from marketplace`);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(`Failed to fetch community agents: ${errorMessage}`);
      Logger.error('COMMUNITY', `Error fetching marketplace agents: ${errorMessage}`, err);
    } finally {
      setIsLoadingAgents(false);
    }
  };

  // Fetch local agents to allow for uploading
  const fetchMyAgents = async () => {
    try {
      const { listAgents } = await import('@utils/agent_database');
      const agents = await listAgents();
      setMyAgents(agents);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      Logger.error('COMMUNITY', `Error fetching local agents: ${errorMessage}`, err);
    }
  };

  useEffect(() => {
    fetchAgents();
  }, []);

  // Check if the current user is the author of an agent
  const isAuthorOfAgent = (agent: MarketplaceAgent): boolean => {
    if (!isAuthenticated || !user || !agent.author_id) return false;
    return user.sub === agent.author_id;
  };

  const handleImport = async (agent: MarketplaceAgent) => {
    try {
      setError(null);
      setImporting(agent.id);
      Logger.info('COMMUNITY', `Importing agent ${agent.name} (${agent.id})`);
      
      // Prepare agent for local database using CompleteAgent structure
      const localAgent: CompleteAgent = {
        id: agent.id,
        name: agent.name,
        description: agent.description,
        model_name: agent.model_name,
        system_prompt: agent.system_prompt,
        loop_interval_seconds: agent.loop_interval_seconds
      };
      
      // Save to local database
      await saveAgent(localAgent, agent.code);
      
      // Import memory if available
      if (agent.memory) {
        const { updateAgentMemory } = await import('@utils/agent_database');
        await updateAgentMemory(localAgent.id, agent.memory);
      }
      
      Logger.info('COMMUNITY', `Agent ${agent.name} imported successfully`);
      alert(`Agent "${agent.name}" imported successfully!`);
      
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(`Failed to import agent: ${errorMessage}`);
      Logger.error('COMMUNITY', `Error importing agent: ${errorMessage}`, err);
    } finally {
      setImporting(null);
    }
  };

  const viewDetails = (agent: MarketplaceAgent) => {
    setSelectedAgent(agent);
  };

  const closeDetails = () => {
    setSelectedAgent(null);
  };

  // New function to handle edit button click
  const handleEditClick = (agent: MarketplaceAgent) => {
    if (!isAuthenticated) {
      loginWithRedirect();
      return;
    }
    
    setEditingAgent(agent);
    setShowEditModal(true);
  };

  // New function to handle saving edited agent
  const handleSaveEdit = async (completeAgent: CompleteAgent, code: string) => {
    try {
      setIsUploading(true);
      setError(null);
      
      if (!isAuthenticated || !user) {
        throw new Error('You must be logged in to edit agents');
      }
      
      if (!editingAgent) {
        throw new Error('No agent selected for editing');
      }
      
      // Get memory from the editing agent
      const memory = editingAgent.memory || '';
      
      // Prepare agent data for upload, maintaining original ID and author info
      const agentData: AgentUpload = {
        id: editingAgent.id,
        name: completeAgent.name,
        description: completeAgent.description,
        model_name: completeAgent.model_name,
        system_prompt: completeAgent.system_prompt,
        loop_interval_seconds: completeAgent.loop_interval_seconds,
        code,
        memory,
        // Keep original author information
        author: editingAgent.author || user.name || user.email || 'Anonymous User',
        author_id: editingAgent.author_id || user.sub || '',
        date_added: editingAgent.date_added || new Date().toISOString()
      };
      
      // Upload to server (will replace existing agent with same ID)
      await uploadAgentToServer(agentData);
      
      setEditingAgent(null);
      setShowEditModal(false);
      
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(`Failed to update agent: ${errorMessage}`);
      Logger.error('COMMUNITY', `Error updating agent: ${errorMessage}`, err);
    } finally {
      setIsUploading(false);
    }
  };

  const handleUploadClick = () => {
    if (!isAuthenticated) {
      loginWithRedirect();
      return;
    }
    
    fetchMyAgents();
    setShowUploadModal(true);
  };

  const handleFileUploadClick = () => {
    if (!isAuthenticated) {
      loginWithRedirect();
      return;
    }
    
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;
    
    try {
      setIsUploading(true);
      setError(null);
      
      if (!isAuthenticated) {
        throw new Error('You must be logged in to upload agents');
      }
      
      const file = files[0];
      const fileContent = await file.text();
      let agentData: Partial<AgentUpload>;
      
      // Try to parse as JSON first
      try {
        agentData = JSON.parse(fileContent);
      } catch (jsonError) {
        // If JSON fails, try YAML
        try {
          const { load } = await import('js-yaml');
          agentData = load(fileContent) as Partial<AgentUpload>;
        } catch (yamlError) {
          throw new Error('Invalid file format. Must be JSON or YAML.');
        }
      }
      
      // Validate the required fields
      if (!agentData.id || !agentData.name || !agentData.code) {
        throw new Error('Invalid agent file. Missing required fields (id, name, code).');
      }
      
      // Create a proper AgentUpload object with author info
      const fullAgentData: AgentUpload = {
        id: agentData.id,
        name: agentData.name,
        description: agentData.description || '',
        model_name: agentData.model_name || 'unknown',
        system_prompt: agentData.system_prompt || '',
        loop_interval_seconds: agentData.loop_interval_seconds || 10,
        code: agentData.code,
        memory: agentData.memory || '',
        author: '', // Will be filled in uploadAgentToServer
        author_id: '', // Will be filled in uploadAgentToServer
        date_added: '' // Will be filled in uploadAgentToServer
      };
      
      // Send to server
      await uploadAgentToServer(fullAgentData);
      
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(`Failed to upload agent: ${errorMessage}`);
      Logger.error('COMMUNITY', `Error uploading agent: ${errorMessage}`, err);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const uploadAgentToServer = async (agentData: AgentUpload) => {
    try {
      // Make sure we have the author information
      if (!isAuthenticated || !user) {
        throw new Error('You must be logged in to upload agents');
      }
      
      // Add author information to the agent data if not already present
      const enrichedAgentData = {
        ...agentData,
        author: agentData.author || user.name || user.email || 'Anonymous User',
        author_id: agentData.author_id || user.sub || '',
        date_added: agentData.date_added || new Date().toISOString()
      };
      
      const response = await fetch(`${SERVER_URL}/agents`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(enrichedAgentData)
      });
      
      if (!response.ok) {
        throw new Error(`Server returned ${response.status}`);
      }
      
      Logger.info('COMMUNITY', `Agent ${enrichedAgentData.name} uploaded successfully by ${enrichedAgentData.author}`);
      alert(`Agent "${enrichedAgentData.name}" uploaded successfully!`);
      
      // Refresh the agent list
      fetchAgents();
      setShowUploadModal(false);
    } catch (err) {
      throw err;
    }
  };

  const handleExistingAgentUpload = async () => {
    if (!selectedUploadAgent) {
      setError('Please select an agent to upload');
      return;
    }
    
    if (!isAuthenticated) {
      setError('You must be logged in to upload agents');
      return;
    }
    
    try {
      setIsUploading(true);
      setError(null);
      
      // Get agent details
      const agent = myAgents.find(a => a.id === selectedUploadAgent);
      if (!agent) {
        throw new Error('Selected agent not found');
      }
      
      // Get agent code and memory
      const code = await getAgentCode(agent.id);
      if (!code) {
        throw new Error('Agent code not found');
      }
      
      const memory = await getAgentMemory(agent.id);
      
      // Prepare agent data for upload with empty author fields
      // (they will be filled in by uploadAgentToServer)
      const agentData: AgentUpload = {
        id: agent.id,
        name: agent.name,
        description: agent.description,
        model_name: agent.model_name,
        system_prompt: agent.system_prompt,
        loop_interval_seconds: agent.loop_interval_seconds,
        code,
        memory,
        author: '', // Will be filled in uploadAgentToServer
        author_id: '', // Will be filled in uploadAgentToServer
        date_added: '' // Will be filled in uploadAgentToServer
      };
      
      // Upload to server
      await uploadAgentToServer(agentData);
      
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(`Failed to upload agent: ${errorMessage}`);
      Logger.error('COMMUNITY', `Error uploading agent: ${errorMessage}`, err);
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="mt-4">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold">Community Agents</h2>
        <div className="flex items-center space-x-2">
          <button 
            onClick={fetchAgents}
            className="flex items-center space-x-2 px-3 py-2 bg-blue-100 text-blue-700 rounded-md hover:bg-blue-200"
            disabled={isLoadingAgents}
          >
            <RefreshCw className={`h-4 w-4 ${isLoadingAgents ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
          
          <button
            onClick={handleUploadClick}
            className="flex items-center space-x-2 px-3 py-2 bg-green-100 text-green-700 rounded-md hover:bg-green-200"
          >
            <Upload className="h-4 w-4" />
            <span>Upload Agent</span>
          </button>
        </div>
      </div>
      
      {!isAuthenticated && (
        <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-md flex items-center">
          <AlertTriangle className="h-5 w-5 mr-2 text-yellow-500" />
          <p className="text-sm text-yellow-700">
            You need to sign in to upload agents to the community.
          </p>
        </div>
      )}
      
      {error && (
        <div className="mb-4 p-4 bg-red-100 text-red-700 rounded-md">
          {error}
        </div>
      )}
      
      {isLoadingAgents ? (
        <div className="text-center p-8">
          <div className="inline-block animate-spin mr-2">
            <RefreshCw className="h-6 w-6 text-blue-500" />
          </div>
          <span>Loading community agents...</span>
        </div>
      ) : agents.length === 0 ? (
        <div className="text-center p-8 bg-gray-50 rounded-md">
          <p className="text-gray-500">No community agents available</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {agents.map(agent => (
            <div key={agent.id} className="bg-white rounded-lg shadow-md p-4">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold">{agent.name}</h3>
                <div className="flex space-x-2">
                  <button
                    onClick={() => viewDetails(agent)}
                    className="p-2 rounded-md hover:bg-gray-100"
                    title="View details"
                  >
                    <Info className="h-5 w-5" />
                  </button>
                  {isAuthorOfAgent(agent) && (
                    <button
                      onClick={() => handleEditClick(agent)}
                      className="p-2 rounded-md hover:bg-green-100 text-green-600"
                      title="Edit your agent"
                    >
                      <Edit className="h-5 w-5" />
                    </button>
                  )}
                  <button
                    onClick={() => handleImport(agent)}
                    className="p-2 rounded-md hover:bg-blue-100 text-blue-600"
                    title="Import agent"
                    disabled={importing === agent.id}
                  >
                    <Download className={`h-5 w-5 ${importing === agent.id ? 'animate-pulse' : ''}`} />
                  </button>
                </div>
              </div>
              
              <span className="inline-block px-2 py-1 rounded-full text-sm bg-blue-100 text-blue-700">
                Community
              </span>
              
              {isAuthorOfAgent(agent) && (
                <span className="inline-block ml-2 px-2 py-1 rounded-full text-sm bg-green-100 text-green-700">
                  Your Agent
                </span>
              )}
              
              <div className="mt-4">
                <p className="text-sm text-gray-600">
                  Model: {agent.model_name}
                </p>
                <p className="mt-2 text-sm">{agent.description}</p>
                {agent.author && (
                  <p className="mt-1 text-xs text-gray-500">
                    Contributed by: {agent.author}
                    {agent.date_added && (
                      <span> • {new Date(agent.date_added).toLocaleDateString()}</span>
                    )}
                  </p>
                )}
              </div>
              
              <div className="mt-4 flex items-center space-x-4">
                <button
                  onClick={() => handleImport(agent)}
                  className={`px-4 py-2 rounded-md ${
                    importing === agent.id
                      ? 'bg-yellow-500 text-white hover:bg-yellow-600'
                      : 'bg-blue-500 text-white hover:bg-blue-600'
                  }`}
                >
                  {importing === agent.id ? '⏳ Importing...' : '⬇️ Import'}
                </button>

                <div className="text-sm bg-gray-100 px-2 py-1 rounded">
                  {agent.loop_interval_seconds}s
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Hidden file input for agent upload */}
      <input 
        type="file"
        ref={fileInputRef}
        onChange={handleFileSelect}
        accept=".json,.yaml,.yml"
        className="hidden"
      />

      {/* Agent Details Modal */}
      {selectedAgent && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-lg w-3/4 max-w-4xl max-h-3/4 flex flex-col">
            <div className="flex justify-between items-center p-4 border-b">
              <h2 className="text-xl font-semibold">{selectedAgent.name}</h2>
              <button onClick={closeDetails} className="p-1 rounded-full hover:bg-gray-100">
                &times;
              </button>
            </div>
            
            <div className="flex-1 p-4 overflow-auto">
              <div className="mb-4">
                <h3 className="font-medium mb-2">Details</h3>
                <p><strong>ID:</strong> {selectedAgent.id}</p>
                <p><strong>Model:</strong> {selectedAgent.model_name}</p>
                <p><strong>Interval:</strong> {selectedAgent.loop_interval_seconds}s</p>
                <p><strong>Description:</strong> {selectedAgent.description}</p>
                
                {selectedAgent.author && (
                  <div className="mt-2 p-2 bg-blue-50 rounded-md text-sm">
                    <p><strong>Author:</strong> {selectedAgent.author}</p>
                    {selectedAgent.date_added && (
                      <p><strong>Added:</strong> {new Date(selectedAgent.date_added).toLocaleString()}</p>
                    )}
                  </div>
                )}
              </div>
              
              {selectedAgent.system_prompt && (
                <div className="mb-4">
                  <h3 className="font-medium mb-2">System Prompt</h3>
                  <div className="bg-gray-50 p-3 rounded overflow-auto max-h-40 text-sm font-mono">
                    {selectedAgent.system_prompt}
                  </div>
                </div>
              )}
              
              <div className="mb-4">
                <h3 className="font-medium mb-2">Agent Code</h3>
                <div className="bg-gray-50 p-3 rounded overflow-auto max-h-60 text-sm font-mono">
                  <pre>{selectedAgent.code}</pre>
                </div>
              </div>
            </div>
            
            <div className="p-4 border-t flex justify-end space-x-3">
              {isAuthorOfAgent(selectedAgent) && (
                <button
                  onClick={() => {
                    handleEditClick(selectedAgent);
                    closeDetails();
                  }}
                  className="px-4 py-2 rounded-md bg-green-500 text-white hover:bg-green-600"
                >
                  Edit Agent
                </button>
              )}
              <button
                onClick={() => {
                  handleImport(selectedAgent);
                  closeDetails();
                }}
                className="px-4 py-2 rounded-md bg-blue-500 text-white hover:bg-blue-600"
              >
                Import Agent
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Upload Modal */}
      {showUploadModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-lg w-1/2 max-w-lg flex flex-col">
            <div className="flex justify-between items-center p-4 border-b">
              <h2 className="text-xl font-semibold">Upload Agent</h2>
              <button 
                onClick={() => setShowUploadModal(false)} 
                className="p-1 rounded-full hover:bg-gray-100"
              >
                &times;
              </button>
            </div>
            
            <div className="p-4">
              <p className="mb-4 text-sm text-gray-600">
                You can upload one of your agents to the community marketplace. This will make your agent available for others to use.
              </p>
              
              <div className="bg-blue-50 p-3 rounded-md mb-4 text-sm text-blue-700">
                <p><strong>Note:</strong> By uploading an agent, you agree to share it with the community. Your agent will be publicly available.</p>
              </div>
              
              <div className="mb-4">
                <h3 className="font-medium mb-2">Select agent to upload</h3>
                
                <select
                  value={selectedUploadAgent || ''}
                  onChange={(e) => setSelectedUploadAgent(e.target.value || null)}
                  className="w-full p-2 border rounded-md"
                >
                  <option value="">Select an agent...</option>
                  {myAgents.map(agent => (
                    <option key={agent.id} value={agent.id}>
                      {agent.name}
                    </option>
                  ))}
                </select>
              </div>
              
              <div className="flex items-center justify-between">
                <p className="text-sm text-gray-600">
                  - OR -
                </p>
              </div>
              
              <div className="mt-4">
                <button
                  onClick={handleFileUploadClick}
                  className="w-full px-4 py-2 border-2 border-dashed border-gray-300 rounded-md text-gray-500 hover:bg-gray-50 flex items-center justify-center"
                >
                  <Upload className="h-5 w-5 mr-2" />
                  Upload Agent File (.json or .yaml)
                </button>
              </div>
            </div>
            
            <div className="p-4 border-t flex justify-end space-x-3">
              <button
                onClick={() => setShowUploadModal(false)}
                className="px-4 py-2 border rounded-md hover:bg-gray-50"
              >
                Cancel
              </button>
              
              <button
                onClick={handleExistingAgentUpload}
                disabled={!selectedUploadAgent || isUploading}
                className={`px-4 py-2 rounded-md ${
                  !selectedUploadAgent
                    ? 'bg-gray-300 text-gray-500'
                    : isUploading
                      ? 'bg-yellow-500 text-white'
                      : 'bg-blue-500 text-white hover:bg-blue-600'
                }`}
              >
                {isUploading ? 'Uploading...' : 'Upload Agent'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Agent Modal */}
      {showEditModal && editingAgent && (
        <EditAgentModal
          isOpen={showEditModal}
          onClose={() => {
            setShowEditModal(false);
            setEditingAgent(null);
          }}
          createMode={false}
          agent={{
            id: editingAgent.id,
            name: editingAgent.name,
            description: editingAgent.description,
            model_name: editingAgent.model_name,
            system_prompt: editingAgent.system_prompt,
            loop_interval_seconds: editingAgent.loop_interval_seconds
          }}
          code={editingAgent.code}
          onSave={handleSaveEdit}
        />
      )}
    </div>
  );
};

export default CommunityTab;
