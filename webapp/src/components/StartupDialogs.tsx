import React from 'react';

// Simple StartupDialogs component that always shows at app startup
const StartupDialogs = ({ serverStatus, onDismiss }) => {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-lg p-6 max-w-md w-full">
        <h2 className="text-xl font-semibold mb-4">Welcome, first check oLlama server</h2>
        
        <div className="mb-6">
          <p className="mb-2">Server status: 
            <span className={`ml-2 font-medium ${
              serverStatus === 'online' ? 'text-green-600' : 
              serverStatus === 'offline' ? 'text-red-600' : 'text-gray-600'
            }`}>
              {serverStatus === 'online' ? 'Connected' : 
               serverStatus === 'offline' ? 'Disconnected' : 
               'Checking...'}
            </span>
          </p>
          
          {serverStatus === 'offline' && (
            <div className="mt-2 p-3 bg-red-50 text-red-700 rounded-md text-sm">
              <p>Unable to connect to the Ollama server. Please make sure:</p>
              <ul className="list-disc ml-5 mt-2">
                <li>Ollama is running on your system</li>
                <li>The server address is correct</li>
                <li>You have the necessary models installed</li>
              </ul>
            </div>
          )}
        </div>
        
        <button
          onClick={onDismiss}
          className="w-full px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600"
        >
          Continue to Observer
        </button>
      </div>
    </div>
  );
};

export default StartupDialogs;
