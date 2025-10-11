import React, { useRef, useState, useEffect } from 'react';
import {
    Brain, Clock, Eye, ChevronDown, AlertTriangle, Server, Wrench, ChevronRight, Zap
} from 'lucide-react';
import { CompleteAgent } from '@utils/agent_database';
import { listModels } from '@utils/inferenceServer';
import { getInferenceAddresses } from '@utils/inferenceServer';
import { detectAgentCapabilities } from './agentCapabilities';
import SensorModal from './SensorModal';
import ToolsModal from './ToolsModal';




// --- GENERIC HELPER COMPONENTS ---

const InfoTag: React.FC<{ icon: React.ElementType; label: string; warning?: string; isBlocking?: boolean }> = ({ icon: Icon, label, warning, isBlocking }) => (
    <div className="relative group">
        <div className="inline-flex items-center gap-1.5 bg-gray-100 text-gray-700 px-2 py-1 rounded-md text-xs font-medium cursor-default">
            <Icon className="w-3.5 h-3.5" />
            <span>{label}</span>
            {warning && <AlertTriangle className={`w-3.5 h-3.5 ml-1 ${isBlocking ? 'text-red-500' : 'text-orange-500'}`} />}
        </div>
        {warning && (
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-max max-w-xs p-2 bg-gray-800 text-white text-xs rounded-md shadow-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                {warning}
            </div>
        )}
    </div>
);



const ModelDropdown: React.FC<{ currentModel: string; onModelChange: (modelName: string) => void; isProUser?: boolean; }> = ({ currentModel, onModelChange, isProUser = false }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [availableModels, setAvailableModels] = useState<{ name: string; multimodal?: boolean; pro?: boolean; server: string; }[]>([]);
    const dropdownRef = useRef<HTMLDivElement>(null);

    const fetchModels = async () => {
        setIsLoading(true);
        setError(null);
        try {
            const addresses = getInferenceAddresses();
            if (addresses.length === 0) throw new Error("No inference servers configured.");
            const response = listModels();
            if (response.error) throw new Error(response.error);
            setAvailableModels(response.models);
        } catch (e) {
            setError(`Failed to fetch: ${e instanceof Error ? e.message : String(e)}`);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) setIsOpen(false);
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const handleToggle = () => {
        if (!isOpen) fetchModels();
        setIsOpen(!isOpen);
    };

    return (
        <div className="relative inline-block text-left" ref={dropdownRef}>
            <button type="button" onClick={handleToggle} className="inline-flex justify-center w-full rounded-md border border-gray-300 shadow-sm px-3 py-2 md:px-2.5 md:py-1.5 bg-white text-xs font-medium text-gray-700 hover:bg-gray-50 min-h-[44px] md:min-h-0">
                <span className="truncate max-w-[150px]">{currentModel || 'Select Model'}</span>
                <ChevronDown className="-mr-1 ml-1.5 h-4 w-4" />
            </button>
            {isOpen && (
                <div className="origin-top-right absolute right-0 mt-2 w-48 rounded-md shadow-lg bg-white ring-1 ring-black ring-opacity-5 z-10">
                    <div className="py-1 max-h-72 overflow-y-auto">
                        {isLoading && <div className="px-3 py-1.5 text-xs text-gray-500">Loading...</div>}
                        {error && <div className="px-3 py-1.5 text-xs text-red-600">{error}</div>}
                        {!isLoading && !error && availableModels.map((model) => (
                            <button 
                                key={model.name} 
                                onClick={() => { 
                                    if (model.pro && !isProUser) return; // Prevent selection of pro models for non-pro users
                                    onModelChange(model.name); 
                                    setIsOpen(false); 
                                }} 
                                disabled={model.pro && !isProUser}
                                className={`${model.name === currentModel ? 'bg-gray-100' : ''} block w-full text-left px-3 py-1.5 text-xs hover:bg-gray-100 ${model.pro && !isProUser ? 'opacity-50 select-none cursor-not-allowed' : ''}`}>
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center">
                                    <span className="truncate">{model.name}</span>
                                    {model.pro && !isProUser && (
                                      <span className="ml-2 text-xs font-bold text-purple-600 bg-purple-100 px-1.5 py-0.5 rounded-full">
                                        PRO
                                      </span>
                                    )}
                                  </div>
                                  <div className="flex items-center space-x-1">
                                    {model.multimodal && <Eye className="h-4 w-4 text-purple-600" />}
                                    {(model.server.includes('localhost') || model.server.includes('http://')) && <Server className="h-4 w-4 text-gray-600" />}
                                  </div>
                                </div>
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};


// --- MAIN COMPONENT ---

interface StaticAgentViewProps {
    agent: CompleteAgent;
    code?: string;
    currentModel: string;
    onModelChange: (modelName: string) => void;
    onToggleSignificantChange: (enabled: boolean) => void;
    startWarning: string | null;
    isProUser?: boolean;
    hostingContext?: 'official-web' | 'self-hosted' | 'tauri';
    getToken?: () => Promise<string | undefined>;
}


const StaticAgentView: React.FC<StaticAgentViewProps> = ({
    agent,
    code,
    currentModel,
    onModelChange,
    onToggleSignificantChange,
    startWarning,
    isProUser = false,
    hostingContext,
    getToken,
}) => {
    const [detectedSensors, setDetectedSensors] = useState<any[]>([]);
    const [detectedTools, setDetectedTools] = useState<any[]>([]);
    const [isSensorModalOpen, setIsSensorModalOpen] = useState(false);
    const [isToolsModalOpen, setIsToolsModalOpen] = useState(false);

    useEffect(() => {
        const loadCapabilities = async () => {
            try {
                const capabilities = await detectAgentCapabilities(agent.system_prompt || '', code || '', hostingContext);
                setDetectedSensors(capabilities.sensors);
                setDetectedTools(capabilities.tools);
            } catch (error) {
                console.error('Failed to load agent capabilities:', error);
                setDetectedSensors([]);
                setDetectedTools([]);
            }
        };

        loadCapabilities();
    }, [agent.system_prompt, code, hostingContext]);

    return (
        <div className="animate-fade-in">
            {/* 3 Column Layout with Arrows - Responsive: vertical on mobile, horizontal on desktop */}
            <div className="flex flex-col md:flex-row items-center md:items-start gap-1 md:gap-4">
                {/* Column 1: Sensors */}
                <div className="flex flex-col flex-1 w-full md:w-auto">
                    <button
                        onClick={() => setIsSensorModalOpen(true)}
                        className="flex md:flex-col items-start md:items-center w-full text-left p-3 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors cursor-pointer group"
                        title="View system prompt"
                    >
                        <div className="flex justify-start mb-0 md:mb-4 w-6 md:w-auto flex-shrink-0 transition-colors">
                            <Eye className="w-5 h-5 text-gray-500 group-hover:text-indigo-600" />
                        </div>
                        <div className="flex flex-wrap gap-2 md:flex-col md:space-y-2 items-start md:items-center min-h-[44px] md:min-h-0 flex-1 ml-3 md:ml-0">
                            {detectedSensors.length > 0 ? (
                                detectedSensors.map(sensor => (
                                    <InfoTag key={sensor.key} icon={sensor.icon} label={sensor.label} />
                                ))
                            ) : (
                                <div className="text-sm text-gray-400 italic">No sensors</div>
                            )}
                        </div>
                    </button>
                </div>

                {/* Arrow 1 - Responsive: down on mobile, right on desktop */}
                <div className="flex items-center justify-start md:justify-center py-2 md:pt-2 pl-1 md:pl-0">
                    <ChevronRight className="w-4 h-4 text-gray-400 rotate-90 md:rotate-0" />
                </div>

                {/* Column 2: Model */}
                <div className="flex flex-col flex-1 w-full md:w-auto">
                    {/* Mobile: horizontal layout with icon on left */}
                    <div className="flex md:flex-col items-start md:items-center">
                        <div className="flex justify-start mb-0 md:mb-4 w-6 md:w-auto flex-shrink-0">
                            <Brain className="w-5 h-5 text-gray-500" />
                        </div>
                        <div className="flex items-center justify-between md:flex-col md:items-center md:justify-center w-full md:w-auto ml-12 md:ml-0 md:space-y-3">
                            <ModelDropdown currentModel={currentModel} onModelChange={onModelChange} isProUser={isProUser} />
                            <div className="flex items-center gap-3">
                                <div className="flex items-center gap-2">
                                    <Clock className="w-4 h-4 text-gray-500" />
                                    <span className="text-sm text-gray-600">{agent.loop_interval_seconds}s</span>
                                </div>
                                <div className="relative group">
                                    <button
                                        onClick={() => onToggleSignificantChange(!(agent.only_on_significant_change ?? true))}
                                        className={`flex items-center gap-2 px-3 py-1.5 rounded-md transition-colors ${
                                            (agent.only_on_significant_change ?? true)
                                                ? 'bg-indigo-100 text-indigo-700 hover:bg-indigo-200'
                                                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                        }`}
                                    >
                                        <Zap className="w-4 h-4" />
                                        <span className="text-xs font-medium">
                                            {(agent.only_on_significant_change ?? true) ? 'On' : 'Off'}
                                        </span>
                                    </button>
                                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-max max-w-xs p-2 bg-gray-800 text-white text-xs rounded-md shadow-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                                        Only run model when there's significant change in inputs
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Arrow 2 - Responsive: down on mobile, right on desktop */}
                <div className="flex items-center justify-start md:justify-center py-2 md:pt-2 pl-1 md:pl-0">
                    <ChevronRight className="w-4 h-4 text-gray-400 rotate-90 md:rotate-0" />
                </div>

                {/* Column 3: Tools */}
                <div className="flex flex-col flex-1 w-full md:w-auto">
                    <button
                        onClick={() => setIsToolsModalOpen(true)}
                        className="flex md:flex-col items-start md:items-center w-full text-left p-3 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors cursor-pointer group"
                        title="View agent code"
                    >
                        <div className="flex justify-start mb-0 md:mb-4 w-6 md:w-auto flex-shrink-0 transition-colors">
                            <Wrench className="w-5 h-5 text-gray-500 group-hover:text-indigo-600" />
                        </div>
                        <div className="flex flex-wrap gap-2 md:flex-col md:space-y-2 items-start md:items-center min-h-[44px] md:min-h-0 flex-1 ml-3 md:ml-0">
                            {detectedTools.length > 0 ? (
                                detectedTools.map(tool => (
                                    <InfoTag
                                        key={tool.key}
                                        icon={tool.icon}
                                        label={tool.label}
                                        warning={tool.warning}
                                        isBlocking={tool.isBlocking}
                                    />
                                ))
                            ) : (
                                <div className="text-sm text-gray-400 italic">No tools</div>
                            )}
                        </div>
                    </button>
                </div>
            </div>

            {/* Other Warnings */}
            {startWarning && (
                <div className="mt-6 p-3 bg-yellow-50 border border-yellow-200 text-yellow-800 rounded-md text-sm flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5 flex-shrink-0" />
                    <span>{startWarning}</span>
                </div>
            )}

            {/* Sensor Modal */}
            <SensorModal
                isOpen={isSensorModalOpen}
                onClose={() => setIsSensorModalOpen(false)}
                systemPrompt={agent.system_prompt || ''}
                agentName={agent.name || 'Unnamed Agent'}
                agentId={agent.id}
            />

            {/* Tools Modal */}
            <ToolsModal
                isOpen={isToolsModalOpen}
                onClose={() => setIsToolsModalOpen(false)}
                code={code || ''}
                agentName={agent.name || 'Unnamed Agent'}
                agentId={agent.id}
                getToken={getToken}
            />
        </div>
    );
};

export default StaticAgentView;
