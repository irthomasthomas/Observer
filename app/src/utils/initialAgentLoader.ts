// utils/initialAgentLoader.ts
import { importAgentsFromFiles } from './agent_database';
import { Logger } from './logging';

/**
 * Loads initial agent files from the public directory on startup
 * Only loads agents if the database is empty
 */
export async function loadInitialAgents(isEmpty: boolean): Promise<void> {
  if (!isEmpty) {
    Logger.debug('INIT', 'Database already has agents, skipping initial agent loading');
    return;
  }
  Logger.info('INIT', 'Loading initial agents from public directory');
  
  try {
    // List of default agent files to load (now using YAML extension)
    const defaultAgentFiles = [
      'agent-activity_tracking_agent.yaml',
      'agent-command_tracking_agent.yaml',
      'agent-documentation_agent.yaml',
      'agent-focus_tracker.yaml',
      'agent-memory_summarization.yaml'
    ];
    
    // Fetch each file from the public directory
    const fetchPromises = defaultAgentFiles.map(async (filename) => {
      try {
        const response = await fetch(`/${filename}`);
        
        if (!response.ok) {
          throw new Error(`Failed to fetch ${filename}: ${response.status} ${response.statusText}`);
        }
        
        const blob = await response.blob();
        return new File([blob], filename, { type: 'application/x-yaml' });
      } catch (error) {
        Logger.error('INIT', `Error fetching default agent file ${filename}:`, error);
        return null;
      }
    });
    
    // Wait for all fetches to complete
    const files = (await Promise.all(fetchPromises)).filter(Boolean) as File[];
    
    if (files.length === 0) {
      Logger.warn('INIT', 'No default agent files could be loaded');
      return;
    }
    
    // Import the files into the database
    const results = await importAgentsFromFiles(files);
    
    // Log import results
    const successCount = results.filter(r => r.success).length;
    Logger.info('INIT', `Initial agent loading completed: ${successCount}/${results.length} agents imported successfully`);
    
    // Log any failures
    const failedImports = results.filter(r => !r.success);
    if (failedImports.length > 0) {
      const errorMessages = failedImports.map(r => `${r.filename}: ${r.error}`).join('; ');
      Logger.error('INIT', `Failed to import ${failedImports.length} initial agent(s): ${errorMessages}`);
    }
  } catch (error) {
    Logger.error('INIT', 'Failed to load initial agents:', error);
  }
}
