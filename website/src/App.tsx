import { useState, useRef, useEffect } from 'react';
import {
  Github, ArrowRight, ExternalLink,
  ScanText, Monitor, Mic, Brain, Volume2, Camera, Clipboard,
  BrainCircuit, Cpu, Layers, Eye,
  Bell, Mail, MessageSquare, Terminal, Save, Clapperboard, Tag, Blend,
  ChevronDown, Users, Image, Repeat,
} from 'lucide-react';
import ObserverLanding from './ObserverLanding';
import DownloadsSection from './DownloadsSection';

// --- DATA ---
const featureDescriptions: Record<string, string> = {
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
  MODELS: "Easily switch between different models via any OpenAI-compatible endpoint.",
  MESSAGING: "Send notifications via WhatsApp, SMS, Email, Discord, Telegram, Pushover, and native system notifications.",
  RECORDING: "Start and stop screen recordings. Add timestamped labels for quick reference.",
  INTERACTION: "Enable multi-agent collaboration. Execute JavaScript or Python code.",
  'MEMORY STORAGE': "Store and retrieve text memories and images for contextual awareness.",
};

// Hand-drawn arrow for connecting cards
const HandDrawnArrow = ({ className = "", direction = "down" }: { className?: string; direction?: "down" | "right" }) => {
  if (direction === "right") {
    return (
      <svg className={className} viewBox="0 0 60 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path
          d="M2 12C8 11 16 13 24 12C32 11 40 13 48 12M48 12C44 8 42 6 40 4M48 12C44 16 42 18 40 20"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  return (
    <svg className={className} viewBox="0 0 24 60" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M12 2C11 8 13 16 12 24C11 32 13 40 12 48M12 48C8 44 6 42 4 40M12 48C16 44 18 42 20 40"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
};

// Subtle underline for section headers
const HandDrawnUnderline = ({ className = "" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 120 8" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path
      d="M2 5C20 3 40 6 60 4C80 2 100 5 118 4"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    />
  </svg>
);

// --- TOOLTIP ---
const Tooltip = ({ content, position, onClose }: {
  content: string;
  position: { left: number; top: number; width: number };
  onClose: () => void;
}) => {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        const target = e.target as HTMLElement;
        if (!target.closest('[data-chip]')) {
          onClose();
        }
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="fixed z-50 w-64 p-3 bg-gray-800 text-white rounded-xl shadow-2xl border border-white/10"
      style={{
        left: `${position.left + position.width / 2}px`,
        top: `${position.top - 8}px`,
        transform: 'translateX(-50%) translateY(-100%)',
      }}
    >
      <p className="text-sm">{content}</p>
      <div className="absolute left-1/2 -translate-x-1/2 bottom-[-8px] w-0 h-0 border-l-8 border-l-transparent border-r-8 border-r-transparent border-t-8 border-t-gray-800" />
    </div>
  );
};

// --- CHIP ---
const Chip = ({ icon: Icon, icons, label, onClick, isActive }: {
  icon: React.ElementType;
  icons?: React.ElementType[];
  label: string;
  onClick: (e: React.MouseEvent) => void;
  isActive: boolean;
}) => (
  <button
    onClick={onClick}
    data-chip
    className={`
      group flex items-center gap-2 px-3 py-1.5 rounded-lg
      bg-white/5 border border-white/10
      hover:bg-white/10 hover:border-white/20 hover:scale-105
      active:scale-100
      transition-all duration-200 cursor-pointer
      ${isActive ? 'bg-white/15 border-white/30 scale-105' : ''}
    `}
  >
    {icons ? (
      <div className="flex items-center gap-1">
        {icons.map((I, idx) => <I key={idx} className="h-3.5 w-3.5 text-gray-400" />)}
      </div>
    ) : (
      <Icon className="h-4 w-4 text-gray-400 group-hover:text-gray-300" />
    )}
    <span className="text-xs font-semibold uppercase tracking-wider text-gray-400 group-hover:text-gray-300">
      {label}
    </span>
  </button>
);

// --- NODE CARD ---
const NodeCard = ({
  number,
  title,
  subtitle,
  borderColor,
  numberColor,
  children
}: {
  number: string;
  title: string;
  subtitle: string;
  borderColor: string;
  numberColor: string;
  children: React.ReactNode;
}) => (
  <div className={`relative w-full max-w-sm p-5 rounded-2xl bg-gray-900/80 border ${borderColor} backdrop-blur-md`}>
    <div className="flex items-start gap-3 mb-4">
      <span className={`text-3xl font-bold ${numberColor} opacity-40`}>{number}</span>
      <div>
        <h3 className="text-lg font-bold text-white">{title}</h3>
        <p className="text-sm text-gray-500">{subtitle}</p>
      </div>
    </div>
    {children}
  </div>
);

// Community agents - curated list
const communityAgents = [
  {
    name: "Multi Person Tracker",
    author: "tacker.oct",
    description: "Tracks and identifies people across frames, improves its own reference images over time.",
    icon: <Camera className="w-5 h-5" />,
    featured: true,
  },
  {
    name: "Focus Assistant",
    author: "yandiev",
    description: "Gentle notification nudges when you drift to distracting sites.",
    icon: <Monitor className="w-5 h-5" />,
    featured: true,
  },
  {
    name: "Camera Person Alert",
    author: "Johnny Vinicius",
    description: "Monitors your camera and sends a photo to Telegram when someone appears.",
    icon: <Bell className="w-5 h-5" />,
  },
  {
    name: "Activity Tracker",
    author: null,
    description: "Logs what you do across apps to understand how you spend your time.",
    icon: <Eye className="w-5 h-5" />,
  },
  {
    name: "Email Keyword Monitor",
    author: null,
    description: "Watches your inbox for important keywords and alerts you immediately.",
    icon: <Mail className="w-5 h-5" />,
  },
];

const LandingPage = () => {
  const [activeChip, setActiveChip] = useState<string | null>(null);
  const [tooltipPosition, setTooltipPosition] = useState<{ left: number; top: number; width: number } | null>(null);

  const handleChipClick = (e: React.MouseEvent, label: string) => {
    e.stopPropagation();
    if (activeChip === label) {
      setActiveChip(null);
      setTooltipPosition(null);
    } else {
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      setActiveChip(label);
      setTooltipPosition({ left: rect.left, top: rect.top, width: rect.width });
    }
  };

  const renderChips = (chips: { icon: React.ElementType; label: string; icons?: React.ElementType[] }[]) => (
    <div className="flex flex-wrap justify-center gap-2">
      {chips.map((chip) => (
        <Chip
          key={chip.label}
          icon={chip.icon}
          icons={chip.icons}
          label={chip.label}
          onClick={(e) => handleChipClick(e, chip.label)}
          isActive={activeChip === chip.label}
        />
      ))}
    </div>
  );

  return (
    <div className="min-h-screen bg-[#0D1321] text-white overflow-x-hidden">
      {/* Tooltip */}
      {activeChip && tooltipPosition && (
        <Tooltip
          content={featureDescriptions[activeChip] || "No description available."}
          position={tooltipPosition}
          onClose={() => { setActiveChip(null); setTooltipPosition(null); }}
        />
      )}

      {/* Navigation - old style with logo */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-[#0D1321]/80 backdrop-blur-xl border-b border-white/5">
        <div className="container mx-auto px-6 py-4 flex justify-between items-center">
          <div className="flex items-center space-x-6 -ml-1">
            <img src="/eye-logo-white.svg" alt="Observer AI Logo" className="w-6 h-6" />
            <span className="text-xl font-bold font-golos hidden md:inline">Observer AI</span>
          </div>
          <div className="flex items-center space-x-7 md:space-x-9 -mr-2">
            <a href="#downloads" className="text-gray-400 hover:text-white transition hidden md:inline">Download</a>
            <a href="#agents" className="text-gray-400 hover:text-white transition hidden md:inline">Agents</a>
            <a href="https://discord.gg/wnBb7ZQDUC" className="text-gray-400 hover:text-white transition hidden md:inline">Community</a>
            <a href="https://github.com/Roy3838/Observer" className="flex items-center space-x-2 bg-white/10 px-4 py-2 rounded-lg hover:bg-white/20 transition">
              <Github className="w-5 h-5" />
              <span className="hidden md:inline">GitHub</span>
            </a>
          </div>
        </div>
      </nav>

      {/* Hero Section - The Eye */}
      <header className="relative bg-[#0D1321]">
        <ObserverLanding />
      </header>

      {/* How It Works - Static cards with hand-drawn arrows */}
      <section className="py-24 md:py-32 bg-[#0D1321] relative" id="how-it-works">
        <div className="container mx-auto px-6">
          {/* Section header */}
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-3">
              How Agents Work
            </h2>
            <HandDrawnUnderline className="w-40 mx-auto text-white/30" />
            <p className="text-lg text-gray-400 max-w-2xl mx-auto mt-6">
              Observer micro-agents follow a simple, powerful loop: see with sensors, think with models, and act with tools.
            </p>
          </div>

          {/* Desktop: Horizontal layout */}
          <div className="hidden lg:flex items-start justify-center gap-6 max-w-6xl mx-auto">
            {/* See */}
            <NodeCard number="01" title="See" subtitle="with Sensors" borderColor="border-blue-500/40" numberColor="text-blue-400">
              {renderChips([
                { icon: ScanText, label: 'OCR' },
                { icon: Monitor, label: 'SCREEN' },
                { icon: Camera, label: 'CAMERA' },
                { icon: Clipboard, label: 'CLIPBOARD' },
                { icon: Mic, label: 'MICROPHONE' },
                { icon: Volume2, label: 'AUDIO' },
                { icon: Blend, label: 'ALL AUDIO' },
                { icon: Brain, label: 'MEMORY' },
              ])}
            </NodeCard>

            {/* Arrow */}
            <div className="flex items-center pt-20">
              <HandDrawnArrow className="w-14 text-gray-600" direction="right" />
            </div>

            {/* Think */}
            <NodeCard number="02" title="Think" subtitle="with Models" borderColor="border-purple-500/40" numberColor="text-purple-400">
              {renderChips([
                { icon: Cpu, label: 'LOCAL' },
                { icon: Eye, label: 'VISION' },
                { icon: Layers, label: 'MODELS' },
              ])}
              <div className="mt-3 p-2.5 rounded-xl bg-white/5 border border-white/10 text-center">
                <p className="text-sm font-medium text-gray-300">ollama, vLLM, llama.cpp...</p>
                <p className="text-xs text-gray-500 mt-0.5">Any OpenAI-compatible endpoint</p>
              </div>
            </NodeCard>

            {/* Arrow */}
            <div className="flex items-center pt-20">
              <HandDrawnArrow className="w-14 text-gray-600" direction="right" />
            </div>

            {/* Act */}
            <NodeCard number="03" title="Act" subtitle="with Tools" borderColor="border-emerald-500/40" numberColor="text-emerald-400">
              {renderChips([
                { icon: Mail, label: 'MESSAGING', icons: [Mail, MessageSquare, Bell] },
                { icon: Clapperboard, label: 'RECORDING', icons: [Clapperboard, Tag] },
                { icon: Users, label: 'INTERACTION', icons: [Users, Terminal] },
                { icon: Save, label: 'MEMORY STORAGE', icons: [Save, Image] },
              ])}
            </NodeCard>
          </div>

          {/* Mobile: Vertical layout */}
          <div className="lg:hidden flex flex-col items-center gap-4">
            <NodeCard number="01" title="See" subtitle="with Sensors" borderColor="border-blue-500/40" numberColor="text-blue-400">
              {renderChips([
                { icon: ScanText, label: 'OCR' },
                { icon: Monitor, label: 'SCREEN' },
                { icon: Camera, label: 'CAMERA' },
                { icon: Clipboard, label: 'CLIPBOARD' },
                { icon: Mic, label: 'MICROPHONE' },
                { icon: Volume2, label: 'AUDIO' },
                { icon: Blend, label: 'ALL AUDIO' },
                { icon: Brain, label: 'MEMORY' },
              ])}
            </NodeCard>

            <HandDrawnArrow className="h-12 text-gray-600" direction="down" />

            <NodeCard number="02" title="Think" subtitle="with Models" borderColor="border-purple-500/40" numberColor="text-purple-400">
              {renderChips([
                { icon: Cpu, label: 'LOCAL' },
                { icon: Eye, label: 'VISION' },
                { icon: BrainCircuit, label: 'LLMS' },
                { icon: Layers, label: 'MODELS' },
              ])}
              <div className="mt-3 p-2.5 rounded-xl bg-white/5 border border-white/10 text-center">
                <p className="text-sm font-medium text-gray-300">ollama, vLLM, llama.cpp...</p>
                <p className="text-xs text-gray-500 mt-0.5">Any OpenAI-compatible endpoint</p>
              </div>
            </NodeCard>

            <HandDrawnArrow className="h-12 text-gray-600" direction="down" />

            <NodeCard number="03" title="Act" subtitle="with Tools" borderColor="border-emerald-500/40" numberColor="text-emerald-400">
              {renderChips([
                { icon: Mail, label: 'MESSAGING', icons: [Mail, MessageSquare, Bell] },
                { icon: Clapperboard, label: 'RECORDING', icons: [Clapperboard, Tag] },
                { icon: Users, label: 'INTERACTION', icons: [Users, Terminal] },
                { icon: Save, label: 'MEMORY STORAGE', icons: [Save, Image] },
              ])}
            </NodeCard>

            <div className="flex items-center gap-2 mt-4 px-4 py-2 rounded-full bg-emerald-500/10 border border-emerald-500/20">
              <Repeat className="h-4 w-4 text-emerald-400" />
              <span className="text-sm text-emerald-400">Continuous loop</span>
            </div>
          </div>
        </div>
      </section>

      {/* Community Agents */}
      <section className="py-24 md:py-32 bg-[#0a0e17]" id="agents">
        <div className="container mx-auto px-6">
          {/* Section header */}
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-3">
              What people built
            </h2>
            <HandDrawnUnderline className="w-36 mx-auto text-white/30" />
            <p className="text-gray-400 max-w-2xl mx-auto mt-6">
              Cool agents made by cool people solving cool problems.
              <br />
            </p>
          </div>

          {/* Agent Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-5xl mx-auto">
            {communityAgents.map((agent, idx) => (
              <div
                key={idx}
                className={`
                  bg-white/[0.03] p-6 rounded-xl border border-white/10
                  hover:bg-white/[0.06] hover:border-white/20
                  transition-all duration-300
                  ${agent.featured ? 'ring-1 ring-amber-500/20' : ''}
                `}
              >
                <div className="flex items-center space-x-3 mb-4">
                  <div className="text-gray-400">
                    {agent.icon}
                  </div>
                  <h3 className="text-lg font-semibold text-white">{agent.name}</h3>
                </div>
                <p className="text-gray-400 text-sm leading-relaxed mb-4">
                  {agent.description}
                </p>
                {agent.author && (
                  <p className="text-xs text-gray-500">
                    by <span className="text-gray-400">{agent.author}</span>
                  </p>
                )}
              </div>
            ))}

            {/* Create your own */}
            <a
              href="https://app.observer-ai.com"
              className="group bg-transparent p-6 rounded-xl border-2 border-dashed border-white/20 hover:border-white/40 transition-all flex flex-col items-center justify-center text-center min-h-[180px]"
            >
              <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center mb-3 group-hover:bg-white/10 transition">
                <span className="text-2xl text-gray-500 group-hover:text-gray-300 transition">+</span>
              </div>
              <span className="font-semibold text-gray-400 group-hover:text-white transition">
                Create yours
              </span>
              <span className="text-xs text-gray-600 mt-1">and share it with the community</span>
            </a>
          </div>

          {/* Browse more link */}
          <div className="flex justify-center mt-12">
            <a
              href="https://app.observer-ai.com"
              className="flex items-center gap-2 text-gray-400 hover:text-white transition group"
            >
              <span>Browse all agents on the App</span>
              <ExternalLink className="w-4 h-4 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
            </a>
          </div>
        </div>
      </section>

      {/* Downloads Section */}
      <DownloadsSection />

      {/* CTA Section */}
      <section className="py-24 bg-[#0D1321]">
        <div className="container mx-auto px-6 text-center">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            Open source. Community driven.
          </h2>
          <p className="text-gray-400 max-w-lg mx-auto mb-10">
            Observer is built in the open. Create agents, contribute code,
            or just come hang out.
          </p>
          <div className="flex flex-col sm:flex-row justify-center gap-4">
            <a
              href="https://app.observer-ai.com"
              className="group bg-white text-gray-900 px-8 py-4 rounded-lg font-semibold hover:bg-gray-100 transition flex items-center justify-center space-x-2"
            >
              <span>Start Building</span>
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </a>
            <a
              href="https://github.com/Roy3838/Observer"
              className="flex items-center justify-center space-x-2 bg-white/10 hover:bg-white/15 px-8 py-4 rounded-lg font-semibold transition"
            >
              <Github className="w-5 h-5" />
              <span>Star on GitHub</span>
            </a>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 border-t border-white/5">
        <div className="container mx-auto px-6">
          <div className="flex flex-col md:flex-row justify-between items-center gap-6">
            <div className="flex items-center space-x-3">
              <img src="/eye-logo-white.svg" alt="Observer AI Logo" className="w-5 h-5 opacity-60" />
              <span className="text-gray-500 text-sm">Observer AI</span>
            </div>
            <div className="flex items-center space-x-8 text-sm text-gray-500">
              <a href="#/privacy" className="hover:text-white transition">Privacy</a>
              <a href="#/terms" className="hover:text-white transition">Terms</a>
              <a href="https://github.com/Roy3838/Observer" className="hover:text-white transition">GitHub</a>
              <a href="https://discord.gg/wnBb7ZQDUC" className="hover:text-white transition">Discord</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;
