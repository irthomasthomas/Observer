import React, { useState, useEffect, lazy, Suspense, useRef } from 'react';
import { Terminal, Play, Copy, Info, Check, X, Settings, Code, Zap, ExternalLink, Server } from 'lucide-react';
import { Logger } from '@utils/logging';
import { setJupyterConfig } from '@utils/handlers/JupyterConfig';

// Lazy load CodeMirror component
const LazyCodeMirror = lazy(() => import('@uiw/react-codemirror'));

// Import extensions for supported languages
import { javascript } from '@codemirror/lang-javascript';
import { python } from '@codemirror/lang-python';
import { vscodeDark } from '@uiw/codemirror-theme-vscode';
import { executeTestIteration } from '@utils/main_loop';

// Code snippets collection
const codeSnippets = [
  {
    name: "Write to Memory",
    description: "Store the entire response in agent memory",
    code: 'setMemory(agentId, response);'
  },
  {
    name: "Read/Write Agent Memory",
    description: "Read memory, append timestamped content",
    code: 'setMemory(`${await getMemory()} \\n[${time()}] ${response}`)'
  },
  {
    name: "Remove Thought Tags",
    description: "Clean response by removing <think>...</think> sections",
    code: 'const cleanedResponse = response.replace(/<think>[\\s\\S]*?<\\/think>/g, \'\').trim();'
  }
];

// Python specific snippets
const pythonSnippets = [
  {
    name: "Write to Memory",
    description: "Store the entire response in agent memory",
    code: 'set_memory(agentId, response)'
  },
  {
    name: "Read/Write Agent Memory",
    description: "Read memory, append timestamped content",
    code: 'set_memory(agentId, f"{get_memory()}\\n[{time()}] {response}")'
  },
  {
    name: "Remove Thought Tags",
    description: "Clean response by removing <think>...</think> sections",
    code: 'import re\ncleaned_response = re.sub(r"<think>[\\s\\S]*?</think>", "", response).strip()'
  }
];

interface CodeTabProps {
  agentId: string;
  code: string;
  systemPrompt: string;
  model: string;
  onCodeChange: (code: string) => void;
}

const CodeTab: React.FC<CodeTabProps> = ({ 
  agentId,
  code,
  systemPrompt,
  model,
  onCodeChange
}) => {
  const [selectedCodeSnippet, setSelectedCodeSnippet] = useState<string | null>(null);
  const [editorIsLoaded, setEditorIsLoaded] = useState(false);
  const [isPythonMode, setIsPythonMode] = useState(false);
  
  // Jupyter configuration
  const [jupyterHost, setJupyterHost] = useState<string>('127.0.0.1');
  const [jupyterPort, setJupyterPort] = useState<string>('8888');
  const [jupyterToken, setJupyterToken] = useState<string>('');
  const [jupyterStatus, setJupyterStatus] = useState<'unknown' | 'checking' | 'connected' | 'error'>('unknown');
  const [showJupyterSettings, setShowJupyterSettings] = useState<boolean>(false);
  
  // State for the Run functionality
  const [testResponse, setTestResponse] = useState<string>('');
  const [testResponseVisible, setTestResponseVisible] = useState<boolean>(false);
  const [isRunningModel, setIsRunningModel] = useState<boolean>(false);
  const [isRunningCode, setIsRunningCode] = useState<boolean>(false);
  const [testOutput, setTestOutput] = useState<string>('');
  const testResponseRef = useRef<HTMLTextAreaElement>(null);

  // Set Jupyter config when values change
  useEffect(() => {
    setJupyterConfig(jupyterHost, jupyterPort, jupyterToken);
  }, [jupyterHost, jupyterPort, jupyterToken]);

  // Test Jupyter connection
  const testJupyterConnection = async () => {
    setJupyterStatus('checking');
    setTestOutput('');
    
    try {
      // Simple fetch to test connection
      const url = `http://${jupyterHost}:${jupyterPort}/api/kernels`;
      const response = await fetch(url, {
        headers: {
          'Authorization': `token ${jupyterToken}`
        }
      });
      
      if (response.ok) {
        setJupyterStatus('connected');
        setTestOutput(prev => prev + `✅ Connected to Jupyter server at ${jupyterHost}:${jupyterPort}\n`);
      } else {
        setJupyterStatus('error');
        setTestOutput(prev => prev + `❌ Connection failed: ${response.status} ${response.statusText}\n`);
      }
    } catch (error) {
      setJupyterStatus('error');
      setTestOutput(prev => prev + `❌ Connection error: ${error}\n`);
    }
  };

  // Get code with or without Python header
  const getDisplayCode = () => {
    if (isPythonMode) {
      // If already has the header, return as is
      if (code.trim().startsWith('#python')) {
        return code;
      }
      // Otherwise add the header
      return '#python -- don\'t remove this!\n' + (code || '');
    }
    // For JS mode, strip the Python header if it exists
    if (code.trim().startsWith('#python')) {
      // Just for UI display purposes - will be handled in postProcess
      const jsCode = code.replace(/^\s*#python.*?\n/m, '');
      return jsCode;
    }
    return code;
  };

  // Update internal code with proper header when switching modes
  useEffect(() => {
    const displayCode = getDisplayCode();
    if (displayCode !== code) {
      onCodeChange(displayCode);
    }
    
    // Show Jupyter settings when switching to Python mode
    if (isPythonMode && jupyterStatus === 'unknown') {
      setShowJupyterSettings(true);
    }
  }, [isPythonMode]);

  // Preload editor when component mounts
  useEffect(() => {
    if (!editorIsLoaded) {
      // This will trigger the lazy loading
      import('@uiw/react-codemirror').then(() => {
        setEditorIsLoaded(true);
      });
    }
  }, [editorIsLoaded]);

  // Check if we're in Python mode when code changes
  useEffect(() => {
    if (code && code.trim().startsWith('#python')) {
      setIsPythonMode(true);
    }
  }, [code]);

  const toggleResponseVisible = () => {
    setTestResponseVisible(!testResponseVisible);
    // Focus the textarea when it becomes visible
    if (!testResponseVisible && testResponseRef.current) {
      setTimeout(() => {
        testResponseRef.current?.focus();
      }, 0);
    }
  };
  
  const insertCodeSnippet = (snippetCode: string) => {
    const currentCode = isPythonMode && !code.includes('#python') 
      ? '#python -- don\'t remove this!\n' + (code || '')
      : code;
      
    const newCode = currentCode + (currentCode.endsWith('\n') ? '' : '\n') + snippetCode;
    onCodeChange(newCode);
    setSelectedCodeSnippet(null);
  };
  
  // Switch between JavaScript and Python
  const handleLanguageSwitch = (pythonMode: boolean) => {
    if (pythonMode === isPythonMode) return;
    
    setIsPythonMode(pythonMode);
    setSelectedCodeSnippet(null);
    
    // If switching to Python and there's code, we need to add the header
    if (pythonMode) {
      if (!code.trim().startsWith('#python')) {
        onCodeChange('#python -- don\'t remove this!\n' + (code || ''));
      }
    } else {
      // If switching to JS, remove the Python header
      if (code.trim().startsWith('#python')) {
        onCodeChange(code.replace(/^\s*#python.*?\n/m, ''));
      }
    }
  };
  
  // Run the model to get a response
  const handleRunModel = async () => {
    if (isRunningModel) return;
    
    setIsRunningModel(true);
    setTestOutput('');
    
    try {
      // Log that we're calling the model
      setTestOutput(current => current + `Running ${model || 'deepseek-r1:8b'}...\n`);
      
      // Use the executeTestIteration function
      const response = await executeTestIteration(
        agentId || 'test-agent', 
        systemPrompt,
        model || 'deepseek-r1:8b'
      );
      
      // Update state with the response
      setTestResponse(response);
      setTestResponseVisible(true);
      
      // Also show in output
      setTestOutput(current => current + `Response received (${response.length} chars)\n`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      setTestOutput(current => current + `Error: ${errorMessage}\n`);
      Logger.error(agentId || 'test', `Error executing agent iteration: ${errorMessage}`, error);
    } finally {
      setIsRunningModel(false);
    }
  };

  const handleRunCode = async () => {
    if (isRunningCode || !testResponse) return;
    
    setIsRunningCode(true);
    setTestOutput('');
    
    try {
      // Import the post-processor
      const { postProcess } = await import('@utils/post-processor');
      
      // Create an array to capture logs
      const logs: string[] = [];
      
      // Create a proxy console object to capture logs
      const originalConsole = { ...console };
      const consoleProxy = {
        log: (...args: any[]) => {
          originalConsole.log(...args);
          logs.push(args.map(arg => String(arg)).join(' '));
        },
        error: (...args: any[]) => {
          originalConsole.error(...args);
          logs.push(`ERROR: ${args.map(arg => String(arg)).join(' ')}`);
        },
        warn: (...args: any[]) => {
          originalConsole.warn(...args);
          logs.push(`WARNING: ${args.map(arg => String(arg)).join(' ')}`);
        },
        info: (...args: any[]) => {
          originalConsole.info(...args);
          logs.push(args.map(arg => String(arg)).join(' '));
        }
      };
      
      // Replace console methods with our proxy
      console.log = consoleProxy.log;
      console.error = consoleProxy.error;
      console.warn = consoleProxy.warn;
      console.info = consoleProxy.info;
      
      // Run the post-processor with the current code and response
      const result = await postProcess(agentId || 'test-agent', testResponse, code);
      
      // Add a small delay to ensure all async console logs complete
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Restore original console
      console.log = originalConsole.log;
      console.error = originalConsole.error;
      console.warn = originalConsole.warn;
      console.info = originalConsole.info;
      
      // Update UI with result and captured logs
      setTestOutput(
        `Post-processing ${result ? 'succeeded' : 'completed without specific action'}\n\n` +
        logs.join('\n')
      );
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      setTestOutput(`Error executing code: ${errorMessage}`);
    } finally {
      setIsRunningCode(false);
    }
  };

  return (
    <div className="flex flex-col space-y-4">
      {/* Language Selection Tabs */}
      <div className="flex justify-between items-center mb-1 border-b border-gray-200">
        <div className="flex">
          <button
            onClick={() => handleLanguageSwitch(false)}
            className={`py-2 px-4 text-sm font-medium border-b-2 focus:outline-none ${
              !isPythonMode
                ? 'border-yellow-500 text-yellow-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <span className="flex items-center gap-1.5">
              <Code size={16} />
              JavaScript
            </span>
          </button>
          <button
            onClick={() => handleLanguageSwitch(true)}
            className={`py-2 px-4 text-sm font-medium border-b-2 focus:outline-none ${
              isPythonMode
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <span className="flex items-center gap-1.5">
              <Code size={16} />
              Python
            </span>
          </button>
        </div>
        
        {/* Jupyter Config Button - Only when in Python mode */}
        {isPythonMode && (
          <button
            onClick={() => setShowJupyterSettings(!showJupyterSettings)}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-sm ${
              jupyterStatus === 'connected'
                ? 'text-green-700 bg-green-50 hover:bg-green-100'
                : jupyterStatus === 'error'
                ? 'text-red-700 bg-red-50 hover:bg-red-100'
                : 'text-blue-700 bg-blue-50 hover:bg-blue-100'
            }`}
          >
            {jupyterStatus === 'connected' ? (
              <Check size={14} className="text-green-600" />
            ) : jupyterStatus === 'error' ? (
              <X size={14} className="text-red-600" />
            ) : (
              <Server size={14} className="text-blue-600" />
            )}
            Jupyter {jupyterStatus === 'connected' ? 'Connected' : 'Settings'}
          </button>
        )}
      </div>
      
      {/* Jupyter Configuration Panel */}
      {isPythonMode && showJupyterSettings && (
        <div className="flex items-center p-3 rounded-lg bg-white border border-gray-200 shadow-sm">
          <div className="flex flex-1 items-center gap-3">
            <div className="flex-1">
              <label className="block text-xs font-medium text-gray-700 mb-1">Host</label>
              <input
                type="text"
                value={jupyterHost}
                onChange={(e) => setJupyterHost(e.target.value)}
                className="w-full px-2.5 py-1.5 text-sm border border-gray-300 rounded-md shadow-sm focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                placeholder="127.0.0.1"
              />
            </div>
            <div className="w-24">
              <label className="block text-xs font-medium text-gray-700 mb-1">Port</label>
              <input
                type="text"
                value={jupyterPort}
                onChange={(e) => setJupyterPort(e.target.value)}
                className="w-full px-2.5 py-1.5 text-sm border border-gray-300 rounded-md shadow-sm focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                placeholder="8888"
              />
            </div>
            <div className="flex-1">
              <label className="block text-xs font-medium text-gray-700 mb-1">Token</label>
              <input
                type="password"
                value={jupyterToken}
                onChange={(e) => setJupyterToken(e.target.value)}
                className="w-full px-2.5 py-1.5 text-sm border border-gray-300 rounded-md shadow-sm focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Jupyter server token"
              />
            </div>
          </div>
          <div className="ml-4">
            <button
              onClick={testJupyterConnection}
              disabled={jupyterStatus === 'checking'}
              className={`px-3 py-1.5 rounded-md text-sm font-medium text-white h-9 w-32 flex items-center justify-center ${
                jupyterStatus === 'checking'
                  ? 'bg-gray-400'
                  : jupyterStatus === 'connected'
                  ? 'bg-green-500 hover:bg-green-600'
                  : 'bg-blue-500 hover:bg-blue-600'
              }`}
            >
              {jupyterStatus === 'checking' ? (
                <span className="flex items-center gap-1.5">
                  <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  Testing...
                </span>
              ) : jupyterStatus === 'connected' ? (
                <span className="flex items-center gap-1.5">
                  <Check size={14} />
                  Connected
                </span>
              ) : (
                <span className="flex items-center gap-1.5">
                  <ExternalLink size={14} />
                  Test Connection
                </span>
              )}
            </button>
          </div>
        </div>
      )}
      
      {/* Top Action Bar */}
      <div className="flex justify-between items-center">
        <div className="flex items-center space-x-2">
          {/* Variables */}
          <div className="flex items-center space-x-2">
            <div
              className={`flex items-center px-3 py-1.5 rounded-md cursor-pointer ${
                testResponseVisible ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
              }`}
              onClick={toggleResponseVisible}
            >
              <span className="flex items-center">
                <Info size={14} className="mr-1.5" />
                <span className="text-sm font-medium">response</span>
              </span>
            </div>
            
            <div className="flex items-center px-3 py-1.5 rounded-md text-sm bg-gray-100 text-gray-700">
              <span className="flex items-center">
                <Info size={14} className="mr-1.5" />
                <span className="font-medium">agentId</span>
                <code className="ml-1.5 px-1.5 py-0.5 bg-gray-200 rounded text-xs">{agentId}</code>
              </span>
            </div>
          </div>
        </div>
        
        {/* Run Model Button */}
        <button
          onClick={handleRunModel}
          disabled={isRunningModel}
          className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium text-white ${
            isRunningModel ? 'bg-green-400' : 'bg-green-600 hover:bg-green-700'
          }`}
        >
          {isRunningModel ? (
            <>
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
              Running Model...
            </>
          ) : (
            <>
              <Play size={16} />
              Run Model
            </>
          )}
        </button>
      </div>
      
      {/* Response Viewer */}
      {testResponseVisible && (
        <div className="border rounded-md overflow-hidden bg-white shadow-sm transition-all duration-200">
          <div className="bg-gray-50 px-3 py-2 border-b flex justify-between items-center">
            <span className="font-medium text-gray-700 flex items-center">
              <Terminal size={14} className="mr-1.5" /> 
              Model Response
            </span>
            <span className="text-xs text-gray-500">
              {testResponse.length > 0 ? `${testResponse.length} characters` : 'Empty'}
            </span>
          </div>
          <textarea
            ref={testResponseRef}
            value={testResponse}
            onChange={(e) => setTestResponse(e.target.value)}
            className="w-full p-3 font-mono text-sm bg-gray-50 focus:outline-none focus:bg-white focus:ring-1 focus:ring-blue-500"
            rows={5}
            placeholder="The model response will appear here after running the model..."
          />
        </div>
      )}
      
      {/* Code Editor */}
      <div className="border border-gray-200 rounded-md overflow-hidden shadow-sm bg-white">
        <div className="bg-gray-50 px-3 py-2 border-b flex items-center justify-between">
          <div className="flex items-center">
            <Code size={16} className="text-gray-700 mr-1.5" />
            <span className="text-sm font-medium text-gray-700">
              Agent Code
            </span>
            <span className={`ml-2 text-xs px-2 py-0.5 rounded ${
              isPythonMode 
                ? 'bg-blue-100 text-blue-700'
                : 'bg-yellow-100 text-yellow-700'
            }`}>
              {isPythonMode ? 'Python' : 'JavaScript'}
            </span>
          </div>
          <div className="flex items-center space-x-3">
            {testResponse && (
              <button
                onClick={handleRunCode}
                disabled={isRunningCode}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium text-white ${
                  isRunningCode ? 'bg-blue-400' : 'bg-blue-600 hover:bg-blue-700'
                }`}
              >
                {isRunningCode ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    Executing...
                  </>
                ) : (
                  <>
                    <Zap size={14} />
                    Run Code
                  </>
                )}
              </button>
            )}
            <div className="text-xs text-gray-500 px-2 py-1 bg-gray-100 rounded">
              {code.length.toLocaleString()} chars
            </div>
          </div>
        </div>

        <Suspense fallback={
          <div className="flex flex-col items-center justify-center bg-gray-50 h-80 space-y-4">
            <div className="w-8 h-8 border-4 border-t-blue-500 border-blue-200 rounded-full animate-spin"></div>
            <div>
              <p className="text-gray-600 font-medium">Loading editor...</p>
              <p className="text-xs text-gray-500 text-center">This might take a moment</p>
            </div>
          </div>
        }>
          <LazyCodeMirror
            value={getDisplayCode()}
            height="360px"
            theme={vscodeDark}
            extensions={[
              isPythonMode ? python() : javascript()
            ]}
            onChange={(value) => onCodeChange(value)}
            basicSetup={{
              lineNumbers: true,
              highlightActiveLineGutter: true,
              highlightSpecialChars: true,
              foldGutter: true,
              dropCursor: true,
              allowMultipleSelections: true,
              indentOnInput: true,
              bracketMatching: true,
              closeBrackets: true,
              autocompletion: true,
              rectangularSelection: true,
              crosshairCursor: true,
              highlightActiveLine: true,
              highlightSelectionMatches: true,
              closeBracketsKeymap: true,
              defaultKeymap: true,
              searchKeymap: true,
              historyKeymap: true,
              foldKeymap: true,
              completionKeymap: true,
              lintKeymap: true,
            }}
          />
        </Suspense>
      </div>
      
      {/* Output Display */}
      {testOutput && (
        <div className="border border-gray-200 rounded-md overflow-hidden bg-white shadow-sm">
          <div className="bg-gray-50 px-3 py-2 border-b flex justify-between items-center">
            <span className="font-medium text-gray-700 flex items-center">
              <Terminal size={14} className="mr-1.5" />
              Execution Output
            </span>
            <button 
              onClick={() => setTestOutput('')}
              className="text-xs text-gray-500 hover:text-gray-700"
            >
              Clear
            </button>
          </div>
          <pre className="p-3 font-mono text-sm bg-gray-50 overflow-auto max-h-48 text-gray-800">
            {testOutput}
          </pre>
        </div>
      )}

      {/* Code Snippets Section */}
      <div className="mt-2 border border-gray-200 rounded-md overflow-hidden shadow-sm bg-white">
        <div className="bg-gray-50 px-3 py-2 border-b flex justify-between items-center">
          <span className="font-medium text-gray-700 flex items-center">
            <Copy size={14} className="mr-1.5" />
            Code Snippets
          </span>
          {selectedCodeSnippet ? (
            <div className="flex space-x-2">
              <button 
                onClick={() => setSelectedCodeSnippet(null)}
                className="px-2 py-1 text-xs text-gray-600 bg-gray-200 hover:bg-gray-300 rounded"
              >
                Cancel
              </button>
              <button 
                onClick={() => {
                  const snippets = isPythonMode ? pythonSnippets : codeSnippets;
                  const snippet = snippets.find(s => s.name === selectedCodeSnippet);
                  if (snippet) insertCodeSnippet(snippet.code);
                }}
                className="px-2 py-1 text-xs text-white bg-blue-600 hover:bg-blue-700 rounded flex items-center"
              >
                <Copy size={12} className="mr-1" />
                Insert
              </button>
            </div>
          ) : null}
        </div>
        
        <div className="p-3 grid grid-cols-1 md:grid-cols-3 gap-3">
          {(isPythonMode ? pythonSnippets : codeSnippets).map((snippet) => (
            <div 
              key={snippet.name}
              className={`border rounded-md p-3 cursor-pointer transition-all duration-150 ${
                selectedCodeSnippet === snippet.name 
                  ? 'border-blue-500 bg-blue-50 shadow-sm' 
                  : 'border-gray-200 hover:border-blue-300 hover:bg-gray-50'
              }`}
              onClick={() => setSelectedCodeSnippet(snippet.name === selectedCodeSnippet ? null : snippet.name)}
            >
              <div className="flex justify-between items-start mb-1">
                <h4 className="font-medium text-gray-800">{snippet.name}</h4>
              </div>
              <p className="text-xs text-gray-600 mb-1.5">{snippet.description}</p>
              <div className="text-xs font-mono bg-gray-50 p-1.5 rounded border border-gray-200 truncate">
                {snippet.code.split('\n')[0]}
                {snippet.code.split('\n').length > 1 && '...'}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default CodeTab;
