import { useEffect } from 'react';
import { Terminal, CheckCircle2, XCircle, LoaderCircle, ArrowRight } from 'lucide-react';
import { checkOllamaServer } from '@utils/ollamaServer';

interface StartupDialogsProps {
  serverStatus: 'unchecked' | 'online' | 'offline';
  onDismiss: () => void;
  setServerStatus: (status: 'unchecked' | 'online' | 'offline') => void;
}

const StartupDialogs = ({ serverStatus, onDismiss, setServerStatus }: StartupDialogsProps) => {
  useEffect(() => {
    const checkStatus = async () => {
      const result = await checkOllamaServer('localhost', '3838');
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
      <div className="bg-white rounded-xl shadow-xl p-8 max-w-lg w-full mx-4">
        <div className="flex items-center gap-3 mb-6">
          <Terminal className="h-8 w-8 text-blue-500" />
          <h2 className="text-2xl font-semibold">Welcome to Observer</h2>
        </div>

        <div className="space-y-6">
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-full bg-blue-100 text-blue-500 flex items-center justify-center flex-shrink-0 mt-0.5">
                1
              </div>
              <div>
                <h3 className="font-medium text-gray-900">Install Observer-Ollama</h3>
                <div className="mt-1.5 bg-gray-100 p-2 rounded-md font-mono text-sm text-gray-700">
                  pip install observer-ollama
                </div>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-full bg-blue-100 text-blue-500 flex items-center justify-center flex-shrink-0 mt-0.5">
                2
              </div>
              <div>
                <h3 className="font-medium text-gray-900">Accept Local Certificates</h3>
                <p className="mt-1 text-sm text-gray-600">
                  Click the link provided in your terminal to accept the locally-signed certificates. You'll see a URL like:
                </p>
                <div className="mt-1.5 bg-gray-100 p-2 rounded-md font-mono text-sm text-gray-700">
                  ➜ Local: https://localhost:3838/
                </div>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-full bg-blue-100 text-blue-500 flex items-center justify-center flex-shrink-0 mt-0.5">
                3
              </div>
              <div>
                <h3 className="font-medium text-gray-900">Connect to Your Server</h3>
                <p className="mt-1 text-sm text-gray-600">
                  Enter your local inference server address in the field above.
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 p-3 rounded-lg bg-gray-50">
            <StatusIcon className={`h-5 w-5 ${
              serverStatus === 'online' ? 'text-green-500' :
              serverStatus === 'offline' ? 'text-red-500' : 'text-gray-400 animate-spin'
            }`} />
            <span className="font-medium">
              {serverStatus === 'online' ? 'Connected successfully' :
               serverStatus === 'offline' ? 'Connection failed' :
               'Checking connection...'}
            </span>
          </div>

          {serverStatus === 'offline' && (
            <div className="p-4 bg-red-50 text-red-700 rounded-lg text-sm space-y-2">
              <p className="font-medium">Unable to connect to the Ollama server. Please verify:</p>
              <ul className="list-disc ml-5 space-y-1">
                <li>Ollama is running on your system</li>
                <li>The server address is correct</li>
                <li>Required models are installed</li>
              </ul>
            </div>
          )}

          <button
            onClick={onDismiss}
            className="w-full mt-2 px-4 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors flex items-center justify-center gap-2 font-medium"
          >
            Continue to Observer
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default StartupDialogs;
