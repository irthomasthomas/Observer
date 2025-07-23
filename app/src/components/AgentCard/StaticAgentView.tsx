import React, { useMemo, useRef, useState, useEffect } from 'react';
import {
    Cpu, Clock, Eye, ChevronDown, AlertTriangle,
    ScanText, Camera, Clipboard, Mic, Volume2, Blend, Brain,
    Bell, BotMessageSquare, Mail, PlayCircle, StopCircle, Video, VideoOff, SquarePen,
    MessageSquare, MessageSquarePlus, MessageSquareQuote, Tag, Hourglass, Send
} from 'lucide-react';
import { CompleteAgent } from '@utils/agent_database';
import { listModels } from '@utils/ollamaServer';
import { getOllamaServerAddress } from '@utils/main_loop';

// --- Icon Components for External Tools (as simple stand-ins) ---
const PushoverIcon = () => <Send className="w-3.5 h-3.5" />;
const DiscordIcon = () => <BotMessageSquare className="w-3.5 h-3.5" />;
const WhatsAppIcon = () => <MessageSquare className="w-3.5 h-3.5" />;
const SmsIcon = () => <MessageSquarePlus className="w-3.5 h-3.5" />;

// --- CONFIGURATION OBJECTS ---

const SENSOR_CONFIG = {
    SCREEN_OCR: { label: 'Screen OCR', icon: ScanText },
    SCREEN_64: { label: 'Screenshot', icon: Camera },
    MEMORY: { label: 'Memory', icon: Brain },
    CLIPBOARD: { label: 'Clipboard', icon: Clipboard },
    MICROPHONE: { label: 'Microphone', icon: Mic },
    SCREEN_AUDIO: { label: 'Screen Audio', icon: Volume2 },
    ALL_AUDIO: { label: 'All Audio', icon: Blend },
};

// --- FIX START: Define a type for the tool configuration ---
type ToolConfigEntry = {
    label: string;
    icon: React.ElementType;
    regex: RegExp;
    warning?: string; // Optional property
};

// Apply the defined type to the configuration object
const TOOL_CONFIG: { [key: string]: ToolConfigEntry } = {
// --- FIX END ---
    notify: { label: 'Notification', icon: Bell, regex: /notify\s*\(/g },
    getMemory: { label: 'Get Memory', icon: Brain, regex: /getMemory\s*\(/g },
    setMemory: { label: 'Set Memory', icon: SquarePen, regex: /setMemory\s*\(/g },
    appendMemory: { label: 'Append Memory', icon: SquarePen, regex: /appendMemory\s*\(/g },
    startAgent: { label: 'Start Agent', icon: PlayCircle, regex: /startAgent\s*\(/g },
    stopAgent: { label: 'Stop Agent', icon: StopCircle, regex: /stopAgent\s*\(/g },
    time: { label: 'Get Time', icon: Hourglass, regex: /time\s*\(/g },
    sendEmail: { label: 'Send Email', icon: Mail, regex: /sendEmail\s*\(/g },
    sendPushover: { label: 'Pushover', icon: PushoverIcon, regex: /sendPushover\s*\(/g },
    sendDiscordBot: { label: 'Discord Bot', icon: DiscordIcon, regex: /sendDiscordBot\s*\(/g },
    sendWhatsapp: {
        label: 'WhatsApp',
        icon: WhatsAppIcon,
        regex: /sendWhatsapp\s*\(/g,
        warning: 'To receive messages, you must first message: +1 (555) 783-4727.'
    },
    sendSms: {
        label: 'SMS',
        icon: SmsIcon,
        regex: /sendSms\s*\(/g,
        warning: 'Delivery to US/Canada is unreliable. Use email for now.'
    },
    startClip: { label: 'Start Clip', icon: Video, regex: /startClip\s*\(/g },
    stopClip: { label: 'Stop Clip', icon: VideoOff, regex: /stopClip\s*\(/g },
    markClip: { label: 'Mark Clip', icon: Tag, regex: /markClip\s*\(/g },
    ask: { label: 'Ask Dialog', icon: MessageSquareQuote, regex: /ask\s*\(/g },
    message: { label: 'Message Dialog', icon: MessageSquare, regex: /message\s*\(/g },
    system_notify: { label: 'Sys Notify', icon: Bell, regex: /system_notify\s*\(/g },
};

// --- GENERIC HELPER COMPONENTS ---

const InfoTag: React.FC<{ icon: React.ElementType; label: string; warning?: string }> = ({ icon: Icon, label, warning }) => (
    <div className="relative group">
        <div className="inline-flex items-center gap-1.5 bg-gray-100 text-gray-700 px-2 py-1 rounded-md text-xs font-medium cursor-default">
            <Icon className="w-3.5 h-3.5" />
            <span>{label}</span>
            {warning && <AlertTriangle className="w-3.5 h-3.5 ml-1 text-orange-500" />}
        </div>
        {warning && (
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-max max-w-xs p-2 bg-gray-800 text-white text-xs rounded-md shadow-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                {warning}
            </div>
        )}
    </div>
);

const NoSensorsWarning: React.FC = () => (
    <div className="mt-2 p-3 bg-yellow-50 border-l-4 border-yellow-400 rounded-r-lg">
        <div className="flex">
            <div className="flex-shrink-0">
                <AlertTriangle className="h-5 w-5 text-yellow-500" aria-hidden="true" />
            </div>
            <div className="ml-3">
                <p className="text-sm text-yellow-700">
                    <b>Warning:</b> No sensors detected.
                    <span className="block sm:inline sm:ml-1">This agent can't perceive anything. Please edit the agent and add a sensor variable (e.g., <code className="text-xs">$SCREEN_OCR</code>) to its prompt.</span>
                </p>
            </div>
        </div>
    </div>
);

const NoToolsNotice: React.FC = () => (
    <div className="mt-2 p-3 bg-blue-50 border-l-4 border-blue-400 rounded-r-lg">
        <div className="flex">
            <div className="flex-shrink-0">
                <AlertTriangle className="h-5 w-5 text-blue-500" aria-hidden="true" />
            </div>
            <div className="ml-3">
                <p className="text-sm text-blue-700">
                    <b>Notice:</b> No tools detected.
                    <span className="block sm:inline sm:ml-1">This agent won't perform any actions with the model's output. Please edit the code and add a tool function, like <code className="text-xs">notify(response)</code>.</span>
                </p>
            </div>
        </div>
    </div>
);


const ModelDropdown: React.FC<{ currentModel: string; onModelChange: (modelName: string) => void;}> = ({ currentModel, onModelChange }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [availableModels, setAvailableModels] = useState<{ name: string; multimodal?: boolean }[]>([]);
    const dropdownRef = useRef<HTMLDivElement>(null);

    const fetchModels = async () => {
        setIsLoading(true);
        setError(null);
        try {
            const serverDetails = getOllamaServerAddress();
            if (!serverDetails.host || !serverDetails.port) throw new Error("Ollama server not configured.");
            const response = await listModels(serverDetails.host, serverDetails.port);
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
            <button type="button" onClick={handleToggle} className="inline-flex justify-center w-full rounded-md border border-gray-300 shadow-sm px-2.5 py-1.5 bg-white text-xs font-medium text-gray-700 hover:bg-gray-50">
                <span className="truncate max-w-[150px]">{currentModel || 'Select Model'}</span>
                <ChevronDown className="-mr-1 ml-1.5 h-4 w-4" />
            </button>
            {isOpen && (
                <div className="origin-top-right absolute right-0 mt-2 w-48 rounded-md shadow-lg bg-white ring-1 ring-black ring-opacity-5 z-10">
                    <div className="py-1">
                        {isLoading && <div className="px-3 py-1.5 text-xs text-gray-500">Loading...</div>}
                        {error && <div className="px-3 py-1.5 text-xs text-red-600">{error}</div>}
                        {!isLoading && !error && availableModels.map((model) => (
                            <button key={model.name} onClick={() => { onModelChange(model.name); setIsOpen(false); }} className={`${model.name === currentModel ? 'bg-gray-100' : ''} block w-full text-left px-3 py-1.5 text-xs hover:bg-gray-100`}>
                                <div className="flex items-center justify-between">
                                  <span className="truncate">{model.name}</span>
                                  {model.multimodal && <Eye className="h-4 w-4 text-purple-600" />}
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
    isPythonAgent: boolean;
    currentModel: string;
    onModelChange: (modelName: string) => void;
    startWarning: string | null;
}

const StaticAgentView: React.FC<StaticAgentViewProps> = ({
    agent,
    code,
    isPythonAgent,
    currentModel,
    onModelChange,
    startWarning,
}) => {
    // Memoized sensor detection
    const detectedSensors = useMemo(() => {
        const prompt = agent.system_prompt || '';
        const foundSensors: (keyof typeof SENSOR_CONFIG)[] = [];
        if (prompt.includes('$SCREEN_OCR')) foundSensors.push('SCREEN_OCR');
        if (prompt.includes('$SCREEN_64')) foundSensors.push('SCREEN_64');
        if (prompt.includes('$MEMORY@')) foundSensors.push('MEMORY');
        if (prompt.includes('$CLIPBOARD')) foundSensors.push('CLIPBOARD');
        if (prompt.includes('$MICROPHONE')) foundSensors.push('MICROPHONE');
        if (prompt.includes('$SCREEN_AUDIO')) foundSensors.push('SCREEN_AUDIO');
        if (prompt.includes('$ALL_AUDIO')) foundSensors.push('ALL_AUDIO');
        return foundSensors;
    }, [agent.system_prompt]);

    // Memoized tool detection
    const detectedTools = useMemo(() => {
        const agentCode = code || '';
        const foundTools: { key: string; label: string; icon: React.ElementType; warning?: string }[] = [];
        for (const [key, tool] of Object.entries(TOOL_CONFIG)) {
            const matches = agentCode.match(tool.regex);
            if (matches) {
                for (let i = 0; i < matches.length; i++) {
                    foundTools.push({
                        key: `${key}-${i}`,
                        label: tool.label,
                        icon: tool.icon,
                        warning: tool.warning
                    });
                }
            }
        }
        return foundTools;
    }, [code]);

    return (
        <div className="space-y-4 animate-fade-in">
            <p className="text-sm text-gray-600">{agent.description || "No description provided."}</p>

            {/* Agent Info Tags */}
            <div className="flex items-center flex-wrap gap-x-4 gap-y-2 text-sm text-gray-500">
                <div className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${isPythonAgent ? 'bg-blue-100 text-blue-800' : 'bg-amber-100 text-amber-800'}`}>
                    {isPythonAgent ? 'Python' : 'JavaScript'}
                </div>
                <div className="inline-flex items-center"><Cpu className="w-4 h-4 mr-1.5" /><ModelDropdown currentModel={currentModel} onModelChange={onModelChange} /></div>
                <div className="inline-flex items-center"><Clock className="w-4 h-4 mr-1.5" />{agent.loop_interval_seconds}s</div>
            </div>

            {/* SENSORS Section */}
            <div className="pt-2">
                <h4 className="text-xs font-semibold text-gray-500 mb-2">SENSORS</h4>
                {detectedSensors.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                        {detectedSensors.map(sensorKey => {
                            const config = SENSOR_CONFIG[sensorKey];
                            return <InfoTag key={sensorKey} icon={config.icon} label={config.label} />;
                        })}
                    </div>
                ) : (
                    <NoSensorsWarning />
                )}
            </div>

            {/* TOOLS Section */}
            <div className="pt-2">
                <h4 className="text-xs font-semibold text-gray-500 mb-2">TOOLS</h4>
                {detectedTools.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                        {detectedTools.map(tool => (
                            <InfoTag
                                key={tool.key}
                                icon={tool.icon}
                                label={tool.label}
                                warning={tool.warning}
                            />
                        ))}
                    </div>
                ) : (
                    <NoToolsNotice />
                )}
            </div>

            {/* Other Warnings */}
            {startWarning && (
                <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 text-yellow-800 rounded-md text-sm flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5 flex-shrink-0" />
                    <span>{startWarning}</span>
                </div>
            )}
        </div>
    );
};

export default StaticAgentView;
