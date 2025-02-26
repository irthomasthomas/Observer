interface ServerResponse {
  status: 'online' | 'offline';
  error?: string;
}

export async function checkOllamaServer(host: string, port: string): Promise<ServerResponse> {
  try {
    const response = await fetch(`http://${host}:${port}/api/tags`, {
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
