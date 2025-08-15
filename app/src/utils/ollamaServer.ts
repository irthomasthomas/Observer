// src/utils/ollamaServer.ts
interface ServerResponse {
  status: 'online' | 'offline';
  error?: string;
}

export interface Model {
  name: string;
  parameterSize?: string;
  multimodal?: boolean;
  pro?: boolean;
}

interface ModelsResponse {
  models: Model[];
  error?: string;
}

export async function checkOllamaServer(host: string, port: string): Promise<ServerResponse> {
  try {
    const response = await fetch(`${host}:${port}/v1/models`, {
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

export async function listModels(host: string, port: string): Promise<ModelsResponse> {
  try {
    const response = await fetch(`${host}:${port}/v1/models`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });

    if (!response.ok) {
      return { models: [], error: `Server responded with status ${response.status}` };
    }

    const data = await response.json();

    // if null treat as empty
    const modelData = data.data || [];

    // Now, ensure the result is actually an array before we try to map it.
    if (!Array.isArray(modelData)) {
      return { models: [], error: 'Invalid response format from server: "data" field should be an array or null.' };
    }

    // Map the server response, which is now guaranteed to be an array.
    const models: Model[] = modelData.map((model: any) => {
      return {
        name: model.id,
        parameterSize: model.parameter_size,
        multimodal: model.multimodal ?? false,
        pro: model.pro ?? false
      };
    });


    return { models };
  } catch (error) {
    return {
      models: [],
      error: `Could not retrieve models: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}
