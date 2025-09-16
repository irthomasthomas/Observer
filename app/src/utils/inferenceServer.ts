// src/utils/inferenceServer.ts
interface ServerResponse {
  status: 'online' | 'offline';
  error?: string;
}

export interface Model {
  name: string;
  parameterSize?: string;
  multimodal?: boolean;
  pro?: boolean;
  server: string;
}

// Global state for inference addresses
let inferenceAddresses: string[] = [];

// Global state for models (updated by fetchModels, read by listModels)
let availableModels: Model[] = [];

interface ModelsResponse {
  models: Model[];
  error?: string;
}

// Global state management functions
export function addInferenceAddress(address: string): void {
  if (!inferenceAddresses.includes(address)) {
    inferenceAddresses.push(address);
  }
}

export function removeInferenceAddress(address: string): void {
  inferenceAddresses = inferenceAddresses.filter(addr => addr !== address);
}

export function getInferenceAddresses(): string[] {
  return [...inferenceAddresses];
}

export function clearInferenceAddresses(): void {
  inferenceAddresses = [];
}

export async function checkInferenceServer(address: string): Promise<ServerResponse> {
  try {
    const response = await fetch(`${address}/v1/models`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (response.ok) {
      return { status: 'online' };
    }

    return {
      status: 'offline',
      error: `Server responded with status ${response.status}`
    };
  } catch (error) {
    return {
      status: 'offline',
      error: 'Could not connect to server'
    };
  }
}

async function listModelsFromAddress(address: string): Promise<Model[]> {
  try {
    const response = await fetch(`${address}/v1/models`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });

    if (!response.ok) {
      return [];
    }

    const data = await response.json();
    const modelData = data.data || [];

    if (!Array.isArray(modelData)) {
      return [];
    }

    return modelData.map((model: any) => ({
      name: model.id,
      parameterSize: model.parameter_size,
      multimodal: model.multimodal ?? false,
      pro: model.pro ?? false,
      server: address
    }));
  } catch (error) {
    return [];
  }
}

// Local getter function - returns the current model list
export function listModels(): ModelsResponse {
  return { models: availableModels };
}

// Fetch function - called by AppHeader to update the model list
export async function fetchModels(): Promise<ModelsResponse> {
  try {
    const allModels: Model[] = [];

    for (const address of inferenceAddresses) {
      const models = await listModelsFromAddress(address);
      allModels.push(...models);
    }

    // Update the global state
    availableModels = allModels;

    return { models: allModels };
  } catch (error) {
    return {
      models: [],
      error: `Could not retrieve models: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}
