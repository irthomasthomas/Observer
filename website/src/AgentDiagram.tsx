import React, { useState, useEffect, useRef } from 'react';
import {
  ScanText, Monitor, Mic, Brain, Volume2, Camera, Clipboard,
  BrainCircuit, Cpu, Layers, Eye,
  Bell, Mail, MessageSquare, Terminal, Save, Clapperboard, Tag, Blend,
} from 'lucide-react';

// --- DATA (No changes) ---
const featureDescriptions = {
  OCR: "Captures screen content as text for the model to read.",
  SCREEN: "Takes a screenshot as an image for multimodal vision models.",
  CAMERA: "Captures a frame from your camera for vision models.",
  CLIPBOARD: "Accesses the current text content of your clipboard.",
  MICROPHONE: "Records audio from your microphone and transcribes it to text.",
  AUDIO: "Captures and transcribes the audio output from your computer.",
  'ALL AUDIO': "Mixes microphone and computer audio for a complete transcription (e.g., for meetings).",
  MEMORY: "Allows the agent to read from its own long-term memory.",
  LLMS: "Leverages powerful local language models for reasoning.",
  VISION: "Enables models to understand and interpret images.",
  LOCAL: "All processing happens on your device, ensuring privacy.",
  MODELS: "Easily switch between different models like Llama3, Gemma, etc.",
  NOTIFICATIONS: "Sends a desktop notification with the model's output.",
  REMEMBERING: "Saves or appends text to the agent's long-term memory.",
  RECORD: "Starts a screen recording session, saved to the Clips tab.",
  LABELS: "Adds a timestamped label to an active recording for quick reference.",
  'SMS/WA': "Sends the model's output as an SMS or WhatsApp message.",
  EMAIL: "Sends the model's output as an email to a specified address.",
  'RUN CODE': "Executes JavaScript or Python code to perform complex actions.",
};


// --- NEW: Custom Hook to detect screen size ---
const useMediaQuery = (query) => {
  const [matches, setMatches] = useState(false);
  useEffect(() => {
    // Ensure window is defined (for SSR compatibility)
    if (typeof window !== 'undefined') {
      const media = window.matchMedia(query);
      if (media.matches !== matches) {
        setMatches(media.matches);
      }
      const listener = () => setMatches(media.matches);
      media.addEventListener('change', listener);
      return () => media.removeEventListener('change', listener);
    }
  }, [matches, query]);
  return matches;
};


// --- POPOVER COMPONENT (No changes) ---
const Popover = ({ content, position, onClose, popoverKey }) => {
  const popoverRef = useRef(null);
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (popoverRef.current && !popoverRef.current.contains(event.target)) {
        if (!event.target.closest('[data-chip-key]')) onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);
  if (!position) return null;
  return (
    <div ref={popoverRef} className="fixed z-50 w-64 p-3 bg-white text-gray-800 rounded-lg shadow-2xl animate-fade-in-up" style={{ left: `${position.left + position.width / 2}px`, top: `${position.top}px`, transform: 'translateX(-50%) translateY(-100%) translateY(-10px)' }} key={popoverKey}>
      <p className="text-sm">{content}</p>
      <div className="absolute left-1/2 -translate-x-1/2 bottom-[-8px] w-0 h-0 border-l-8 border-l-transparent border-r-8 border-r-transparent border-t-8 border-t-white" />
    </div>
  );
};

// --- FEATURE CHIP (No changes) ---
const FeatureChip = ({ icon: Icon, label, onChipClick }) => (
  <button onClick={(e) => onChipClick(e, label)} data-chip-key={label} className="flex cursor-pointer items-center gap-2 rounded-lg bg-gray-900/60 px-3 py-1.5 transition-all duration-200 hover:bg-gray-800/80 hover:scale-105 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900 focus:ring-blue-500">
    <Icon className="h-4 w-4 flex-shrink-0" />
    <span className="text-xs font-semibold uppercase tracking-wider text-gray-300">{label}</span>
  </button>
);


// --- DESKTOP NODE: For the rotating diagram ---
const DiagramNode = ({ title, color, children, rotationAngle = 0, index = 0 }) => {
  const nodeAngle = rotationAngle + (index * 120);
  return (
    <div className="absolute inset-0 transition-transform duration-200 ease-out" style={{ transform: `rotate(${nodeAngle}deg)` }}>
      <div className="absolute top-1/2 left-1/2 transform transition-transform duration-200 ease-out" style={{ transform: `translate(-50%, -23rem) rotate(${-nodeAngle}deg)` }}>
        <div className="relative w-72 p-5 rounded-2xl bg-gray-900/60 border border-white/10 backdrop-blur-md">
          <div className={`absolute -inset-px rounded-2xl opacity-30 blur-xl bg-${color}-500`} />
          <div className="relative">
            <h3 className={`text-lg font-bold mb-4 text-${color}-400`}>{title}</h3>
            {children}
          </div>
        </div>
      </div>
    </div>
  );
};

// --- MOBILE NODE: A static version for vertical layout ---
const StaticNode = ({ title, color, children }) => (
  <div className="relative w-full max-w-md p-5 rounded-2xl bg-gray-900/60 border border-white/10 backdrop-blur-md">
    <div className={`absolute -inset-px rounded-2xl opacity-30 blur-xl bg-${color}-500`} />
    <div className="relative">
      <h3 className={`text-lg font-bold mb-4 text-${color}-400`}>{title}</h3>
      {children}
    </div>
  </div>
);


// --- MAIN DIAGRAM COMPONENT with RESPONSIVE LOGIC ---
export const AgentDiagram = () => {
  const diagramRef = useRef(null);
  const [rotationAngle, setRotationAngle] = useState(195);
  const [activePopover, setActivePopover] = useState(null);
  const isDesktop = useMediaQuery('(min-width: 768px)');

  useEffect(() => {
    // Only set up the complex scroll listener on desktop
    if (!isDesktop) return;

    const handleScroll = () => {
      if (!diagramRef.current) return;
      const rect = diagramRef.current.getBoundingClientRect();
      const viewportHeight = window.innerHeight;
      const lockZoneStart = viewportHeight * 0.3;
      const lockZoneEnd = viewportHeight * 0.7;
      const diagramCenterY = rect.top + rect.height / 2;
      const targetLockAngle = 340;

      if (diagramCenterY > lockZoneStart && diagramCenterY < lockZoneEnd) {
        setRotationAngle(targetLockAngle);
      } else {
        let scrollDrivenOffset = (diagramCenterY <= lockZoneStart)
          ? diagramCenterY - lockZoneStart
          : diagramCenterY - lockZoneEnd;
        const angleFromScroll = scrollDrivenOffset * -0.2;
        setRotationAngle(targetLockAngle + angleFromScroll);
      }
    };

    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [isDesktop]); // Re-run if the screen size crosses the breakpoint

  const handleChipClick = (event, key) => {
    event.stopPropagation();
    if (activePopover && activePopover.key === key) {
      setActivePopover(null);
    } else {
      const rect = event.currentTarget.getBoundingClientRect();
      setActivePopover({ key, content: featureDescriptions[key] || "No description available.", position: rect });
    }
  };

  const handleClosePopover = () => setActivePopover(null);

  const renderChips = (chips) => (
    <div className="flex flex-wrap justify-center gap-2">
      {chips.map(([Icon, label]) => <FeatureChip key={label} icon={Icon} label={label} onChipClick={handleChipClick} />)}
    </div>
  );

  return (
    <div className="container mx-auto px-6 py-24">
      {activePopover && <Popover {...activePopover} onClose={handleClosePopover} />}
      <div className="text-center mb-16 md:mb-24">
        <h2 className="text-4xl font-bold text-white mb-4">How Agents Work</h2>
        <p className="text-lg text-gray-400 max-w-2xl mx-auto">
          Observer agents follow a simple, powerful loop: see with sensors, think with models, and act with tools.
        </p>
      </div>

      {isDesktop ? (
        // -- DESKTOP LAYOUT --
        <div ref={diagramRef} className="relative h-[52rem] flex items-center justify-center">
          <div className="absolute inset-0 flex items-center justify-center">
            <svg className="w-full h-full max-w-2xl max-h-2xl" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 200 200">
              <circle cx="100" cy="100" r="85" stroke="url(#gradient-circle)" strokeWidth="1" strokeDasharray="8 6" className="animate-dash-flow opacity-30" vectorEffect="non-scaling-stroke" />
              <defs>
                <linearGradient id="gradient-circle" gradientTransform="rotate(90)">
                  <stop offset="0%" stopColor="#3b82f6" /><stop offset="50%" stopColor="#a855f7" /><stop offset="100%" stopColor="#10b981" />
                </linearGradient>
              </defs>
            </svg>
          </div>
          <div className="absolute w-80 h-80 flex items-center justify-center animate-float">
            <div className="absolute inset-0 bg-gray-800 rounded-full opacity-50 blur-xl" />
            <img src="/eye-logo-white.svg" alt="Observer AI Logo" className="relative w-40 h-40 opacity-90" />
          </div>
          <DiagramNode title="1. See with Sensors" color="blue" index={0} rotationAngle={rotationAngle}>
            {renderChips([[ScanText, 'OCR'],[Monitor, 'SCREEN'],[Camera, 'CAMERA'],[Clipboard, 'CLIPBOARD'],[Mic, 'MICROPHONE'],[Volume2, 'AUDIO'],[Blend, 'ALL AUDIO'],[Brain, 'MEMORY']])}
          </DiagramNode>
          <DiagramNode title="2. Think with Models" color="purple" index={1} rotationAngle={rotationAngle}>
            <div className="space-y-3">
              {renderChips([[BrainCircuit, 'LLMS'],[Eye, 'VISION'],[Cpu, 'LOCAL'],[Layers, 'MODELS']])}
              <div className="text-center p-2 pt-3 rounded-lg bg-gray-900/50"><span className="font-bold text-lg text-gray-200">llava · llama3 · gemma</span><span className="text-sm text-gray-400 mt-1 block">Powered by <b className="font-bold text-gray-300">Ollama</b></span></div>
            </div>
          </DiagramNode>
          <DiagramNode title="3. Act with Tools" color="emerald" index={2} rotationAngle={rotationAngle}>
            {renderChips([[Bell, 'NOTIFICATIONS'],[Save, 'REMEMBERING'],[Clapperboard, 'RECORD'],[Tag, 'LABELS'],[MessageSquare, 'SMS/WA'],[Mail, 'EMAIL'],[Terminal, 'RUN CODE']])}
          </DiagramNode>
        </div>
      ) : (
        // -- MOBILE LAYOUT --
        <div className="flex flex-col items-center gap-8">
          <StaticNode title="1. See with Sensors" color="blue">
            {renderChips([[ScanText, 'OCR'],[Monitor, 'SCREEN'],[Camera, 'CAMERA'],[Clipboard, 'CLIPBOARD'],[Mic, 'MICROPHONE'],[Volume2, 'AUDIO'],[Blend, 'ALL AUDIO'],[Brain, 'MEMORY']])}
          </StaticNode>
          <StaticNode title="2. Think with Models" color="purple">
            <div className="space-y-3">
              {renderChips([[BrainCircuit, 'LLMS'],[Eye, 'VISION'],[Cpu, 'LOCAL'],[Layers, 'MODELS']])}
              <div className="text-center p-2 pt-3 rounded-lg bg-gray-900/50"><span className="font-bold text-lg text-gray-200">llava · llama3 · gemma</span><span className="text-sm text-gray-400 mt-1 block">Powered by <b className="font-bold text-gray-300">Ollama</b></span></div>
            </div>
          </StaticNode>
          <StaticNode title="3. Act with Tools" color="emerald">
            {renderChips([[Bell, 'NOTIFICATIONS'],[Save, 'REMEMBERING'],[Clapperboard, 'RECORD'],[Tag, 'LABELS'],[MessageSquare, 'SMS/WA'],[Mail, 'EMAIL'],[Terminal, 'RUN CODE']])}
          </StaticNode>
        </div>
      )}
    </div>
  );
};

export default AgentDiagram;
