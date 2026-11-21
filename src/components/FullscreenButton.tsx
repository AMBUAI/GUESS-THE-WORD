import { Maximize2, Minimize2 } from 'lucide-react';
import { useEffect, useState } from 'react';

interface FullscreenElement extends HTMLElement {
  webkitRequestFullscreen?: () => Promise<void> | void;
}

interface FullscreenDocument extends Document {
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void> | void;
}

export function FullscreenButton() {
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);

  useEffect(() => {
    const doc = document as FullscreenDocument;
    const syncState = () => {
      setIsFullscreen(Boolean(doc.fullscreenElement || doc.webkitFullscreenElement));
    };

    syncState();
    document.addEventListener('fullscreenchange', syncState);
    document.addEventListener('webkitfullscreenchange', syncState);

    return () => {
      document.removeEventListener('fullscreenchange', syncState);
      document.removeEventListener('webkitfullscreenchange', syncState);
    };
  }, []);

  const toggleFullscreen = async () => {
    const doc = document as FullscreenDocument;
    const root = document.documentElement as FullscreenElement;

    try {
      if (doc.fullscreenElement || doc.webkitFullscreenElement) {
        if (doc.exitFullscreen) {
          await doc.exitFullscreen();
        } else if (doc.webkitExitFullscreen) {
          await doc.webkitExitFullscreen();
        }
      } else if (root.requestFullscreen) {
        await root.requestFullscreen();
      } else if (root.webkitRequestFullscreen) {
        await root.webkitRequestFullscreen();
      }
    } catch {
      // Gracefully ignore if fullscreen is blocked by browser/iframe policy
    }
  };

  return (
    <button
      type="button"
      onClick={() => void toggleFullscreen()}
      aria-label={isFullscreen ? 'Exit full screen' : 'Enter full screen'}
      className="inline-flex items-center gap-2 px-3.5 py-2 min-h-[44px] rounded-xl border border-[#D8D1C5] bg-white hover:bg-[#FAF9F5] text-sm font-semibold text-[#151B26] transition-colors whitespace-nowrap shrink-0"
    >
      {isFullscreen ? (
        <Minimize2 className="w-4 h-4 text-[#E84A27]" />
      ) : (
        <Maximize2 className="w-4 h-4 text-[#E84A27]" />
      )}
      <span className="hidden sm:inline">{isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}</span>
    </button>
  );
}
