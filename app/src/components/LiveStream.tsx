import { useState, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { X, ChevronDown } from 'lucide-react';

const POLL_INTERVAL = 2 * 60 * 1000;

export default function LiveStream() {
  const [videoId, setVideoId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(true);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const check = async () => {
      try {
        const res = await fetch('https://api.observer-ai.com/live');
        const data = await res.json();
        if (data.live && data.videoId) {
          setVideoId(data.videoId);
        } else {
          setVideoId(null);
          setDismissed(false); // reset dismiss so it shows again next stream
        }
      } catch {
        setVideoId(null);
      }
    };

    check();
    const id = setInterval(check, POLL_INTERVAL);
    return () => clearInterval(id);
  }, []);

  if (!videoId || dismissed) return null;

  return ReactDOM.createPortal(
    <div className="fixed bottom-4 right-4 z-50 flex flex-col items-end">
      {expanded && (
        <div className="mb-2 rounded-xl overflow-hidden shadow-2xl border border-gray-200 bg-black">
          <div className="flex items-center justify-between px-3 py-1.5 bg-gray-900">
            <span className="text-xs text-gray-300 font-medium">Watch me build this live!</span>
            <button
              onClick={() => setExpanded(false)}
              className="text-gray-400 hover:text-white transition ml-3"
            >
              <ChevronDown size={14} />
            </button>
          </div>
          <iframe
            src={`https://www.youtube.com/embed/${videoId}?autoplay=1&mute=1`}
            width="320"
            height="180"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            className="block"
          />
        </div>
      )}

      <div className="flex items-center gap-1">
        <button
          onClick={() => setExpanded(v => !v)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-semibold rounded-full shadow-lg transition active:scale-95"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
          Live
        </button>
        <button
          onClick={() => setDismissed(true)}
          className="flex items-center justify-center w-6 h-6 rounded-full bg-gray-200 hover:bg-gray-300 text-gray-600 transition active:scale-95"
        >
          <X size={10} />
        </button>
      </div>
    </div>,
    document.body
  );
}
