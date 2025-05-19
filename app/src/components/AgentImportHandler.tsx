import { useState } from 'react';
import { PlusCircle, RotateCw, Sparkles } from 'lucide-react';
import { CompleteAgent } from '@utils/agent_database'; // Fixed import path
import GenerateAgentModal from './GenerateAgentModal';

interface ImportResult {
  filename: string;
  success: boolean;
  agent?: CompleteAgent;
  error?: string;
}

interface AgentImportHandlerProps {
  onAddAgent: () => void;
  agentCount: number;
  activeAgentCount: number;
  isRefreshing: boolean;
  onRefresh: () => void;
}

const AgentImportHandler = ({
  onAddAgent,
  agentCount,
  activeAgentCount,
  isRefreshing,
  onRefresh
}: AgentImportHandlerProps) => {
  const [importStatus] = useState<{ inProgress: boolean; results: ImportResult[] }>({ 
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

  return (
    <>
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
