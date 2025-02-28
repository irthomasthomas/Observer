import React, { useRef, useState } from 'react';
import { Upload } from 'lucide-react';
import { importAgentsFromFiles } from '@utils/agent_database';
import { Logger } from '@utils/logging';

interface ImportResult {
  filename: string;
  success: boolean;
  error?: string;
}

interface AgentImportHandlerProps {
  onImportComplete: () => Promise<void>;
  setError: React.Dispatch<React.SetStateAction<string | null>>;
}

const AgentImportHandler: React.FC<AgentImportHandlerProps> = ({
  onImportComplete,
  setError
}) => {
  // Reference to the file input element
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [importStatus, setImportStatus] = useState<{
    inProgress: boolean;
    results: ImportResult[];
  }>({ inProgress: false, results: [] });

  // Handle import button click
  const handleImportClick = () => {
    // Clear previous import results
    setImportStatus({ inProgress: false, results: [] });
    
    // Trigger the hidden file input
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
    Logger.info('APP', 'Opening file selector for agent import');
  };

  // Handle file selection for import (moved inside the component so it has access to state and refs)
  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    
    if (!files || files.length === 0) {
      Logger.info('APP', 'No files selected for import');
      return;
    }
    
    Logger.info('APP', `Selected ${files.length} file(s) for import`);
    setImportStatus({ inProgress: true, results: [] });
    
    try {
      setError(null);
      const results = await importAgentsFromFiles(Array.from(files));
      
      setImportStatus({ 
        inProgress: false, 
        results 
      });
      
      const successCount = results.filter(r => r.success).length;
      Logger.info('APP', `Import completed: ${successCount}/${results.length} agents imported successfully`);
      
      if (successCount > 0) {
        await onImportComplete();
      }
      
      const failedImports = results.filter(r => !r.success);
      if (failedImports.length > 0) {
        const errorMessages = failedImports.map(r => `${r.filename}: ${r.error}`).join('; ');
        setError(`Failed to import ${failedImports.length} agent(s): ${errorMessages}`);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(`Import failed: ${errorMessage}`);
      setImportStatus({ inProgress: false, results: [] });
      Logger.error('APP', `Import error: ${errorMessage}`, err);
    }
    
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <>
      {/* Hidden file input for agent import */}
      <input 
        type="file"
        ref={fileInputRef}
        onChange={handleFileSelect}
        accept=".json"
        multiple
        className="hidden"
      />
      
      <div className="flex justify-end mb-4">
        <button
          onClick={handleImportClick}
          className="flex items-center space-x-2 px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600"
          disabled={importStatus.inProgress}
        >
          <Upload className="h-5 w-5" />
          <span>{importStatus.inProgress ? 'Importing...' : 'Import Agents'}</span>
        </button>
      </div>
      
      {/* Import Results */}
      {importStatus.results.length > 0 && (
        <div className="mb-4 p-4 bg-blue-50 rounded-md">
          <h3 className="font-medium mb-2">Import Results:</h3>
          <ul className="list-disc pl-5">
            {importStatus.results.map((result, index) => (
              <li key={index} className={result.success ? 'text-green-600' : 'text-red-600'}>
                {result.filename}: {result.success ? 'Success' : `Failed - ${result.error}`}
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
};

export default AgentImportHandler;
