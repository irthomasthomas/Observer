// utils/agent_database.ts
// Database utilities for agent management with unified CompleteAgent type

// Unified CompleteAgent Type
export interface CompleteAgent {
  // Agent metadata
  id: string;
  name: string;
  description: string;
  status: 'running' | 'stopped';
  
  // Configuration
  model_name: string;
  system_prompt: string;
  loop_interval_seconds: number;
}

// Database setup
const DB_NAME = 'observer-db';
const DB_VERSION = 1;
const AGENT_STORE = 'agents';
const CONFIG_STORE = 'configs';
const CODE_STORE = 'code';

// Open the database
export async function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    
    // Create the object stores when database is first created
    request.onupgradeneeded = (event) => {
      const db = request.result;
      
      // Store for agent metadata
      if (!db.objectStoreNames.contains(AGENT_STORE)) {
        const agentStore = db.createObjectStore(AGENT_STORE, { keyPath: 'id' });
        agentStore.createIndex('by_status', 'status', { unique: false });
      }
      
      // Store for agent configurations
      if (!db.objectStoreNames.contains(CONFIG_STORE)) {
        db.createObjectStore(CONFIG_STORE, { keyPath: 'id' });
      }
      
      // Store for agent code
      if (!db.objectStoreNames.contains(CODE_STORE)) {
        db.createObjectStore(CODE_STORE, { keyPath: 'id' });
      }
    };
  });
}

// Create or update an agent
export async function saveAgent(
  agent: CompleteAgent,
  code: string
): Promise<CompleteAgent> {
  // Validate agent ID (letters, numbers, underscores only)
  if (!agent.id.match(/^[a-zA-Z0-9_]+$/)) {
    throw new Error('Invalid agent ID. Use only letters, numbers, and underscores.');
  }
  
  const db = await openDB();
  
  // Start a transaction to save all related data
  const tx = db.transaction([AGENT_STORE, CONFIG_STORE, CODE_STORE], 'readwrite');
  
  // Save agent metadata - extract just the metadata fields
  const agentMetadata = {
    id: agent.id,
    name: agent.name,
    description: agent.description,
    status: agent.status
  };
  
  const agentStore = tx.objectStore(AGENT_STORE);
  await new Promise<void>((resolve, reject) => {
    const request = agentStore.put(agentMetadata);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
  
  // Save agent config - extract just the config fields
  const agentConfig = {
    id: agent.id,
    model_name: agent.model_name,
    system_prompt: agent.system_prompt,
    loop_interval_seconds: agent.loop_interval_seconds
  };
  
  const configStore = tx.objectStore(CONFIG_STORE);
  await new Promise<void>((resolve, reject) => {
    const request = configStore.put(agentConfig);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
  
  // Save agent code
  const codeStore = tx.objectStore(CODE_STORE);
  await new Promise<void>((resolve, reject) => {
    const request = codeStore.put({
      id: agent.id,
      code
    });
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
  
  // Complete the transaction
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  
  return agent;
}

// List all agents
export async function listAgents(): Promise<CompleteAgent[]> {
  const db = await openDB();
  
  // First get all agent metadata
  const agentsMetadata = await new Promise<any[]>((resolve, reject) => {
    const tx = db.transaction(AGENT_STORE, 'readonly');
    const store = tx.objectStore(AGENT_STORE);
    const request = store.getAll();
    
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  
  // Then get all configurations
  const configsPromises = agentsMetadata.map(agent => getAgentConfig(agent.id));
  const configs = await Promise.all(configsPromises);
  
  // Combine them into CompleteAgent objects
  return agentsMetadata.map((metadata, index) => {
    const config = configs[index] || {
      model_name: '',
      system_prompt: '',
      loop_interval_seconds: 10.0
    };
    
    return {
      ...metadata,
      ...config
    };
  });
}

// Get a single agent by ID
export async function getAgent(agentId: string): Promise<CompleteAgent | null> {
  const db = await openDB();
  
  // Get the agent metadata
  const agentMetadata = await new Promise<any>((resolve, reject) => {
    const tx = db.transaction(AGENT_STORE, 'readonly');
    const store = tx.objectStore(AGENT_STORE);
    const request = store.get(agentId);
    
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
  
  if (!agentMetadata) {
    return null;
  }
  
  // Get the agent config
  const config = await getAgentConfig(agentId);
  
  // Combine into a CompleteAgent
  return {
    ...agentMetadata,
    ...(config || {
      model_name: '',
      system_prompt: '',
      loop_interval_seconds: 1.0
    })
  };
}

// Get agent configuration (for internal use)
async function getAgentConfig(agentId: string): Promise<{
  model_name: string;
  system_prompt: string;
  loop_interval_seconds: number;
} | null> {
  const db = await openDB();
  
  return new Promise((resolve, reject) => {
    const tx = db.transaction(CONFIG_STORE, 'readonly');
    const store = tx.objectStore(CONFIG_STORE);
    const request = store.get(agentId);
    
    request.onsuccess = () => {
      const result = request.result;
      if (result) {
        // Remove id from the result to get just the config
        const { id, ...configWithoutId } = result;
        resolve(configWithoutId);
      } else {
        resolve(null);
      }
    };
    request.onerror = () => reject(request.error);
  });
}

// Get agent code
export async function getAgentCode(agentId: string): Promise<string | null> {
  const db = await openDB();
  
  return new Promise((resolve, reject) => {
    const tx = db.transaction(CODE_STORE, 'readonly');
    const store = tx.objectStore(CODE_STORE);
    const request = store.get(agentId);
    
    request.onsuccess = () => {
      const result = request.result;
      resolve(result ? result.code : null);
    };
    request.onerror = () => reject(request.error);
  });
}

// Update agent status
export async function updateAgentStatus(agentId: string, status: 'running' | 'stopped'): Promise<CompleteAgent | null> {
  const agent = await getAgent(agentId);
  
  if (!agent) {
    return null;
  }
  
  // Update the status
  agent.status = status;
  
  // Save the updated agent (without changing the code)
  const code = await getAgentCode(agentId) || '';
  await saveAgent(agent, code);
  
  return agent;
}

// Delete an agent
export async function deleteAgent(agentId: string): Promise<void> {
  const db = await openDB();
  
  const tx = db.transaction([AGENT_STORE, CONFIG_STORE, CODE_STORE], 'readwrite');
  
  // Delete from all stores
  await Promise.all([
    new Promise<void>((resolve, reject) => {
      const request = tx.objectStore(AGENT_STORE).delete(agentId);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    }),
    new Promise<void>((resolve, reject) => {
      const request = tx.objectStore(CONFIG_STORE).delete(agentId);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    }),
    new Promise<void>((resolve, reject) => {
      const request = tx.objectStore(CODE_STORE).delete(agentId);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    })
  ]);
  
  // Complete the transaction
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}


// Types for import/export
export interface AgentExport {
  metadata: {
    id: string;
    name: string;
    description: string;
    status: 'running' | 'stopped';
  };
  config: {
    model_name: string;
    system_prompt: string;
    loop_interval_seconds: number;
  };
  code: string;
}

/**
 * Import an agent from a file
 * @param file The JSON file containing the agent data
 * @returns A promise that resolves to the imported agent
 */
export async function importAgentFromFile(file: File): Promise<CompleteAgent> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = async (event) => {
      try {
        // Parse the file content
        const content = event.target?.result as string;
        const agentData = JSON.parse(content) as AgentExport;
        
        // Validate the agent data
        if (!agentData.metadata || !agentData.config || !agentData.code) {
          throw new Error('Invalid agent file format. Missing required sections.');
        }
        
        // Create a complete agent object
        const agent: CompleteAgent = {
          ...agentData.metadata,
          ...agentData.config
        };
        
        // Save the agent to the database
        const savedAgent = await saveAgent(agent, agentData.code);
        resolve(savedAgent);
      } catch (error) {
        reject(error);
      }
    };
    
    reader.onerror = () => reject(new Error('Failed to read the file'));
    
    // Read the file as text
    reader.readAsText(file);
  });
}

/**
 * Import multiple agents from files
 * @param files Array of JSON files containing agent data
 * @returns A promise that resolves to an array of results with success/failure status
 */
export async function importAgentsFromFiles(files: File[]): Promise<Array<{
  filename: string;
  success: boolean;
  agent?: CompleteAgent;
  error?: string;
}>> {
  const results = [];
  
  for (const file of files) {
    try {
      const agent = await importAgentFromFile(file);
      results.push({
        filename: file.name,
        success: true,
        agent
      });
    } catch (error) {
      results.push({
        filename: file.name,
        success: false,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }
  
  return results;
}

/**
 * Export an agent to a JSON file
 * @param agentId The ID of the agent to export
 * @returns A promise that resolves to a Blob containing the agent data
 */
export async function exportAgentToFile(agentId: string): Promise<Blob> {
  // Get the agent
  const agent = await getAgent(agentId);
  if (!agent) {
    throw new Error(`Agent with ID ${agentId} not found`);
  }
  
  // Get the agent code
  const code = await getAgentCode(agentId);
  if (code === null) {
    throw new Error(`Code for agent with ID ${agentId} not found`);
  }
  
  // Create the export object
  const exportData: AgentExport = {
    metadata: {
      id: agent.id,
      name: agent.name,
      description: agent.description,
      status: agent.status
    },
    config: {
      model_name: agent.model_name,
      system_prompt: agent.system_prompt,
      loop_interval_seconds: agent.loop_interval_seconds
    },
    code
  };
  
  // Convert to JSON and create a blob
  const json = JSON.stringify(exportData, null, 2);
  return new Blob([json], { type: 'application/json' });
}

/**
 * Download an agent as a JSON file
 * @param agentId The ID of the agent to download
 */
export async function downloadAgent(agentId: string): Promise<void> {
  try {
    const blob = await exportAgentToFile(agentId);
    
    // Create a download link
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `agent-${agentId}.json`;
    
    // Trigger the download
    document.body.appendChild(a);
    a.click();
    
    // Clean up
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 0);
  } catch (error) {
    console.error('Failed to download agent:', error);
    throw error;
  }
}
