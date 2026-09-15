// src/components/AttributionSplash.tsx
//
// A single-question screen shown right after ToS acceptance (before the Pro-trial
// upsell): "Where did you hear about Observer?". Answering isn't required to
// proceed — clicking any option (or Skip) both records the answer and advances the
// flow, so it never blocks onboarding. "Other" reveals a free-text input instead of
// immediately advancing, so it needs its own submit step.

import React, { useState } from 'react';
import { Compass } from 'lucide-react';
import { Analytics } from '@utils/analytics';
import type { AttributionSource } from '@utils/analytics';

interface AttributionSplashProps {
  isOpen: boolean;
  onDone: () => void;
}

// Ordered by actual channel strength (Reddit is the biggest driver right now), not
// alphabetically — first options get the most eyeballs.
const OPTIONS: { id: AttributionSource; label: string; emoji: string }[] = [
  { id: 'reddit', label: 'Reddit', emoji: '👽' },
  { id: 'github', label: 'GitHub', emoji: '💻' },
  { id: 'google', label: 'Google', emoji: '🔎' },
  { id: 'youtube', label: 'YouTube', emoji: '▶️' },
  { id: 'tiktok', label: 'TikTok', emoji: '🎵' },
  { id: 'instagram', label: 'Instagram', emoji: '📸' },
  { id: 'friend', label: 'A friend told me', emoji: '🗣️' },
];

export const AttributionSplash: React.FC<AttributionSplashProps> = ({ isOpen, onDone }) => {
  const [showOther, setShowOther] = useState(false);
  const [otherText, setOtherText] = useState('');

  React.useEffect(() => { if (isOpen) Analytics.attributionShown(); }, [isOpen]);

  if (!isOpen) return null;

  const choose = (source: AttributionSource) => {
    Analytics.attributionSelected(source);
    onDone();
  };

  const submitOther = () => {
    Analytics.attributionSelected('other', otherText.trim() || undefined);
    onDone();
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[10000] backdrop-blur-sm p-2 md:p-4">
      <div className="relative bg-white rounded-2xl shadow-xl border border-gray-200 w-full max-w-lg overflow-hidden transition-all duration-300">
        <div className="bg-gradient-to-r from-blue-600 to-purple-600 text-white px-6 py-5">
          <div className="flex items-center gap-3">
            <Compass className="h-8 w-8 flex-shrink-0" />
            <div>
              <h2 className="text-xl font-bold">One quick question</h2>
              <p className="text-sm text-blue-100 mt-1">Where did you hear about Observer?</p>
            </div>
          </div>
        </div>

        <div className="p-6">
          {!showOther ? (
            <>
              <div className="grid grid-cols-2 gap-3">
                {OPTIONS.map(opt => (
                  <button
                    key={opt.id}
                    onClick={() => choose(opt.id)}
                    className="flex items-center gap-2.5 px-4 py-3 rounded-lg border border-gray-200 bg-gray-50 hover:bg-blue-50 hover:border-blue-300 transition-colors text-left"
                  >
                    <span className="text-lg">{opt.emoji}</span>
                    <span className="text-sm font-medium text-gray-800">{opt.label}</span>
                  </button>
                ))}
                <button
                  onClick={() => setShowOther(true)}
                  className="flex items-center gap-2.5 px-4 py-3 rounded-lg border border-gray-200 bg-gray-50 hover:bg-blue-50 hover:border-blue-300 transition-colors text-left"
                >
                  <span className="text-lg">✨</span>
                  <span className="text-sm font-medium text-gray-800">Other</span>
                </button>
              </div>

              <button
                onClick={() => choose('other')}
                className="w-full mt-4 text-sm text-gray-400 hover:text-gray-600 transition-colors"
              >
                Skip
              </button>
            </>
          ) : (
            <>
              <input
                autoFocus
                type="text"
                value={otherText}
                onChange={e => setOtherText(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') submitOther(); }}
                placeholder="Where did you hear about us?"
                className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-400 text-sm text-gray-800"
              />
              <button
                onClick={submitOther}
                className="w-full mt-3 px-6 py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-lg hover:from-blue-700 hover:to-purple-700 transition-all duration-200 font-semibold text-sm"
              >
                Continue
              </button>
              <button
                onClick={() => setShowOther(false)}
                className="w-full mt-2 text-sm text-gray-400 hover:text-gray-600 transition-colors"
              >
                Back
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default AttributionSplash;
