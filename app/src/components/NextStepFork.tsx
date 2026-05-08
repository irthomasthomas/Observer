import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X as CloseIcon, Sparkles, Wrench, ArrowRight } from 'lucide-react';
import { Analytics } from '@utils/analytics';

interface NextStepForkProps {
  isActive: boolean;
  source: 'tutorial_complete' | 'tutorial_dismissed';
  onChooseAiCreator: () => void;
  onChooseBuildIt: () => void;
  onDismiss: () => void;
}

const AI_CREATOR_SELECTORS = ['[data-tutorial-ai-creator]', '[data-tutorial-grid-generate]'];
const MODELHUB_SELECTOR = 'button[data-tutorial-modelhub]';

function firstVisible(selectors: string[]): Element | null {
  for (const sel of selectors) {
    const el = document.querySelector(sel);
    if (!el) continue;
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) return el;
  }
  return null;
}

const NextStepFork: React.FC<NextStepForkProps> = ({
  isActive,
  source,
  onChooseAiCreator,
  onChooseBuildIt,
  onDismiss,
}) => {
  const [aiRect, setAiRect] = useState<DOMRect | null>(null);
  const [hubRect, setHubRect] = useState<DOMRect | null>(null);
  const [snoozed, setSnoozed] = useState(false);
  const snoozeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!isActive) return;
    Analytics.forkShown(source);
  }, [isActive, source]);

  useEffect(() => {
    if (!isActive) { setSnoozed(false); if (snoozeTimer.current) clearTimeout(snoozeTimer.current); setAiRect(null); setHubRect(null); return; }
    let rafId: number;
    const loop = () => {
      const ai = firstVisible(AI_CREATOR_SELECTORS);
      const hub = document.querySelector(MODELHUB_SELECTOR);
      setAiRect(ai ? ai.getBoundingClientRect() : null);
      setHubRect(hub ? hub.getBoundingClientRect() : null);
      rafId = requestAnimationFrame(loop);
    };
    rafId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafId);
  }, [isActive]);

  if (!isActive || snoozed) return null;

  const handleSnooze = () => {
    snoozeTimer.current = setTimeout(() => setSnoozed(false), 30_000);
    setSnoozed(true);
  };

  const handleAiCreator = () => {
    Analytics.forkAiCreator(source);
    onChooseAiCreator();
  };

  const handleBuildIt = () => {
    Analytics.forkBuildIt(source);
    onChooseBuildIt();
  };

  const handleSkip = () => {
    Analytics.forkDismissed(source);
    onDismiss();
  };

  const pad = 8;
  const isMobile = window.innerWidth < 768;
  const cardWidth = isMobile ? undefined : 400;

  const cardStyle: React.CSSProperties = isMobile
    ? { left: 16, right: 16, bottom: 24 }
    : { left: '50%', transform: 'translateX(-50%)', bottom: 32, width: cardWidth };

  return createPortal(
    <>
      {/* Multi-target spotlight via SVG mask */}
      <svg
        className="fixed z-[200] pointer-events-none"
        style={{ top: 0, left: 0, width: '100vw', height: '100vh' }}
        aria-hidden
      >
        <defs>
          <mask id="next-step-fork-spot">
            <rect width="100%" height="100%" fill="white" />
            {aiRect && (
              <rect
                x={aiRect.left - pad}
                y={aiRect.top - pad}
                width={aiRect.width + pad * 2}
                height={aiRect.height + pad * 2}
                rx={12}
                fill="black"
              />
            )}
            {hubRect && (
              <rect
                x={hubRect.left - pad}
                y={hubRect.top - pad}
                width={hubRect.width + pad * 2}
                height={hubRect.height + pad * 2}
                rx={8}
                fill="black"
              />
            )}
          </mask>
        </defs>
        <rect
          width="100%"
          height="100%"
          fill="rgba(0,0,0,0.55)"
          mask="url(#next-step-fork-spot)"
        />
      </svg>

      {/* Card */}
      <div
        className="fixed z-[201] bg-white rounded-2xl shadow-2xl p-5 pointer-events-auto"
        style={{ maxWidth: 'calc(100vw - 32px)', ...cardStyle }}
      >
        <button
          onClick={handleSnooze}
          className="absolute top-3 right-3 text-gray-400 hover:text-gray-600 transition-colors"
          aria-label="Close"
        >
          <CloseIcon className="h-4 w-4" />
        </button>

        <p className="text-[10px] font-bold text-blue-600 uppercase tracking-wider mb-1">What comes next?</p>
        <h3 className="text-lg font-bold text-gray-900 mb-1 pr-6">Two ways to build your first real agent</h3>
        <p className="text-sm text-gray-600 mb-4">Pick the path that fits you, you can always switch later.</p>

        <div className="space-y-2 mb-3">
          <button
            onClick={handleAiCreator}
            className="w-full flex items-start gap-3 p-3 rounded-xl border-2 border-blue-200 bg-blue-50/50 hover:bg-blue-50 hover:border-blue-400 transition-all text-left group"
          >
            <div className="shrink-0 w-9 h-9 rounded-lg bg-blue-100 flex items-center justify-center">
              <Sparkles className="h-5 w-5 text-blue-600" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-gray-900 text-sm">Use AI Creator</span>
                <ArrowRight className="h-4 w-4 text-blue-500 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
              </div>
              <p className="text-xs text-gray-600 leading-relaxed mt-0.5">
                Describe what you want, get an agent in seconds.
              </p>
            </div>
          </button>

          <button
            onClick={handleBuildIt}
            className="w-full flex items-start gap-3 p-3 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 hover:border-gray-300 transition-all text-left group"
          >
            <div className="shrink-0 w-9 h-9 rounded-lg bg-purple-100 flex items-center justify-center">
              <Wrench className="h-5 w-5 text-purple-600" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-gray-900 text-sm">Build it yourself</span>
                <ArrowRight className="h-4 w-4 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
              </div>
              <p className="text-xs text-gray-600 leading-relaxed mt-0.5">
                Download a local model and create one manually.
              </p>
            </div>
          </button>
        </div>

        <div className="text-center">
          <button
            onClick={handleSkip}
            className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
          >
            Skip — I'll explore on my own
          </button>
        </div>
      </div>
    </>,
    document.body,
  );
};

export default NextStepFork;
