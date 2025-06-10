import React, { useState, useRef, useEffect, useCallback } from 'react';
import Modal from '@components/EditAgent/Modal';
// --- MODIFIED ---
import { SimpleTool, ToolData } from '@utils/agentTemplateManager';
import { Model, listModels } from '@utils/ollamaServer';
import { getOllamaServerAddress } from '@utils/main_loop';
import { listAgents, CompleteAgent } from '@utils/agent_database';
import {
  Bell, Save, Monitor, Eye, Camera, Clipboard, Mic, Brain, ArrowRight, ArrowLeft, ChevronDown, AlertTriangle, Info, Loader2, CheckCircle2,
  // --- NEW ---
  MessageSquare, Smartphone
} from 'lucide-react';

// --- Reusable Model Selector (for Step 2) ---
interface ModelSelectorProps {
  availableModels: Model[];
  selectedModel: string;
  onSelectModel: (modelName: string) => void;
  loading: boolean;
}
const ModelSelector: React.FC<ModelSelectorProps> = ({ availableModels, selectedModel, onSelectModel, loading }) => {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <div className="relative">
      <button onClick={() => setIsOpen(!isOpen)} disabled={loading} className="w-full p-2 bg-white border-gray-300 rounded-md flex justify-between items-center text-left">
        <span className="truncate">{selectedModel || (loading ? 'Loading…' : 'Select model')}</span>
        <ChevronDown className="h-4 w-4 text-gray-400" />
      </button>
      {isOpen && (
        <div className="absolute z-20 mt-1 w-full max-h-48 bg-white border border-gray-300 rounded-md shadow-lg overflow-y-auto">
          {availableModels.map((m) => (
            <button key={m.name} onClick={() => { onSelectModel(m.name); setIsOpen(false); }} className={`w-full text-left px-3 py-2 text-xs flex justify-between items-center ${selectedModel === m.name ? 'bg-blue-500 text-white' : 'hover:bg-gray-100'}`}>
              <span className="truncate pr-2">{m.name}</span>
              {m.multimodal && <span title="Supports Vision" className={`inline-flex items-center text-xs font-medium px-2 py-0.5 rounded ${selectedModel === m.name ? 'bg-blue-400 text-white' : 'text-purple-600 bg-purple-100'}`}><Eye className="h-3.5 w-3.5 mr-1" />Vision</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

// --- Sensor Highlighting Logic ---
const SENSOR_COLORS: Record<string, string> = {
  SCREEN_OCR: 'text-blue-500 bg-blue-50',
  SCREEN_64: 'text-purple-500 bg-purple-50',
  CAMERA: 'text-purple-500 bg-purple-50',
  CLIPBOARD_TEXT: 'text-slate-500 bg-slate-50',
  MICROPHONE: 'text-red-500 bg-red-50',
};
const highlightPrompt = (text: string) => {
  const parts = text.split(/(\$[A-Z0-9_@]+)/g);
  return parts.map((part, i) => {
    const match = part.match(/^\$([A-Z0-9_@]+)/);
    if (match) {
      const sensorName = match[1].split('@')[0];
      const colorClass = SENSOR_COLORS[sensorName] || 'text-green-500 bg-green-50';
      return <span key={i} className={`rounded px-1 py-0.5 font-medium ${colorClass}`}>{part}</span>;
    }
    return part;
  });
};

// --- Sensor Button Helper ---
const SensorButton = ({ icon: Icon, label, colorClass, onClick }: { icon: React.ElementType, label: string, colorClass?: string, onClick: () => void }) => (
  <button onClick={onClick} className={`flex items-center space-x-2 px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors ${colorClass || 'text-gray-700'}`}>
    <Icon className="h-5 w-5" />
    <span className="text-sm font-medium">{label}</span>
  </button>
);

// --- MAIN WIZARD COMPONENT ---
interface SimpleCreatorModalProps {
  isOpen: boolean; onClose: () => void; onNext: (config: any) => void;
}
const SimpleCreatorModal: React.FC<SimpleCreatorModalProps> = ({ isOpen, onClose, onNext }) => {
  const [step, setStep] = useState(1);
  const [name, setName] = useState('');
  const [agentId, setAgentId] = useState('');
  const [model, setModel] = useState('');
  const [systemPrompt, setSystemPrompt] = useState('');
  
  const [selectedTools, setSelectedTools] = useState<Map<SimpleTool, ToolData>>(new Map());
  const [smsPhoneNumber, setSmsPhoneNumber] = useState('');

  const [conditionEnabled, setConditionEnabled] = useState(false);
  const [conditionKeyword, setConditionKeyword] = useState('');
  
  const [availableModels, setAvailableModels] = useState<Model[]>([]);
  const [existingAgents, setExistingAgents] = useState<CompleteAgent[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const [visionValidationError, setVisionValidationError] = useState<string | null>(null);

  // --- NEW --- State to check if the user is signed in.
  const [isSignedIn, setIsSignedIn] = useState(false);
  
  const promptRef = useRef<HTMLTextAreaElement>(null);

  const resetState = useCallback(() => {
    setStep(1); setName(''); setAgentId(''); setModel(''); setSystemPrompt('');
    // --- MODIFIED ---
    setSelectedTools(new Map());
    setSmsPhoneNumber('');
    setConditionEnabled(false); setConditionKeyword('');
  }, []);

  const fetchInitialData = useCallback(async () => {
    if (!isOpen) return;
    // --- NEW --- Check auth status when the modal opens.
    setIsSignedIn(!!localStorage.getItem("observer_auth_code"));

    setLoadingModels(true);
    try {
      const { host, port } = getOllamaServerAddress();
      const [modelsResponse, agentsResponse] = await Promise.all([listModels(host, port), listAgents()]);
      if (modelsResponse.models) {
        setAvailableModels(modelsResponse.models);
        if (modelsResponse.models.length > 0 && !model) {
          setModel(modelsResponse.models[0].name);
        }
      }
      setExistingAgents(agentsResponse);
    } catch (error) { console.error("Failed to fetch initial data", error); }
    finally { setLoadingModels(false); }
  }, [isOpen, model]);

  useEffect(() => { fetchInitialData(); }, [fetchInitialData]);

  useEffect(() => {
    if (!name) { setAgentId(''); return; }
    let baseId = name.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
    let finalId = baseId;
    let counter = 2;
    const existingIds = new Set(existingAgents.map(a => a.id));
    while (existingIds.has(finalId)) {
      finalId = `${baseId}_${counter++}`;
    }
    setAgentId(finalId);
  }, [name, existingAgents]);

  useEffect(() => {
    const hasVisionSensor = /\$SCREEN_64|\$CAMERA/.test(systemPrompt);
    const selectedModel = availableModels.find(m => m.name === model);
    if (hasVisionSensor && selectedModel && !selectedModel.multimodal) {
      setVisionValidationError("This model may not support images. Please select a 'Vision' model.");
    } else {
      setVisionValidationError(null);
    }
  }, [systemPrompt, model, availableModels]);

  const insertSensor = (tag: string) => {
    const finalTag = tag === '$MEMORY@agent_id' ? `$MEMORY@${agentId || 'your_agent_id'}` : tag;
    if (!promptRef.current) return;
    const { selectionStart, selectionEnd, value } = promptRef.current;
    const newPrompt = `${value.substring(0, selectionStart)} ${finalTag} ${value.substring(selectionEnd)}`;
    setSystemPrompt(newPrompt);
    setTimeout(() => {
      promptRef.current?.focus();
      const newPos = selectionStart + finalTag.length + 2;
      promptRef.current?.setSelectionRange(newPos, newPos);
    }, 0);
  };

  // --- NEW --- A helper function to manage tool selection.
  const toggleTool = (tool: SimpleTool) => {
    setSelectedTools(prev => {
      const newMap = new Map(prev);
      if (newMap.has(tool)) {
        newMap.delete(tool);
      } else {
        // Add tool with its specific initial data if needed
        const initialData: ToolData = tool === 'sms' ? { smsPhoneNumber } : {};
        newMap.set(tool, initialData);
      }
      return newMap;
    });
  };
  
  const handleNext = () => {
    if (step === 3) {
      const config = {
        agentData: { name, id: agentId, model_name: model, system_prompt: systemPrompt },
        // --- MODIFIED --- Pass the entire map
        selectedTools: selectedTools,
        condition: { enabled: conditionEnabled, keyword: conditionKeyword }
      };
      onNext(config);
      resetState();
      onClose();
    } else {
      setStep(s => s + 1);
    }
  };
  
  const handleBack = () => setStep(s => s - 1);
  
  const handleCloseAndReset = () => {
    resetState();
    onClose();
  };

  const isStep1Valid = name && agentId && model;
  const isStep2Valid = systemPrompt.trim() && model;

  return (
    <Modal open={isOpen} onClose={handleCloseAndReset} className="w-full max-w-4xl h-[700px] flex flex-col">
      <div className="p-6 border-b flex-shrink-0">
        <h2 className="text-2xl font-bold text-gray-900">Create a New Agent</h2>
        <p className="text-gray-500 mt-1">Step {step} of 3: {step === 1 ? 'Setup' : step === 2 ? 'Prompt' : 'Tools'}</p>
      </div>
      
      <div className="flex-grow relative overflow-hidden">
        <div className="absolute inset-0 flex transition-transform duration-300 ease-in-out" style={{ transform: `translateX(-${(step - 1) * 100}%)` }}>
          {/* --- Step 1: Redesigned & Responsive Setup --- */}
          <div className="w-full flex-shrink-0 p-8 grid grid-cols-1 md:grid-cols-2 gap-8 overflow-y-auto">
            <div className="space-y-6">
              <h3 className="text-xl font-semibold text-gray-800">1. Name Your Agent</h3>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Agent Name</label>
                <input value={name} onChange={(e) => setName(e.target.value)} className="w-full p-3 bg-white border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500" placeholder="My Screen Watcher" autoFocus/>
                {agentId && <p className="text-xs text-gray-500 mt-2">ID: <span className="font-mono bg-gray-100 px-1.5 py-0.5 rounded-md">{agentId}</span></p>}
              </div>
            </div>
            <div className="space-y-6 flex flex-col">
              <h3 className="text-xl font-semibold text-gray-800">2. Choose a Model</h3>
              <div className="flex-grow border border-gray-200 rounded-lg bg-gray-50 p-3 overflow-y-auto">
                {loadingModels && <div className="p-4 text-center text-gray-500 flex items-center justify-center h-full"><Loader2 className="h-5 w-5 mr-2 animate-spin"/>Loading...</div>}
                <div className="flex flex-wrap gap-2">
                    {!loadingModels && availableModels.map((m) => (
                        <button key={m.name} onClick={() => setModel(m.name)} className={`relative group px-3 py-2 rounded-md border text-sm font-medium flex items-center space-x-2 transition-all duration-150 ${model === m.name ? 'bg-blue-600 text-white border-blue-600 shadow-md' : 'bg-white text-gray-700 border-gray-300 hover:border-blue-400'}`}>
                            {model === m.name && <CheckCircle2 className="h-4 w-4" />}
                            <span className="truncate">{m.name}</span>
                            {m.multimodal && (<span title="Vision Model"><Eye className="h-4 w-4 text-purple-400 group-hover:text-purple-500" /></span>)}
                        </button>
                    ))}
                </div>
              </div>
            </div>
          </div>

          {/* --- Step 2: Prompt & Sensors --- */}
          <div className="w-full flex-shrink-0 p-8 flex flex-col overflow-y-auto">
            <h3 className="text-xl font-semibold text-gray-800 mb-4">Prompt & Sensors</h3>
            <div className="relative flex-grow min-h-[250px]">
              <div className="absolute inset-0 p-4 font-mono text-sm whitespace-pre-wrap pointer-events-none leading-relaxed" aria-hidden="true">{highlightPrompt(systemPrompt)}</div>
              <textarea ref={promptRef} value={systemPrompt} onChange={(e) => setSystemPrompt(e.target.value)} className="w-full h-full p-4 bg-transparent text-transparent caret-blue-500 border border-gray-300 rounded-lg font-mono text-sm resize-none focus:ring-2 focus:ring-blue-500 leading-relaxed" placeholder="e.g., Look at the screen for 'ERROR'..." />
            </div>
            <div className="flex flex-wrap gap-2 mt-4">
              <SensorButton icon={Monitor} label="Screen Text" onClick={() => insertSensor('$SCREEN_OCR')} />
              <SensorButton icon={Eye} label="Screen Image" onClick={() => insertSensor('$SCREEN_64')} colorClass="text-purple-600" />
              <SensorButton icon={Camera} label="Camera" onClick={() => insertSensor('$CAMERA')} colorClass="text-purple-600" />
              <SensorButton icon={Clipboard} label="Clipboard" onClick={() => insertSensor('$CLIPBOARD_TEXT')} />
              <SensorButton icon={Mic} label="Microphone" onClick={() => insertSensor('$MICROPHONE')} />
              <SensorButton icon={Brain} label="Memory" onClick={() => insertSensor('$MEMORY@agent_id')} />
            </div>
            {visionValidationError && <div className="mt-2 p-2 bg-yellow-50 rounded-md flex items-center text-xs text-yellow-800"><AlertTriangle className="h-4 w-4 mr-2 flex-shrink-0" />{visionValidationError}</div>}
            {systemPrompt.includes('$SCREEN_OCR') && <div className="mt-2 p-2 bg-blue-50 rounded-md flex items-center text-xs text-blue-800"><Info className="h-4 w-4 mr-2 flex-shrink-0" />OCR adds ~15s to each agent loop.</div>}
            <div className="mt-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">Change Model</label>
              <ModelSelector availableModels={availableModels} selectedModel={model} onSelectModel={setModel} loading={loadingModels} />
            </div>
          </div>
          {/* --- Step 3: Tools (MODIFIED) --- */}
            <div className="w-full flex-shrink-0 p-8 space-y-6 overflow-y-auto">
              <div>
                <h3 className="text-xl font-semibold text-gray-800">Choose Your Tools</h3>
                <p className="text-gray-600 mt-1">What should happen with the model's response?</p>
              </div>
              
              <div className="p-1 bg-gray-200 rounded-lg flex"><button onClick={() => setConditionEnabled(false)} className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${!conditionEnabled ? 'bg-white text-blue-600 shadow' : 'text-gray-600 hover:bg-gray-300'}`}>Always Trigger</button><button onClick={() => setConditionEnabled(true)} className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${conditionEnabled ? 'bg-white text-blue-600 shadow' : 'text-gray-600 hover:bg-gray-300'}`}>On Keyword</button></div>

              {conditionEnabled && (
              <div className="transition-all">
                <label className="block text-sm font-medium text-gray-700 mb-1">Trigger Condition</label>
                <div className="flex items-center bg-white border border-gray-300 rounded-lg p-3 transition-all focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-blue-500">
                  <span className="font-semibold text-gray-800 pr-3">If</span>
                  <input 
                    value={conditionKeyword} 
                    onChange={(e) => setConditionKeyword(e.target.value)} 
                    className="flex-grow bg-gray-50 border border-gray-300 rounded-md p-2 text-center text-sm focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="your keyword"
                  />
                  <span className="text-gray-500 px-3">in</span>
                  <code className="bg-gray-100 text-blue-600 font-mono text-sm px-3 py-2 rounded-md">
                    response
                  </code>
                </div>
              </div>
            )}

              {/* --- FIX 1: Responsive Horizontal Layout --- */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {/* Notification Tool */}
                <button type="button" onClick={() => toggleTool('notification')} className={`group flex items-center space-x-4 p-4 border-2 rounded-lg text-left transition-all ${selectedTools.has('notification') ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-gray-400'}`}><Bell className={`h-8 w-8 transition-colors ${selectedTools.has('notification') ? 'text-blue-500' : 'text-gray-400 group-hover:text-gray-600'}`} /><div><h3 className="font-semibold text-gray-900">Send a Notification</h3><p className="text-sm text-gray-500">Sends the model's response as a desktop alert.</p></div></button>
                
                {/* Memory Tool */}
                <button type="button" onClick={() => toggleTool('memory')} className={`group flex items-center space-x-4 p-4 border-2 rounded-lg text-left transition-all ${selectedTools.has('memory') ? 'border-green-500 bg-green-50' : 'border-gray-300 hover:border-gray-400'}`}><Save className={`h-8 w-8 transition-colors ${selectedTools.has('memory') ? 'text-green-500' : 'text-gray-400 group-hover:text-gray-600'}`} /><div><h3 className="font-semibold text-gray-900">Save to Memory</h3><p className="text-sm text-gray-500">Appends the model's response to this agent's memory.</p></div></button>
                
                {/* --- FIX 2: Bug Fix and Tooltip Simplification --- */}
                {/* The wrapping div is removed and its properties are moved to the button */}
                <button 
                  type="button"
                  title={!isSignedIn ? 'Please sign in to use the SMS tool.' : ''}
                  onClick={() => toggleTool('sms')}
                  disabled={!isSignedIn}
                  className={`group flex flex-col space-y-3 p-4 border-2 rounded-lg text-left transition-all ${selectedTools.has('sms') ? 'border-indigo-500 bg-indigo-50' : 'border-gray-300 hover:border-gray-400'} disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:border-gray-300`}>
                  <div className="flex items-center space-x-4">
                    <MessageSquare className={`h-8 w-8 transition-colors ${selectedTools.has('sms') ? 'text-indigo-500' : 'text-gray-400 group-hover:text-gray-600'}`} />
                    <div>
                      <h3 className="font-semibold text-gray-900">Send an SMS</h3>
                      <p className="text-sm text-gray-500">Sends the model's response as a text message.</p>
                    </div>
                  </div>

                  {selectedTools.has('sms') && (
                  <div className="relative pl-12 pt-2">
                    <Smartphone className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                    <input
                      type="tel"
                      value={smsPhoneNumber}
                      onClick={(e) => e.stopPropagation()}
                      // --- THE FIX IS HERE ---
                      onChange={(e) => {
                        const newNumber = e.target.value;
                        // First, update the simple phone number state
                        setSmsPhoneNumber(newNumber);
                        
                        // Second, directly update the map with the new number.
                        // This replaces the need for the useEffect.
                        setSelectedTools(prev => {
                          const newMap = new Map(prev);
                          newMap.set('sms', { smsPhoneNumber: newNumber });
                          return newMap;
                        });
                      }}
                      className="w-full p-2 pl-10 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500"
                      placeholder="+1 555 123-4567"
                    />
                  </div>
                )}

                </button>
              </div>
            </div>

        </div>
      </div>
      
      {/* Footer */}
      <div className="flex justify-between items-center p-4 border-t bg-gray-50 flex-shrink-0">
        {step > 1 ? (<button onClick={handleBack} className="inline-flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-200 rounded-md"><ArrowLeft className="h-5 w-5 mr-2" />Back</button>) : (<div></div>)}
        <button onClick={handleNext} disabled={(step === 1 && !isStep1Valid) || (step === 2 && !isStep2Valid)} className="inline-flex items-center px-6 py-3 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50">
          {step === 3 ? 'Finish & Review' : 'Next'}
          {step < 3 && <ArrowRight className="h-5 w-5 ml-2" />}
        </button>
      </div>
    </Modal>
  );
};

export default SimpleCreatorModal;
