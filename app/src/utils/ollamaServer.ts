interface ServerResponse {
  status: 'online' | 'offline';
  error?: string;
}

interface Model {
  name: string;
  parameterSize?: string;
  multimodal?: boolean;
}

interface ModelsResponse {
  models: Model[];
  error?: string;
}

export async function checkOllamaServer(host: string, port: string): Promise<ServerResponse> {
  try {
    const response = await fetch(`https://${host}:${port}/api/tags`, {
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
      error: 'Could not connect to Ollama server' 
    };
  }
}

export async function listModels(host: string, port: string): Promise<ModelsResponse> {
  try {
    const response = await fetch(`https://${host}:${port}/api/tags`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });

    if (!response.ok) {
      return { models: [], error: `Server responded with status ${response.status}` };
    }

    const data = await response.json();

    if (!data.models || !Array.isArray(data.models)) {
      return { models: [], error: 'Invalid response format from server' };
    }

    // Map the server response, EXTRACTING the new flag
    const models: Model[] = data.models.map((model: any) => {
      return {
        name: model.name,
        parameterSize: model.details?.parameter_size,
        multimodal: model.details?.multimodal ?? false // <-- EXTRACT AND MAP HERE
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
