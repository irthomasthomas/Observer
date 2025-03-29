import { useRef, useState } from 'react';
import { FileUp, PlusCircle, RotateCw, Sparkles } from 'lucide-react';
import { importAgentsFromFiles } from '@utils/agent_database';
import { Logger } from '@utils/logging';
import GenerateAgentModal from './GenerateAgentModal';
import { CompleteAgent } from '@utils/agent_database'; // Fixed import path

interface ImportResult {
  filename: string;
  success: boolean;
  agent?: CompleteAgent;
  error?: string;
}

interface AgentImportHandlerProps {
  onImportComplete: () => Promise<void>;
  setError: (message: string | null) => void;
  onAddAgent: () => void;
  agentCount: number;
  activeAgentCount: number;
  isRefreshing: boolean;
  onRefresh: () => void;
}

const AgentImportHandler = ({
  onImportComplete,
  setError,
  onAddAgent,
  agentCount,
  activeAgentCount,
  isRefreshing,
  onRefresh
}: AgentImportHandlerProps) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [importStatus, setImportStatus] = useState<{ inProgress: boolean; results: ImportResult[] }>({ 
    inProgress: false, 
    results: [] 
  });
  const [isModalOpen, setIsModalOpen] = useState(false);
  // Unused variable removed
 
  // MAKES EDITING AGENTS UNUSABLE
  //useEffect(() => {
  //  const interval = setInterval(() => {
  //    if (!isRefreshing) {
  //      onRefresh();
  //    }
  //  }, 1000); // Refresh every second
  //  return () => clearInterval(interval); // Cleanup on unmount
  //}, [isRefreshing, onRefresh]); // Dependencies

  const handleImportClick = () => {
    setImportStatus({ inProgress: false, results: [] });
    if (fileInputRef.current) fileInputRef.current.click();
    Logger.info('APP', 'Opening file selector for agent import');
  };

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;
    
    Logger.info('APP', `Selected ${files.length} file(s) for import`);
    setImportStatus({ inProgress: true, results: [] });
    
    try {
      setError(null);
      const results = await importAgentsFromFiles(Array.from(files));
      setImportStatus({ inProgress: false, results });
      
      const successCount = results.filter(r => r.success).length;
      if (successCount > 0) await onImportComplete();
      
      const failedImports = results.filter(r => !r.success);
      if (failedImports.length > 0) {
        setError(`Failed to import ${failedImports.length} agent(s): ${failedImports.map(r => `${r.filename}: ${r.error}`).join('; ')}`);
      }
    } catch (err) {
      const error = err as Error;
      setError(`Import failed: ${error.message || 'Unknown error'}`);
      setImportStatus({ inProgress: false, results: [] });
    }
    
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <>
      <input type="file" ref={fileInputRef} onChange={handleFileSelect} accept=".yaml" multiple className="hidden" />
      
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-2">
          <button onClick={onRefresh} className="p-2 rounded-md hover:bg-gray-100" disabled={isRefreshing} title="Refresh agents">
            <RotateCw className={`h-5 w-5 ${isRefreshing ? 'animate-spin' : ''}`} />
          </button>
          <p className="text-sm font-medium">Active: {activeAgentCount} / Total: {agentCount}</p>
        </div>
        
        <div className="flex items-center space-x-3">
          <button
            onClick={() => {
              setIsModalOpen(true);
            }}
            className="flex items-center space-x-2 px-4 py-2 bg-purple-500 text-white rounded-md hover:bg-purple-600"
          >
            <Sparkles className="h-5 w-5" />
            <span>Generate Agent</span>
          </button>

          <button
            onClick={onAddAgent}
            className="flex items-center space-x-2 px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600"
          >
            <PlusCircle className="h-5 w-5" />
            <span>Create Agent</span>
          </button>
          
          <button
            onClick={handleImportClick}
            className="flex items-center space-x-2 px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600"
            disabled={importStatus.inProgress}
          >
            <FileUp className="h-5 w-5" />
            <span>{importStatus.inProgress ? 'Importing...' : 'Import Agents'}</span>
          </button>
        </div>
      </div>
      
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
      
      <GenerateAgentModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />
    </>
  );
};

export default AgentImportHandler;
