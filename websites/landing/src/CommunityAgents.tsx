import { useRef, useEffect } from 'react';
import { Plus } from 'lucide-react';
import {
  Camera, Monitor, Bell, Mail, Eye, Box, GitBranch, Package,
} from 'lucide-react';

const communityAgents = [
  {
    name: "Multi Person Tracker",
    author: "tacker.oct",
    description: "Tracks and identifies people across frames, improves its own reference images over time.",
    icon: <Camera className="w-5 h-5" />,
  },
  {
    name: "GitHub Workflow Monitor",
    author: "roymedina",
    description: "Watches a GitHub Actions status window and calls you the instant a workflow fails.",
    icon: <GitBranch className="w-5 h-5" />,
  },
  {
    name: "Focus Assistant",
    author: "yandiev",
    description: "Gentle notification nudges when you drift to distracting sites.",
    icon: <Monitor className="w-5 h-5" />,
  },
  {
    name: "Docker Downloads Complete Notifier",
    author: "roymedina",
    description: "Tracks every layer of a Docker pull and sends a Telegram alert only once everything has finished, with a low false-positive rate.",
    icon: <Package className="w-5 h-5" />,
  },
  {
    name: "Camera Person Alert",
    author: "Johnny Vinicius",
    description: "Monitors your camera and sends a photo to Telegram when someone appears.",
    icon: <Bell className="w-5 h-5" />,
  },
  {
    name: "Activity Tracker",
    author: "Kane Simmons",
    description: "Logs what you do across apps to understand how you spend your time.",
    icon: <Eye className="w-5 h-5" />,
  },
  {
    name: "Email Keyword Monitor",
    author: "roymedina",
    description: "Watches your inbox for important keywords and alerts you immediately.",
    icon: <Mail className="w-5 h-5" />,
  },
  {
    name: "Minecraft Death Notifier",
    author: "roymedina",
    description: "Watches the screen for the Minecraft death screen and pings Telegram the moment your character dies.",
    icon: <Box className="w-5 h-5" />,
  },
];

const CARD_WIDTH_CLASS = 'w-[280px] sm:w-[320px]';
const AUTOSCROLL_PX_PER_FRAME = 0.6;
// How long to hold off auto-scroll after the user stops touching/scrolling the strip.
const RESUME_DELAY_MS = 1500;

const AgentCard = ({ agent }: { agent: typeof communityAgents[number] }) => (
  <div
    data-card
    className={`${CARD_WIDTH_CLASS} shrink-0 p-6 rounded-xl border border-white/10 hover:border-white/25 transition-colors`}
  >
    <div className="flex items-center gap-3 mb-4">
      <div className="text-gray-400">{agent.icon}</div>
      <h3 className="text-base font-semibold text-white">{agent.name}</h3>
    </div>
    <p className="text-gray-400 text-sm leading-relaxed mb-4">
      {agent.description}
    </p>
    <p className="text-xs text-gray-500">
      by <span className="text-gray-400">{agent.author}</span>
    </p>
  </div>
);

const CreateCard = () => (
  <a
    href="https://app.observer-ai.com"
    data-card
    className={`${CARD_WIDTH_CLASS} shrink-0 group p-6 rounded-xl border border-dashed border-white/15 hover:border-white/30 transition-colors flex flex-col items-center justify-center text-center`}
  >
    <div className="w-9 h-9 rounded-full border border-white/15 flex items-center justify-center mb-3 group-hover:border-white/30 transition">
      <Plus className="w-4 h-4 text-gray-500 group-hover:text-gray-300 transition" />
    </div>
    <span className="font-medium text-gray-400 group-hover:text-white transition text-sm">
      Create yours
    </span>
    <span className="text-xs text-gray-600 mt-1">and share it with the community</span>
  </a>
);

const CommunityAgents = () => {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const pausedRef = useRef(false);
  const resumeTimerRef = useRef<number>(0);

  // Continuous linear auto-scroll: real scrollLeft, so native drag/wheel/touch scrolling
  // just works alongside it. Content is rendered twice back-to-back; once the strip has
  // scrolled past exactly one copy's width, we snap back by that width — seamless since
  // the two copies are identical.
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduceMotion) return;

    let raf = 0;
    const tick = () => {
      const setWidth = el.scrollWidth / 2;
      if (!pausedRef.current && setWidth > 0) {
        el.scrollLeft += AUTOSCROLL_PX_PER_FRAME;
        if (el.scrollLeft >= setWidth) el.scrollLeft -= setWidth;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    const pause = () => {
      pausedRef.current = true;
      window.clearTimeout(resumeTimerRef.current);
    };
    const resumeSoon = () => {
      window.clearTimeout(resumeTimerRef.current);
      resumeTimerRef.current = window.setTimeout(() => { pausedRef.current = false; }, RESUME_DELAY_MS);
    };

    el.addEventListener('pointerenter', pause);
    el.addEventListener('pointerleave', resumeSoon);
    el.addEventListener('touchstart', pause, { passive: true });
    el.addEventListener('touchend', resumeSoon);
    el.addEventListener('wheel', () => { pause(); resumeSoon(); }, { passive: true });

    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(resumeTimerRef.current);
      el.removeEventListener('pointerenter', pause);
      el.removeEventListener('pointerleave', resumeSoon);
      el.removeEventListener('touchstart', pause);
      el.removeEventListener('touchend', resumeSoon);
      el.removeEventListener('wheel', resumeSoon);
    };
  }, []);

  return (
    <section className="py-24 md:py-32 bg-[#0a0e17]" id="agents">
      <div className="container mx-auto px-6">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-3">
            What people built
          </h2>
          <p className="text-gray-400 max-w-2xl mx-auto">
            Cool agents made by cool people solving cool problems.
          </p>
        </div>
      </div>

      {/* Full-bleed auto-scrolling strip, still freely scrollable by hand */}
      <div
        ref={scrollerRef}
        className="flex gap-6 overflow-x-auto px-6 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {communityAgents.map((agent, idx) => <AgentCard key={`a-${idx}`} agent={agent} />)}
        <CreateCard />
        {communityAgents.map((agent, idx) => <AgentCard key={`b-${idx}`} agent={agent} />)}
        <CreateCard />
      </div>
    </section>
  );
};

export default CommunityAgents;
