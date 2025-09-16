import { useEffect } from 'react';
import { Terminal, CheckCircle2, XCircle, LoaderCircle, ArrowRight, ArrowLeft } from 'lucide-react';
import { checkInferenceServer } from '@utils/inferenceServer';

interface LocalServerSetupDialogProps {
  serverStatus: 'unchecked' | 'online' | 'offline';
  setServerStatus: (status: 'unchecked' | 'online' | 'offline') => void;
  onDismiss: () => void;
  onBack: () => void;
}

const LocalServerSetupDialog = ({ 
  serverStatus, 
  setServerStatus, 
  onDismiss, 
  onBack 
}: LocalServerSetupDialogProps) => {
  useEffect(() => {
    const checkStatus = async () => {
      const result = await checkInferenceServer('http://localhost:3838');
      setServerStatus(result.status === 'online' ? 'online' : 'offline');
    };

    const timer = setTimeout(checkStatus, 500);
    return () => clearTimeout(timer);
  }, [setServerStatus]);

  const StatusIcon = {
    online: CheckCircle2,
    offline: XCircle,
    unchecked: LoaderCircle
  }[serverStatus];

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-xl p-6 max-w-lg w-full mx-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Terminal className="h-6 w-6 text-blue-500" />
            <h2 className="text-xl font-semibold">Set Up Local Server</h2>
          </div>
          <button 
            onClick={onBack}
            className="p-1 rounded-md text-gray-500 hover:bg-gray-100"
            aria-label="Go back"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
        </div>

        <p className="text-sm text-gray-600 mb-3">
          Follow these steps to set up your own Observer inference server on your local machine.
        </p>
        
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div className="space-y-1.5 col-span-1">
            <div className="flex items-center gap-2">
              <div className="w-5 h-5 rounded-full bg-blue-100 text-blue-500 flex items-center justify-center flex-shrink-0 text-xs">
                1
              </div>
              <h3 className="font-medium text-gray-900 text-sm">Install Ollama</h3>
            </div>
            <p className="text-xs text-gray-600 ml-7">
              Install Ollama from <a href="https://ollama.com" className="text-blue-500 hover:underline">ollama.com</a>
            </p>
          </div>

          <div className="space-y-1.5 col-span-1">
            <div className="flex items-center gap-2">
              <div className="w-5 h-5 rounded-full bg-blue-100 text-blue-500 flex items-center justify-center flex-shrink-0 text-xs">
                2
              </div>
              <h3 className="font-medium text-gray-900 text-sm">Install Observer-Ollama</h3>
            </div>
            <div className="ml-7 bg-gray-100 p-1 rounded-md font-mono text-xs text-gray-700">
              pip install observer-ollama
            </div>
          </div>

          <div className="space-y-1.5 col-span-1">
            <div className="flex items-center gap-2">
              <div className="w-5 h-5 rounded-full bg-blue-100 text-blue-500 flex items-center justify-center flex-shrink-0 text-xs">
                3
              </div>
              <h3 className="font-medium text-gray-900 text-sm">Run Observer-Ollama</h3>
            </div>
            <div className="ml-7 bg-gray-100 p-1 rounded-md font-mono text-xs text-gray-700">
              observer-ollama
            </div>
          </div>

          <div className="space-y-1.5 col-span-1">
            <div className="flex items-center gap-2">
              <div className="w-5 h-5 rounded-full bg-blue-100 text-blue-500 flex items-center justify-center flex-shrink-0 text-xs">
                4
              </div>
              <h3 className="font-medium text-gray-900 text-sm">Accept Certificates</h3>
            </div>

            <p className="text-xs text-gray-600 ml-7">
                Click the link in terminal:
            </p>
            <div className="ml-7 bg-gray-100 p-1 rounded-md font-mono text-xs text-gray-700">
                https://localhost:3838
            </div>
          </div>

          <div className="space-y-1.5 col-span-2">
            <div className="flex items-center gap-2">
              <div className="w-5 h-5 rounded-full bg-blue-100 text-blue-500 flex items-center justify-center flex-shrink-0 text-xs">
                5
              </div>
              <h3 className="font-medium text-gray-900 text-sm">Connect to Your Server</h3>
            </div>
            <p className="text-xs text-gray-600 ml-7">
              Enter your local inference server address in the field above.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 p-2 rounded-lg bg-gray-50 mb-3">
          <StatusIcon className={`h-5 w-5 ${
            serverStatus === 'online' ? 'text-green-500' :
            serverStatus === 'offline' ? 'text-red-500' : 'text-gray-400 animate-spin'
          }`} />
          <span className="font-medium text-sm">
            {serverStatus === 'online' ? 'Connected successfully' :
             serverStatus === 'offline' ? 'Connection failed' :
             'Checking connection...'}
          </span>
        </div>

        {serverStatus === 'offline' && (
          <div className="p-3 bg-red-50 text-red-700 rounded-lg text-xs mb-3">
            <p className="font-medium">Unable to connect to the Ollama server. Please verify:</p>
            <ul className="list-disc ml-5 mt-1 space-y-0.5">
              <li>Ollama is running on your system</li>
              <li>Run "observer-ollama" in terminal</li>
              <li>Server address is correct</li>
            </ul>
          </div>
        )}

        <div className="flex gap-2">
          <button
            onClick={onBack}
            className="px-3 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors flex items-center justify-center gap-1 font-medium flex-1 text-sm"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </button>
          
          <button
            onClick={onDismiss}
            className="px-3 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors flex items-center justify-center gap-1 font-medium flex-1 text-sm"
          >
            Continue
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default LocalServerSetupDialog;
