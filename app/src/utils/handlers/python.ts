import { KernelManager, ServerConnection } from '@jupyterlab/services';
import { Logger } from '../logging';
import { getJupyterConfig } from './jupyterConfig';

/**
 * Execute Python code using a Jupyter kernel
 */
export async function executePython(
  response: string,
  agentId: string,
  code: string
): Promise<boolean> {
  Logger.info(agentId, 'Executing Python code');

  const { host, port, token } = getJupyterConfig();
  
  try {
    // Create server settings with token and CORS handling
    const serverSettings = ServerConnection.makeSettings({

      baseUrl: `http://${host}:${port}`,
      wsUrl: `ws://${host}:${port}`,
      token: token,
      init: {
        mode: 'cors',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        }
      }
    });
    
    // Skip connection test - we'll rely on the kernel API
    
    // Create kernel manager with settings
    const kernelManager = new KernelManager({ serverSettings });
    
    // Start a new kernel directly instead of trying to list kernels first
    Logger.info(agentId, 'Starting new kernel');
    const kernel = await kernelManager.startNew({ name: 'python3' });
    Logger.info(agentId, `Started new kernel: ${kernel.id}`);
    
    // We already have a kernel from above
    
    // Prepare code with variables
    const fullCode = `
response = """${response.replace(/"""/g, '\\"\\"\\"')}"""
agentId = "${agentId}"
# User code begins here
${code}
`;
    
    // Execute the code
    Logger.info(agentId, 'Executing code');
    let hasError = false;
    const future = kernel.requestExecute({ code: fullCode });
    
    // Handle messages
    future.onIOPub = (msg) => {
      const msgType = msg.header.msg_type;
      
      if (msgType === 'error') {
        hasError = true;
        Logger.error(agentId, `Python error: ${msg.content.ename}: ${msg.content.evalue}`);
      } else if (msgType === 'stream' && msg.content.name === 'stderr') {
        Logger.warn(agentId, `Python stderr: ${msg.content.text}`);
      } else if (msgType === 'stream' && msg.content.name === 'stdout') {
        Logger.info(agentId, `Python stdout: ${msg.content.text}`);
      }
    };
    
    // Wait for execution to complete
    await future.done;
    Logger.info(agentId, 'Code execution completed');

    await kernel.shutdown()
    
    return !hasError;
  } catch (error) {
    Logger.error(agentId, `Error executing Python: ${error}`);
    return false;
  }
}
