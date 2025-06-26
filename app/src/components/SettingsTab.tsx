import React, { useState, useRef } from 'react';
import { Settings, TestTube2, Play, Download, Loader2, FileDown, CheckCircle2 } from 'lucide-react';
import { SensorSettings } from '../utils/settings';

// --- REMOVED transcription-related imports from your original file ---
// We now explicitly import them
import { TranscriptionService, TranscriptionChunk } from '../utils/transcriptionService';
import { StreamManager } from '../utils/streamManager'; // Assuming StreamManager is also in utils

import { AVAILABLE_OCR_LANGUAGES } from '../config/ocr-languages';


// --- Interface for Progress Items (NEW) ---
interface ProgressItem {
  file: string;
  progress: number;
  loaded: number;
  total: number;
  status: 'progress' | 'done'; // 'progress' for ongoing, 'done' for completed file
  name?: string; // Model name for the overall process
}


// Reusable Card Component (Your existing component)
const SettingsCard: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div className="bg-white shadow-md rounded-lg mb-6">
    <div className="p-4 border-b">
      <h3 className="text-lg font-semibold flex items-center">
        <Settings className="h-5 w-5 mr-2 text-gray-500" />
        {title}
      </h3>
    </div>
    <div className="p-6">{children}</div>
  </div>
);


const SettingsTab = () => {
  // --- OCR State Management (Existing) ---
  const [ocrLang, setOcrLang] = useState(SensorSettings.getOcrLanguage());
  const [ocrConfidence, setOcrConfidence] = useState(SensorSettings.getOcrConfidenceThreshold());

  // --- OCR Handler Functions (Existing) ---
  const handleOcrLangChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newLang = e.target.value;
    setOcrLang(newLang);
    SensorSettings.setOcrLanguage(newLang);
  };
  
  const handleOcrConfidenceChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newConfidence = parseInt(e.target.value, 10);
    setOcrConfidence(newConfidence);
    SensorSettings.setOcrConfidenceThreshold(newConfidence);
  };
  

  // --- NEW STATE FOR TRANSCRIPTION DIAGNOSTICS ---
  const [isWorkerWarmingUp, setIsWorkerWarmingUp] = useState(false);
  const [isWorkerReady, setIsWorkerReady] = useState(false);
  const [isTestRunning, setIsTestRunning] = useState(false);
  const [auditTrail, setAuditTrail] = useState<TranscriptionChunk[]>([]);
  const [transcriptionService, setTranscriptionService] = useState<TranscriptionService | null>(null);
  
  // Ref for the hidden audio player
  const audioPlayerRef = useRef<HTMLAudioElement>(null);

  // State for tracking model download progress
  const [progressItems, setProgressItems] = useState<ProgressItem[]>([]);
  const [modelNameDuringWarmup, setModelNameDuringWarmup] = useState<string | null>(null);


  // --- NEW HANDLERS FOR TRANSCRIPTION DIAGNOSTICS ---

  const handleWarmup = () => {
    setIsWorkerWarmingUp(true);
    setIsWorkerReady(false);
    setProgressItems([]); // Clear previous progress items
    setModelNameDuringWarmup(null); // Clear previous model name

    // Create a temporary worker just for warming up/downloading the model
    // This worker will be terminated once the model is ready.
    const worker = new Worker(new URL('../utils/transcription.worker.ts', import.meta.url), {
      type: 'module'
    });
    
    worker.onmessage = (event) => {
      const msg = event.data;
      
      switch (msg.status) {
        case 'progress':
          // Update the overall model name if it's the first progress message
          if (!modelNameDuringWarmup && msg.name) {
            setModelNameDuringWarmup(msg.name);
          }
          setProgressItems(prev => {
            const existingItemIndex = prev.findIndex(item => item.file === msg.file);
            if (existingItemIndex !== -1) {
              // Update existing file's progress
              const updatedItems = [...prev];
              updatedItems[existingItemIndex] = { ...msg, status: 'progress' };
              return updatedItems;
            } else {
              // Add new file to track progress
              return [...prev, { ...msg, status: 'progress' }];
            }
          });
          break;

        case 'done':
          // Mark the specific file as done (100% progress)
          setProgressItems(prev => prev.map(item => 
            item.file === msg.file ? { ...item, progress: 100, status: 'done' } : item
          ));
          break;
          
        case 'ready':
          // The pipeline is fully loaded and ready to use
          setIsWorkerWarmingUp(false);
          setIsWorkerReady(true);
          // Give a brief moment for "Done" statuses to be seen before clearing
          setTimeout(() => {
            setProgressItems([]);
          }, 2000); 
          worker.terminate(); // Terminate the temporary worker
          break;

        case 'error':
            console.error("Worker failed to initialize:", msg);
            alert(`Worker failed to initialize: ${msg.message}`);
            setIsWorkerWarmingUp(false);
            worker.terminate(); // Terminate the worker on error
            break;
      }
    };

    // Send an initial message to the worker to trigger model loading.
    // The worker's `PipelineSingleton.getInstance()` will run on any message.
    worker.postMessage(new Float32Array(0));
  };


  const handleToggleTest = async () => {
      if (isTestRunning) {
          // Stop the currently running TranscriptionService instance
          transcriptionService?.stop();
          setTranscriptionService(null);
          setIsTestRunning(false);
          // Release microphone stream managed by StreamManager for this test agent
          StreamManager.releaseStreamsForAgent('system-transcription-test');
      } else {
          // Start a new TranscriptionService instance
          try {
              // Request microphone stream through StreamManager
              await StreamManager.requestStreamsForAgent('system-transcription-test', ['microphone']);
              const state = StreamManager.getCurrentState();
              
              if (state.microphoneStream) {
                  setAuditTrail([]); // Clear previous audit trail results
                  const newService = new TranscriptionService();
                  
                  // Define the callback for when a chunk is processed
                  const onChunkProcessedCallback = (chunk: TranscriptionChunk) => {
                      setAuditTrail(prev => [...prev, chunk].sort((a, b) => a.id - b.id)); // Add new chunk to audit trail
                  };

                  // Start the TranscriptionService with the microphone stream and our callback
                  newService.start(state.microphoneStream, onChunkProcessedCallback);
                  setTranscriptionService(newService);
                  setIsTestRunning(true);
              } else {
                  alert("Could not get microphone stream. Please ensure microphone permissions are granted and available.");
              }
          } catch (error) {
              console.error("Failed to start transcription test:", error);
              alert("Failed to start test. Check console for errors (e.g., microphone permissions denied).");
          }
      }
  };

  // Handler to play an audio chunk from the audit trail
  const playChunk = (blob: Blob) => {
      if (audioPlayerRef.current) {
          const url = URL.createObjectURL(blob);
          audioPlayerRef.current.src = url;
          audioPlayerRef.current.play();
          audioPlayerRef.current.onended = () => {
            URL.revokeObjectURL(url); // Clean up the object URL after playback
          };
      }
  };

  // Handler to download an audio chunk from the audit trail
  const downloadChunk = (blob: Blob, id: number) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `observer_chunk_${id}.webm`; // Assuming MediaRecorder defaults to webm
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url); // Clean up the object URL
  };


  return (
    <div className="space-y-8">
      <h1 className="text-3xl font-bold text-gray-800">Application Settings</h1>

      {/* --- Existing Screen OCR Settings Card --- */}
      <SettingsCard title="Screen OCR Settings">
        <div className="space-y-4">
          <div>
            <label htmlFor="ocr-lang" className="block text-sm font-medium text-gray-700">Recognition Language</label>
            <select id="ocr-lang" value={ocrLang} onChange={handleOcrLangChange} className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md">
            {AVAILABLE_OCR_LANGUAGES.map(lang => <option key={lang.code} value={lang.code}>{lang.label}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="ocr-confidence" className="block text-sm font-medium text-gray-700">Minimum Confidence ({ocrConfidence}%)</label>
            <input type="range" id="ocr-confidence" min="0" max="100" value={ocrConfidence} onChange={handleOcrConfidenceChange} className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer" />
          </div>
        </div>
      </SettingsCard>

      {/* --- NEW Transcription Diagnostics Card --- */}
      <SettingsCard title="Transcription Diagnostics">
        <div className="space-y-6">
          <div className="flex items-center space-x-4">
            <button
              onClick={handleWarmup}
              disabled={isWorkerWarmingUp || isWorkerReady}
              className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center transition-all"
            >
              {isWorkerWarmingUp ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : isWorkerReady ? (
                <CheckCircle2 className="mr-2 h-4 w-4" />
              ) : null}
              {isWorkerWarmingUp ? 'Warming Up...' : isWorkerReady ? 'Worker Ready' : '1. Warm-up Worker'}
            </button>
            <button
              onClick={handleToggleTest}
              disabled={!isWorkerReady || isWorkerWarmingUp} // Disable if worker not ready or still warming up
              className={`px-4 py-2 rounded-md text-white flex items-center ${isTestRunning ? 'bg-red-600 hover:bg-red-700' : 'bg-green-600 hover:bg-green-700'} disabled:bg-gray-400 disabled:cursor-not-allowed transition-all`}
            >
              <TestTube2 className="mr-2 h-4 w-4" />
              {isTestRunning ? 'Stop Live Test' : '2. Start Live Test'}
            </button>
          </div>

          {/* --- Model Loading Progress Section (Visible only when warming up) --- */}
          {isWorkerWarmingUp && (
            <div className="space-y-3 pt-2">
              <h4 className="text-md font-semibold text-gray-700">
                Loading Model:{' '}
                <span className="font-mono bg-gray-100 px-2 py-1 rounded">
                  {modelNameDuringWarmup || '...'}
                </span>
              </h4>
              {progressItems.map((item) => (
                <div key={item.file}>
                  <div className="flex justify-between items-center text-sm mb-1">
                    <span className="text-gray-600 flex items-center">
                        {item.status === 'done' 
                            ? <CheckCircle2 className="h-4 w-4 text-green-500 mr-2"/>
                            : <FileDown className="h-4 w-4 text-gray-400 mr-2"/>
                        }
                        {item.file}
                    </span>
                    <span className="font-medium text-gray-500">
                        {item.status === 'done' ? 'Done' : `${Math.round(item.progress)}%`}
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className={`h-2 rounded-full transition-all duration-300 ${item.status === 'done' ? 'bg-green-500' : 'bg-blue-600'}`}
                      style={{ width: `${item.progress}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* --- Audit Trail Section --- */}
          <div>
            <h4 className="text-md font-semibold text-gray-700 mb-2">Audit Trail</h4>
            <div className="border rounded-lg p-2 bg-gray-50 max-h-96 overflow-y-auto">
                {auditTrail.length === 0 ? (
                    <p className="text-sm text-gray-500 text-center py-4">
                        {isTestRunning ? 'Listening... Speak into your microphone.' : 'Start a live test to see recorded chunks here.'}
                    </p>
                ) : (
                    <div className="space-y-2">
                        {auditTrail.map((chunk) => (
                            <div key={chunk.id} className="bg-white p-3 rounded-md shadow-sm border flex justify-between items-center">
                                <div className="flex-1">
                                    <p className="font-mono text-sm font-semibold">Chunk #{chunk.id}</p>
                                    <p className="text-gray-800 italic mt-1">"{chunk.text || '...'}"</p>
                                </div>
                                <div className="flex items-center space-x-2 ml-4">
                                    <button onClick={() => playChunk(chunk.blob)} title="Play Audio" className="p-2 rounded-full hover:bg-gray-100 text-gray-600"><Play className="h-5 w-5"/></button>
                                    <button onClick={() => downloadChunk(chunk.blob, chunk.id)} title="Download Audio" className="p-2 rounded-full hover:bg-gray-100 text-gray-600"><Download className="h-5 w-5"/></button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
          </div>
          
          {/* Hidden audio player for playback */}
          <audio ref={audioPlayerRef} className="hidden" controls={false}></audio>
        </div>
      </SettingsCard>
    </div>
  );
};

export default SettingsTab;
